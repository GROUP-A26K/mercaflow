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
  BULK_OPERATION_BY_ID_QUERY,
  BULK_OPERATION_RUN_MUTATION,
  CURRENT_BULK_OPERATION_QUERY,
  WEBHOOK_SUBSCRIPTION_CREATE_MUTATION,
  isBulkOperationRunning,
  parseBulkOperationNode,
  parseBulkOperationRunResult,
  parseCurrentBulkOperation,
  parseExistingBulkFinishWebhook,
  type BulkOperationRef,
} from "@/lib/shopify/bulk";
import { streamJsonlNodes } from "@/lib/shopify/jsonl";
import { toRawRecord, type RawRecordInsert } from "@/lib/shopify/raw-record";
import { ensureIncrementalWebhooks } from "@/lib/shopify/webhook-subscriptions";

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
  /**
   * URL du endpoint des webhooks incrémentaux (MER-27). Si fournie, on abonne aussi les
   * topics products/inventory/uninstalled → le graph reste frais sans re-scan complet.
   */
  incrementalCallbackUrl?: string;
}

/**
 * Démarre l'import initial du catalogue : abonne les webhooks (finish bulk + incrémentaux),
 * vérifie qu'aucune bulk query n'est en cours (contrainte Shopify « 1 bulk query / shop »),
 * puis lance la bulk query.
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

  // APRÈS le pré-check « 1 bulk / shop » : sinon un échec d'abonnement incrémental sur le
  // chemin « bulk déjà en cours » masquerait le BulkAlreadyRunningError (→ 409) attendu, et
  // ferait des appels Shopify inutiles à chaque retry.
  if (params.incrementalCallbackUrl) {
    await ensureIncrementalWebhooks(
      params.client,
      params.incrementalCallbackUrl,
    );
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
  /** Id de l'opération annoncée par le webhook : on récupère CETTE op par son id. */
  bulkOperationId: string;
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
 * Traite la fin d'une bulk operation : récupère l'opération PRÉCISE (par son id, via
 * `node(id:)` — pas `currentBulkOperation` qui pourrait pointer une autre op ou être en
 * retard de cohérence), streame le JSONL et insère les `raw_records` par lots (sans tout
 * charger en RAM). Sur statut non-COMPLETED, n'ingère rien et remonte le statut/erreur.
 */
export async function processBulkOperationFinish(
  params: ProcessFinishParams,
): Promise<ProcessFinishResult> {
  const streamText = params.streamText ?? streamTextFromUrl;
  const insert = params.insert ?? insertRawRecords;

  const operation = parseBulkOperationNode(
    await params.client.query(BULK_OPERATION_BY_ID_QUERY, {
      id: params.bulkOperationId,
    }),
  );
  if (!operation) {
    return { status: "none", ingested: 0, errorCode: null };
  }
  if (operation.status !== "COMPLETED") {
    return {
      status: operation.status,
      ingested: 0,
      errorCode: operation.errorCode,
    };
  }
  if (!operation.url) {
    // COMPLETED sans url : normalement = catalogue vide. MAIS Shopify peut renvoyer
    // COMPLETED avec une url pas encore disponible alors qu'il y a des objets → ne pas
    // confondre avec un vrai catalogue vide. Si objectCount > 0, statut `url_missing`
    // distinct (journalisé côté webhook ; re-déclencher re-fetch tout, idempotent).
    const count =
      operation.objectCount != null ? Number(operation.objectCount) : 0;
    if (Number.isFinite(count) && count > 0) {
      return { status: "url_missing", ingested: 0, errorCode: null };
    }
    return { status: operation.status, ingested: 0, errorCode: null };
  }

  let batch: RawRecordInsert[] = [];
  let ingested = 0;
  const flush = async () => {
    if (batch.length === 0) return;
    await insert(batch);
    ingested += batch.length;
    batch = [];
  };

  for await (const node of streamJsonlNodes(streamText(operation.url))) {
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

  // Vérifier l'exhaustivité : `objectCount` = nombre total d'objets du JSONL (toutes lignes).
  // Un download tronqué laisserait un catalogue partiel passé pour un succès → statut
  // `incomplete` distinct, journalisé côté webhook (re-déclencher re-fetch tout, idempotent).
  const expected =
    operation.objectCount != null ? Number(operation.objectCount) : null;
  if (expected != null && Number.isFinite(expected) && ingested !== expected) {
    return { status: "incomplete", ingested, errorCode: null };
  }

  return { status: operation.status, ingested, errorCode: null };
}
