import "server-only";

import {
  persistProductAudit,
  readConnectionScoringInput,
} from "@/lib/data/scoring";
import type { ShopifyConnection } from "@/lib/data/shopify-connections";
import {
  fetchDiscoverability,
  type FetchLike,
} from "@/lib/shopify/discoverability";
import { PUS_DIMENSIONS, scoreProduct } from "@/lib/shopify/scoring";

// Orchestration de l'audit PUS (MER-29). Pour chaque produit canonique d'une connexion :
// fetch de la découvrabilité (PDP), scoring des 7 dimensions, persistance append-only d'un
// snapshot (audits/scores/variant_eligibility). Déclenché après la normalisation (bulk finish).

/** Identifiant du scorer (colonne `audits.model`) : notre heuristique V1, pas un LLM. */
const PUS_MODEL = "pus-v1";

/**
 * Concurrence des fetch de découvrabilité : on interroge le storefront du marchand → rester
 * modéré (ne pas le marteler). Pour de très gros catalogues, une file/échantillonnage = suivi.
 */
const AUDIT_CONCURRENCY = 5;

export interface AuditRunResult {
  products: number;
  failed: number;
}

export interface RunAuditOptions {
  /** Fetch injectable (tests). */
  fetchImpl?: FetchLike;
}

/**
 * Audite tout le catalogue canonique d'une connexion. Isolation par produit : l'échec d'un
 * produit est journalisé et n'interrompt pas les autres (re-run = nouveau snapshot, jamais
 * d'update). Concurrence bornée pour ménager le storefront.
 */
export async function runConnectionAudit(
  connection: ShopifyConnection,
  options: RunAuditOptions = {},
): Promise<AuditRunResult> {
  const rows = await readConnectionScoringInput(connection.id);
  const context = { scorer: PUS_MODEL, dimensions: PUS_DIMENSIONS.length };
  let failed = 0;
  let cursor = 0;

  const worker = async (): Promise<void> => {
    while (cursor < rows.length) {
      const row = rows[cursor++];
      try {
        const discoverability = await fetchDiscoverability(
          row.scoring.pdp_url,
          options.fetchImpl,
        );
        const { scores, eligibility } = scoreProduct(
          row.scoring,
          discoverability,
        );
        await persistProductAudit({
          orgId: row.orgId,
          productId: row.productId,
          model: PUS_MODEL,
          context,
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

  return { products: rows.length, failed };
}
