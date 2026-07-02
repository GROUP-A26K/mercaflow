import "server-only";

import {
  persistProductAudit,
  readConnectionScoringInput,
  readConnectionScoringInputPage,
  type ProductScoringRow,
} from "@/lib/data/scoring";
import type { ShopifyConnection } from "@/lib/data/shopify-connections";
import {
  fetchDiscoverability,
  type FetchLike,
} from "@/lib/shopify/discoverability";
import { PUS_DIMENSIONS, scoreProduct } from "@/lib/shopify/scoring";

// Orchestration de l'audit PUS (MER-29). Pour chaque produit canonique d'une connexion :
// fetch de la découvrabilité (PDP), scoring des 7 dimensions, persistance append-only d'un
// snapshot (audits/scores/variant_eligibility). Le chemin DURABLE (MER-58) audite par pages
// keyset (`runAuditBatch`), piloté par le worker cron `background_jobs`.

/** Identifiant du scorer (colonne `audits.model`) : notre heuristique V1, pas un LLM. */
const PUS_MODEL = "pus-v1";

/**
 * Concurrence des fetch de découvrabilité : on interroge le storefront du marchand → rester
 * modéré (ne pas le marteler).
 */
const AUDIT_CONCURRENCY = 5;

const AUDIT_CONTEXT = { scorer: PUS_MODEL, dimensions: PUS_DIMENSIONS.length };

export interface AuditRunResult {
  products: number;
  failed: number;
}

export interface RunAuditOptions {
  /** Fetch injectable (tests). */
  fetchImpl?: FetchLike;
}

/**
 * Audite une liste de produits avec isolation par produit (un échec est journalisé et
 * n'interrompt pas les autres — re-run = nouveau snapshot, jamais d'update) et concurrence
 * bornée pour ménager le storefront. Renvoie le nombre traité + le nombre d'échecs.
 */
async function auditRows(
  rows: readonly ProductScoringRow[],
  fetchImpl?: FetchLike,
): Promise<{ processed: number; failed: number }> {
  let failed = 0;
  let cursor = 0;

  const worker = async (): Promise<void> => {
    while (cursor < rows.length) {
      const row = rows[cursor++];
      try {
        const discoverability = await fetchDiscoverability(
          row.scoring.pdp_url,
          fetchImpl,
        );
        const { scores, eligibility } = scoreProduct(
          row.scoring,
          discoverability,
        );
        await persistProductAudit({
          orgId: row.orgId,
          productId: row.productId,
          model: PUS_MODEL,
          context: AUDIT_CONTEXT,
          scores,
          eligibility,
          variantIdByGid: row.variantIdByGid,
        });
      } catch (error) {
        failed += 1;
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Audit du produit ${row.productId} échoué : ${message}`);
      }
    }
  };

  const workers = Math.min(AUDIT_CONCURRENCY, Math.max(rows.length, 1));
  await Promise.all(Array.from({ length: workers }, worker));

  return { processed: rows.length, failed };
}

/**
 * Audite TOUT le catalogue canonique d'une connexion en une passe (charge tout en mémoire).
 * Réservé aux petits volumes / usage manuel ; le chemin durable passe par `runAuditBatch`.
 */
export async function runConnectionAudit(
  connection: ShopifyConnection,
  options: RunAuditOptions = {},
): Promise<AuditRunResult> {
  const rows = await readConnectionScoringInput(connection.id);
  const { processed, failed } = await auditRows(rows, options.fetchImpl);
  return { products: processed, failed };
}

export interface RunAuditBatchOptions {
  /** Curseur keyset (dernier `product.id` de la page précédente) ; null = début du catalogue. */
  afterCursor: string | null;
  /** Taille de page (nombre de produits audités par batch). */
  pageSize: number;
  /** Fetch injectable (tests). */
  fetchImpl?: FetchLike;
}

export interface AuditBatchResult {
  processed: number;
  failed: number;
  /** Curseur à persister pour la page suivante ; null quand `done`. */
  nextCursor: string | null;
  /** true quand la page était incomplète → catalogue épuisé. */
  done: boolean;
}

/**
 * Audite UNE page de produits (keyset). Brique du worker durable (MER-58) : le worker persiste
 * `nextCursor` après chaque page committée → reprise idempotente (un crash ré-audite au pire la
 * page en cours, sans perte ni saut). La page entière est traitée avant d'avancer le curseur.
 */
export async function runAuditBatch(
  connection: ShopifyConnection,
  options: RunAuditBatchOptions,
): Promise<AuditBatchResult> {
  const page = await readConnectionScoringInputPage(
    connection.id,
    options.afterCursor,
    options.pageSize,
  );
  const { processed, failed } = await auditRows(page.rows, options.fetchImpl);
  return { processed, failed, nextCursor: page.nextCursor, done: page.done };
}
