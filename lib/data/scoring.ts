import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type {
  DimensionScore,
  ScoringProduct,
  VariantEligibility,
} from "@/lib/shopify/scoring";

// DATA ACCESS LAYER — scoring PUS (MER-29). Lecture des entités canoniques (couche 2) →
// entrée du scorer ; écriture APPEND-ONLY des snapshots (audits / scores / variant_eligibility).
// Service-role : l'audit tourne côté serveur (après normalisation), sans session Clerk.

const PRODUCTS_PAGE_SIZE = 500;
/** Pagination des attributs (l'API REST Supabase plafonne à 1000 lignes/req). */
const ATTRIBUTES_PAGE_SIZE = 1000;
/**
 * Nb d'`owner_id` par filtre `.in()` : PostgREST envoie le filtre dans l'URL (~8 Ko max) ;
 * un UUID ≈ 36 car. → on borne à 100 ids/requête (~3,6 Ko) pour ne pas dépasser la limite.
 */
const ATTR_OWNER_BATCH = 100;

/** Entrée de scoring d'un produit : la forme pour le scorer + les ids pour la persistance. */
export interface ProductScoringRow {
  productId: string;
  orgId: string;
  scoring: ScoringProduct;
  /** GID variant → id uuid (pour rattacher `variant_eligibility`). */
  variantIdByGid: Record<string, string>;
}

interface VariantRow {
  id: string;
  shopify_variant_id: string;
  gtin: string | null;
  price: number | null;
  availability: string | null;
  inventory_qty: number | null;
}

interface ProductRow {
  id: string;
  org_id: string;
  title: string | null;
  description_html: string | null;
  vendor: string | null;
  status: string | null;
  pdp_url: string | null;
  variants: VariantRow[];
}

/**
 * Lit les produits canoniques d'une connexion (variants imbriqués + attributs produit) et
 * les transforme en entrées de scoring. Paginé (plafond REST Supabase).
 */
export async function readConnectionScoringInput(
  connectionId: string,
): Promise<ProductScoringRow[]> {
  const supabase = createAdminClient();
  const productRows: ProductRow[] = [];
  for (let from = 0; ; from += PRODUCTS_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("products")
      .select(
        "id, org_id, title, description_html, vendor, status, pdp_url, " +
          "variants(id, shopify_variant_id, gtin, price, availability, inventory_qty)",
      )
      .eq("connection_id", connectionId)
      .order("id", { ascending: true })
      .range(from, from + PRODUCTS_PAGE_SIZE - 1);
    if (error) {
      throw new Error(
        `Lecture des produits (scoring) échouée : ${error.message}`,
      );
    }
    const page = (data ?? []) as unknown as ProductRow[];
    productRows.push(...page);
    if (page.length < PRODUCTS_PAGE_SIZE) break;
  }

  const attributesByProduct = await readProductAttributes(
    supabase,
    productRows.map((p) => p.id),
  );

  return productRows.map((row) => {
    const variantIdByGid: Record<string, string> = {};
    for (const variant of row.variants) {
      variantIdByGid[variant.shopify_variant_id] = variant.id;
    }
    return {
      productId: row.id,
      orgId: row.org_id,
      variantIdByGid,
      scoring: {
        title: row.title,
        description_html: row.description_html,
        vendor: row.vendor,
        status: row.status,
        pdp_url: row.pdp_url,
        attributes: attributesByProduct.get(row.id) ?? [],
        variants: row.variants.map((v) => ({
          shopify_variant_id: v.shopify_variant_id,
          gtin: v.gtin,
          price: v.price,
          availability: v.availability,
          inventory_qty: v.inventory_qty,
        })),
      },
    };
  });
}

