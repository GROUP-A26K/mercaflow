import "server-only";

import {
  getGtinCoverageForConnection,
  readConnectionRawRecords,
  upsertNormalizedProduct,
} from "@/lib/data/catalog";
import type { ShopifyConnection } from "@/lib/data/shopify-connections";
import {
  normalizeRawRecords,
  type GtinCoverage,
} from "@/lib/shopify/normalize";

// Orchestration de la normalisation (MER-28). Lit les `raw_records` d'une connexion (bulk +
// webhooks REST confondus), les agrège en produits canoniques et les upserte. Déclenchée
// automatiquement à la fin d'une ingestion bulk (cf. route bulk-operations-finish).

export interface NormalizeCatalogResult {
  products: number;
  failed: number;
  gtin: GtinCoverage;
}

/**
 * Normalise tout le catalogue d'une connexion : `raw_records` → products / variants /
 * attributes, puis calcule la couverture GTIN (signal d'audit). Idempotent (upserts).
 * Isolation par produit : l'échec d'un produit est journalisé et n'empêche PAS les suivants
 * (un re-run, idempotent, réparera les échecs transitoires).
 */
export async function normalizeConnectionCatalog(
  connection: ShopifyConnection,
): Promise<NormalizeCatalogResult> {
  const rows = await readConnectionRawRecords(connection.id);
  const products = normalizeRawRecords(rows, {
    orgId: connection.orgId,
    connectionId: connection.id,
  });

  let failed = 0;
  for (const product of products) {
    try {
      await upsertNormalizedProduct(product);
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `Normalisation du produit ${product.product.shopify_product_id} échouée : ${message}`,
      );
    }
  }

  const gtin = await getGtinCoverageForConnection(connection.id);
  return { products: products.length, failed, gtin };
}
