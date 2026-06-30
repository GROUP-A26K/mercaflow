import "server-only";

import {
  insertRawRecords,
  RAW_RECORDS_BATCH_SIZE,
} from "@/lib/data/raw-records";
import type { ShopifyConnection } from "@/lib/data/shopify-connections";
import {
  streamTextFromUrl,
  type AdminGraphQLClient,
} from "@/lib/shopify/admin-graphql";
import {
  BULK_CATALOG_QUERY,
  BULK_FINISH_WEBHOOKS_QUERY,
  BULK_OPERATION_RUN_MUTATION,
  CURRENT_BULK_OPERATION_QUERY,
  WEBHOOK_SUBSCRIPTION_CREATE_MUTATION,
  isBulkOperationRunning,
  parseBulkOperationRunResult,
  parseCurrentBulkOperation,
  parseExistingBulkFinishWebhook,
  type BulkOperationRef,
} from "@/lib/shopify/bulk";
import { streamJsonlNodes } from "@/lib/shopify/jsonl";
import { toRawRecord, type RawRecordInsert } from "@/lib/shopify/raw-record";

// Orchestration de l'ingestion bulk (MER-26).
// Flux : démarrage (abonnement webhook → garde 1-bulk/shop → bulkOperationRunQuery), puis
// à réception du webhook `bulk_operations/finish` : récupération de l'url JSONL et
// streaming vers `raw_records`. PAS de polling.

/** Chemin du webhook `bulk_operations/finish` (public, vérifié par HMAC, cf. proxy.ts). */
export const BULK_FINISH_WEBHOOK_PATH =
  "/api/shopify/webhooks/bulk-operations-finish";

/** Levée quand une bulk query tourne déjà pour la boutique (→ 409 côté route, pas 502). */
export class BulkAlreadyRunningError extends Error {
  constructor(
    message = "Une bulk query est déjà en cours pour cette boutique (1 bulk query / shop).",
  ) {
    super(message);
    this.name = "BulkAlreadyRunningError";
  }
}

interface UserError {
  message: string;
}

/**
 * Garantit l'existence de l'abonnement webhook `bulk_operations/finish` pointant vers
 * `callbackUrl`. Idempotent : ne recrée pas un abonnement déjà présent.
 */
export async function ensureBulkFinishWebhook(
  client: AdminGraphQLClient,
  callbackUrl: string,
): Promise<void> {
  const existing = parseExistingBulkFinishWebhook(
    await client.query(BULK_FINISH_WEBHOOKS_QUERY),
    callbackUrl,
  );
  if (existing) return;

  const response = (await client.query(WEBHOOK_SUBSCRIPTION_CREATE_MUTATION, {
    callbackUrl,
  })) as {
    data?: { webhookSubscriptionCreate?: { userErrors: UserError[] } };
    errors?: UserError[];
  };
  if (response.errors && response.errors.length > 0) {
    throw new Error(
      `Création du webhook bulk échouée : ${response.errors.map((e) => e.message).join("; ")}`,
    );
  }
  const userErrors = response.data?.webhookSubscriptionCreate?.userErrors ?? [];
  if (userErrors.length > 0) {
    throw new Error(
      `Création du webhook bulk rejetée : ${userErrors.map((e) => e.message).join("; ")}`,
    );
  }
}

export interface StartIngestionParams {
  client: AdminGraphQLClient;
  callbackUrl: string;
}

/**
 * Démarre l'import initial du catalogue : abonne le webhook, vérifie qu'aucune bulk query
 * n'est en cours (contrainte Shopify « 1 bulk query / shop »), puis lance la bulk query.
 */
export async function startCatalogIngestion(
  params: StartIngestionParams,
): Promise<BulkOperationRef> {
  await ensureBulkFinishWebhook(params.client, params.callbackUrl);

  const current = parseCurrentBulkOperation(
    await params.client.query(CURRENT_BULK_OPERATION_QUERY),
  );
  if (current && isBulkOperationRunning(current.status)) {
    throw new BulkAlreadyRunningError();
  }

  try {
    return parseBulkOperationRunResult(
      await params.client.query(BULK_OPERATION_RUN_MUTATION, {
        query: BULK_CATALOG_QUERY,
      }),
    );
  } catch (error) {
    // Course entre le pré-check et la mutation : Shopify peut rejeter avec un userError
    // « already running » → le mapper aussi sur BulkAlreadyRunningError (→ 409, pas 502).
    if (error instanceof Error && /already running/i.test(error.message)) {
      throw new BulkAlreadyRunningError(error.message);
    }
    throw error;
  }
}

export interface ProcessFinishParams {
  client: AdminGraphQLClient;
  connection: ShopifyConnection;
  /**
   * Id de l'opération annoncée par le webhook. Si fourni et qu'il diffère de l'opération
   * courante côté Shopify, on n'ingère rien (statut `stale`) : une nouvelle bulk a été
   * lancée entre-temps → éviter d'ingérer le mauvais JSONL ou de droper celui attendu.
   */
  expectedOperationId?: string;
  /** Téléchargement du JSONL (injectable pour les tests). */
  streamText?: (url: string) => AsyncIterable<string>;
  /** Écriture des raw_records (injectable pour les tests). */
  insert?: (records: readonly RawRecordInsert[]) => Promise<void>;
}

export interface ProcessFinishResult {
  status: string;
  ingested: number;
  errorCode: string | null;
}

/**
 * Traite la fin d'une bulk operation : récupère son url, streame le JSONL et insère les
 * `raw_records` par lots (sans tout charger en RAM). Sur statut non-COMPLETED, n'ingère
 * rien et remonte le statut/erreur pour journalisation côté webhook.
 */
export async function processBulkOperationFinish(
  params: ProcessFinishParams,
): Promise<ProcessFinishResult> {
  const streamText = params.streamText ?? streamTextFromUrl;
  const insert = params.insert ?? insertRawRecords;

  const current = parseCurrentBulkOperation(
    await params.client.query(CURRENT_BULK_OPERATION_QUERY),
  );
  if (!current) {
    return { status: "none", ingested: 0, errorCode: null };
  }
  if (params.expectedOperationId && current.id !== params.expectedOperationId) {
    // L'opération courante n'est pas celle annoncée par le webhook (une autre bulk a
    // démarré entre-temps) → ne rien ingérer.
    return { status: "stale", ingested: 0, errorCode: null };
  }
  if (current.status !== "COMPLETED") {
    return {
      status: current.status,
      ingested: 0,
      errorCode: current.errorCode,
    };
  }
  if (!current.url) {
    // COMPLETED sans url = aucun objet (catalogue vide).
    return { status: current.status, ingested: 0, errorCode: null };
  }

  let batch: RawRecordInsert[] = [];
  let ingested = 0;
  const flush = async () => {
    if (batch.length === 0) return;
    await insert(batch);
    ingested += batch.length;
    batch = [];
  };

  for await (const node of streamJsonlNodes(streamText(current.url))) {
    batch.push(
      toRawRecord({
        orgId: params.connection.orgId,
        connectionId: params.connection.id,
        node,
      }),
    );
    if (batch.length >= RAW_RECORDS_BATCH_SIZE) await flush();
  }
  await flush();

  return { status: current.status, ingested, errorCode: null };
}