async function readProductAttributes(
  supabase: ReturnType<typeof createAdminClient>,
  productIds: readonly string[],
): Promise<Map<string, ScoringProduct["attributes"]>> {
  const byProduct = new Map<string, ScoringProduct["attributes"]>();
  if (productIds.length === 0) return byProduct;
  for (let from = 0; from < productIds.length; from += ATTR_OWNER_BATCH) {
    const slice = productIds.slice(from, from + ATTR_OWNER_BATCH);
    // Pagination INTERNE : un lot de 100 produits peut porter > 1000 attributs → sans `range`,
    // PostgREST tronque silencieusement (specs/intent calculés sur un set incomplet).
    for (let offset = 0; ; offset += ATTRIBUTES_PAGE_SIZE) {
      const { data, error } = await supabase
        .from("attributes")
        .select("owner_id, namespace, key, value")
        .eq("owner_type", "product")
        .in("owner_id", slice)
        .order("id", { ascending: true })
        .range(offset, offset + ATTRIBUTES_PAGE_SIZE - 1);
      if (error) {
        throw new Error(
          `Lecture des attributs (scoring) échouée : ${error.message}`,
        );
      }
      const page = (data ?? []) as {
        owner_id: string;
        namespace: string;
        key: string;
        value: string | null;
      }[];
      for (const attr of page) {
        const list = byProduct.get(attr.owner_id) ?? [];
        list.push({
          namespace: attr.namespace,
          key: attr.key,
          value: attr.value,
        });
        byProduct.set(attr.owner_id, list);
      }
      if (page.length < ATTRIBUTES_PAGE_SIZE) break;
    }
  }
  return byProduct;
}

export interface PersistAuditParams {
  orgId: string;
  productId: string;
  model: string;
  context: Record<string, unknown>;
  scores: readonly DimensionScore[];
  eligibility: readonly VariantEligibility[];
  variantIdByGid: Record<string, string>;
}

/**
 * Persiste un snapshot d'audit pour UN produit (append-only) : 1 ligne `audits`, puis ses
 * `scores` (1/dimension) et `variant_eligibility` (1/variant) en lots. Jamais d'UPDATE.
 */
export async function persistProductAudit(
  params: PersistAuditParams,
): Promise<void> {
  const supabase = createAdminClient();

  const { data: auditRow, error: auditError } = await supabase
    .from("audits")
    .insert({
      org_id: params.orgId,
      product_id: params.productId,
      model: params.model,
      context: params.context,
    })
    .select("id")
    .single();
  if (auditError || !auditRow) {
    throw new Error(
      `Insertion audit échouée (${params.productId}) : ${auditError?.message ?? "aucune ligne"}`,
    );
  }
  const auditId = (auditRow as { id: string }).id;

  // Pas de transaction multi-statements côté PostgREST : on compense manuellement. Si un
  // insert ultérieur échoue, on SUPPRIME l'audit (cascade → scores + variant_eligibility) →
  // pas de snapshot partiel qui deviendrait « current » via la vue DISTINCT ON. (Atomicité
  // stricte via RPC/stored proc = suivi.)
  try {
    const scoreRows = params.scores.map((score) => ({
      org_id: params.orgId,
      audit_id: auditId,
      product_id: params.productId,
      dimension: score.dimension,
      value: score.value,
      evidence: score.evidence,
    }));
    const { error: scoresError } = await supabase
      .from("scores")
      .insert(scoreRows);
    if (scoresError) {
      throw new Error(`Insertion scores échouée : ${scoresError.message}`);
    }

    const eligibilityRows = params.eligibility
      .map((e) => {
        const variantId = params.variantIdByGid[e.shopify_variant_id];
        return variantId
          ? {
              org_id: params.orgId,
              audit_id: auditId,
              variant_id: variantId,
              issues: e.issues,
            }
          : null;
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);
    if (eligibilityRows.length > 0) {
      const { error: eligError } = await supabase
        .from("variant_eligibility")
        .insert(eligibilityRows);
      if (eligError) {
        throw new Error(
          `Insertion variant_eligibility échouée : ${eligError.message}`,
        );
      }
    }
  } catch (error) {
    // Rollback best-effort : ne JAMAIS masquer l'erreur d'origine si la suppression échoue.
    // Si le delete rate (réseau), on journalise (snapshot partiel possible) et on relance
    // l'erreur initiale — un re-run (idempotent au sens append-only) ré-audite le produit.
    try {
      const { error: rollbackError } = await supabase
        .from("audits")
        .delete()
        .eq("id", auditId);
      if (rollbackError) {
        console.error(
          `Rollback de l'audit ${auditId} échoué (snapshot partiel possible) : ${rollbackError.message}`,
        );
      }
    } catch (rollbackThrow) {
      const message =
        rollbackThrow instanceof Error
          ? rollbackThrow.message
          : String(rollbackThrow);
      console.error(`Rollback de l'audit ${auditId} a levé : ${message}`);
    }
    throw error;
  }
}
