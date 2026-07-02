import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type {
  GtinCoverage,
  NormalizedProduct,
  RawRecordRow,
} from "@/lib/shopify/normalize";

// DATA ACCESS LAYER — catalogue canonique (MER-28). Écritures via le client SERVICE-ROLE :
// la normalisation tourne côté serveur (fin d'ingestion bulk / webhook), sans session Clerk.
// L'`org_id` est porté par chaque ligne (issu de la connexion), jamais d'une entrée utilisateur.

/** Taille de page pour lire les `raw_records` (l'API REST Supabase plafonne à 1000/req). */
const RAW_RECORDS_PAGE_SIZE = 1000;

/**
 * Lit tous les `raw_records` d'une connexion (paginé). La normalisation dédoublonne ensuite
 * par `external_id` (append-only → plusieurs observations d'un même objet).
 */
export async function readConnectionRawRecords(
  connectionId: string,
): Promise<RawRecordRow[]> {
  const supabase = createAdminClient();
  const rows: RawRecordRow[] = [];
  for (let from = 0; ; from += RAW_RECORDS_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("raw_records")
      .select("external_id, resource_type, payload, fetched_at")
      .eq("connection_id", connectionId)
      .order("fetched_at", { ascending: true })
      .range(from, from + RAW_RECORDS_PAGE_SIZE - 1);
    if (error) {
      throw new Error(`Lecture des raw_records échouée : ${error.message}`);
    }
    const page = (data ?? []) as RawRecordRow[];
    rows.push(...page);
    if (page.length < RAW_RECORDS_PAGE_SIZE) break;
  }
  return rows;
}

/**
 * Upserte un produit canonique + ses variants + ses attributs (idempotent via les contraintes
 * d'unicité). L'ordre est imposé par les FK : produit d'abord (id → attributs produit + FK
 * variants), puis chaque variant (id → ses attributs). Ne supprime PAS les variants/attributs
 * devenus absents (upsert-only en V1 ; le nettoyage des orphelins est un suivi).
 */
export async function upsertNormalizedProduct(
  normalized: NormalizedProduct,
): Promise<void> {
  const supabase = createAdminClient();
  const orgId = normalized.product.org_id;

  const { data: productRow, error: productError } = await supabase
    .from("products")
    .upsert(normalized.product, {
      onConflict: "connection_id,shopify_product_id",
    })
    .select("id")
    .single();
  if (productError || !productRow) {
    throw new Error(
      `Upsert produit échoué (${normalized.product.shopify_product_id}) : ${productError?.message ?? "aucune ligne"}`,
    );
  }
  const productId = (productRow as { id: string }).id;

  const attributeRows: Record<string, unknown>[] = normalized.attributes.map(
    (attr) => ({
      org_id: orgId,
      owner_type: "product",
      owner_id: productId,
      namespace: attr.namespace,
      key: attr.key,
      value: attr.value,
      value_type: attr.value_type,
    }),
  );

  // Upsert des variants en UN SEUL appel (évite le N+1 et réduit la surface d'écriture
  // partielle). On récupère les ids par `shopify_variant_id` pour rattacher les attributs.
  if (normalized.variants.length > 0) {
    const { data: variantRows, error: variantError } = await supabase
      .from("variants")
      .upsert(
        normalized.variants.map((variant) => ({
          org_id: orgId,
          product_id: productId,
          shopify_variant_id: variant.shopify_variant_id,
          sku: variant.sku,
          gtin: variant.gtin,
          price: variant.price,
          currency: variant.currency,
          inventory_qty: variant.inventory_qty,
          availability: variant.availability,
          position: variant.position,
        })),
        { onConflict: "product_id,shopify_variant_id" },
      )
      .select("id, shopify_variant_id");
    if (variantError || !variantRows) {
      throw new Error(
        `Upsert variants échoué (${normalized.product.shopify_product_id}) : ${variantError?.message ?? "aucune ligne"}`,
      );
    }
    const idByVariantGid = new Map(
      (variantRows as { id: string; shopify_variant_id: string }[]).map(
        (row) => [row.shopify_variant_id, row.id],
      ),
    );
    for (const variant of normalized.variants) {
      const variantId = idByVariantGid.get(variant.shopify_variant_id);
      if (!variantId) continue;
      for (const attr of variant.attributes) {
        attributeRows.push({
          org_id: orgId,
          owner_type: "variant",
          owner_id: variantId,
          namespace: attr.namespace,
          key: attr.key,
          value: attr.value,
          value_type: attr.value_type,
        });
      }
    }
  }

  if (attributeRows.length > 0) {
    const { error: attrError } = await supabase
      .from("attributes")
      .upsert(attributeRows, {
        onConflict: "owner_type,owner_id,namespace,key",
      });
    if (attrError) {
      throw new Error(`Upsert attributs échoué : ${attrError.message}`);
    }
  }
}

/**
 * Couverture GTIN d'une connexion : part des variants (SKU) avec un `gtin` renseigné.
 * Signal d'audit (« X % des SKU sans GTIN → invisibles aux agents »). Deux comptes `head`
 * (total, avec GTIN) scopés par connexion via jointure sur `products`.
 */
export async function getGtinCoverageForConnection(
  connectionId: string,
): Promise<GtinCoverage> {
  const supabase = createAdminClient();

  const totalQuery = supabase
    .from("variants")
    .select("id, products!inner(connection_id)", { count: "exact", head: true })
    .eq("products.connection_id", connectionId);
  const withGtinQuery = supabase
    .from("variants")
    .select("id, products!inner(connection_id)", { count: "exact", head: true })
    .eq("products.connection_id", connectionId)
    // Cohérent avec `gtinCoverage` (pur) : un GTIN présent = non-null ET non-vide.
    .not("gtin", "is", null)
    .neq("gtin", "");

  const [totalRes, withGtinRes] = await Promise.all([
    totalQuery,
    withGtinQuery,
  ]);
  if (totalRes.error || withGtinRes.error) {
    throw new Error(
      `Calcul couverture GTIN échoué : ${(totalRes.error ?? withGtinRes.error)?.message}`,
    );
  }

  const total = totalRes.count ?? 0;
  const withGtin = withGtinRes.count ?? 0;
  return {
    total,
    withGtin,
    missing: total - withGtin,
    ratio: total === 0 ? 0 : withGtin / total,
  };
}
