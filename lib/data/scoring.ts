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

/** Colonnes produit + variants imbriqués nécessaires au scoring (réutilisé full + paginé). */
const PRODUCT_SELECT =
  "id, org_id, title, description_html, vendor, status, pdp_url, " +
  "variants(id, shopify_variant_id, gtin, price, availability, inventory_qty)";

/** Transforme une ligne produit (variants imbriqués) + ses attributs en entrée de scoring. */
function toScoringRow(
  row: ProductRow,
  attributesByProduct: Map<string, ScoringProduct["attributes"]>,
): ProductScoringRow {
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
}

/**
 * Lit les produits canoniques d'une connexion (variants imbriqués + attributs produit) et
 * les transforme en entrées de scoring. Paginé (plafond REST Supabase). Charge TOUT le
 * catalogue en mémoire → réservé aux petits volumes ; le chemin durable (MER-58) utilise
 * `readConnectionScoringInputPage`.
 */
export async function readConnectionScoringInput(
  connectionId: string,
): Promise<ProductScoringRow[]> {
  const supabase = createAdminClient();
  const productRows: ProductRow[] = [];
  for (let from = 0; ; from += PRODUCTS_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("products")
      .select(PRODUCT_SELECT)
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

  return productRows.map((row) => toScoringRow(row, attributesByProduct));
}

/** Une page d'entrées de scoring + le curseur keyset pour la page suivante. */
export interface ScoringInputPage {
  rows: ProductScoringRow[];
  /** Dernier `product.id` de la page (à repasser en `afterId`) ; null si terminé. */
  nextCursor: string | null;
  /** true quand la page est incomplète → plus rien à lire. */
  done: boolean;
}

/**
 * Lit UNE page de produits canoniques (pagination keyset par `product.id`, stable et sans
 * dérive). Socle du worker d'audit durable (MER-58) : le curseur (`afterId`) est persisté
 * entre les invocations cron → reprise idempotente sans doublonner ni perdre de produit.
 */
export async function readConnectionScoringInputPage(
  connectionId: string,
  afterId: string | null,
  limit: number,
): Promise<ScoringInputPage> {
  const supabase = createAdminClient();
  let query = supabase
    .from("products")
    .select(PRODUCT_SELECT)
    .eq("connection_id", connectionId)
    .order("id", { ascending: true })
    .limit(limit);
  if (afterId) {
    query = query.gt("id", afterId);
  }
  const { data, error } = await query;
  if (error) {
    throw new Error(`Lecture d'une page (scoring) échouée : ${error.message}`);
  }
  const productRows = (data ?? []) as unknown as ProductRow[];

  const attributesByProduct = await readProductAttributes(
    supabase,
    productRows.map((p) => p.id),
  );
  const rows = productRows.map((row) => toScoringRow(row, attributesByProduct));

  const done = productRows.length < limit;
  const nextCursor =
    productRows.length === 0 ? null : productRows[productRows.length - 1].id;
  return { rows, nextCursor: done ? null : nextCursor, done };
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

/** Ligne de score transmise à la RPC (l'`audit_id` et l'`org_id` sont posés côté SQL). */
interface ScorePayload {
  dimension: string;
  value: number | null;
  evidence: Record<string, unknown>;
}

/** Éligibilité variant déjà résolue (GID → id uuid) pour la RPC. */
interface EligibilityPayload {
  variant_id: string;
  issues: VariantEligibility["issues"];
}

/**
 * Persiste un snapshot d'audit pour UN produit (append-only) via la RPC transactionnelle
 * `persist_product_audit` (MER-57) : `audits` + `scores` + `variant_eligibility` sont insérés
 * dans UNE seule transaction Postgres (tout-ou-rien). Un échec à mi-chemin ⇒ rollback complet,
 * donc jamais de snapshot partiel qui deviendrait « current » via la vue DISTINCT ON. La RPC
 * ne fait que des INSERT → l'invariant append-only est préservé.
 */
export async function persistProductAudit(
  params: PersistAuditParams,
): Promise<void> {
  const supabase = createAdminClient();

  const scores: ScorePayload[] = params.scores.map((score) => ({
    dimension: score.dimension,
    value: score.value,
    evidence: score.evidence,
  }));

  // On résout GID variant → id uuid AVANT l'appel : un variant absent du mapping est ignoré
  // (pas de FK à insérer). La RPC reçoit une éligibilité déjà rattachée aux id canoniques.
  const eligibility: EligibilityPayload[] = params.eligibility
    .map((e) => {
      const variantId = params.variantIdByGid[e.shopify_variant_id];
      return variantId ? { variant_id: variantId, issues: e.issues } : null;
    })
    .filter((row): row is EligibilityPayload => row !== null);

  const { error } = await supabase.rpc("persist_product_audit", {
    p_org_id: params.orgId,
    p_product_id: params.productId,
    p_model: params.model,
    p_context: params.context,
    p_scores: scores,
    p_eligibility: eligibility,
  });
  if (error) {
    throw new Error(
      `Persistance de l'audit échouée (${params.productId}) : ${error.message}`,
    );
  }
}
