import "server-only";

import {
  reconstructTree,
  type BulkNode,
  type TreeNode,
} from "@/lib/shopify/jsonl";
import { resourceTypeFromGid } from "@/lib/shopify/raw-record";

// Normalisation Shopify (MER-28) : brut → entités canoniques (products / variants / attributes).
// Deux formes de brut coexistent dans `raw_records` :
//   - bulk (MER-26) : nœuds GraphQL camelCase, aplatis puis reconstruits en arbre (__parentId) ;
//   - webhook (MER-27) : payload REST snake_case auto-porté (variants imbriqués dans le corps).
// Les deux entrées produisent la MÊME forme canonique (`NormalizedProduct`), pour que le DAL
// (lib/data/catalog.ts) upserte de manière identique quelle que soit la source.
//
// `canonical_key` = `shopify_product_id` = GID Shopify en V1 (D2 : pas de matcher cross-catalogue).
// `gtin` = `barcode` du variant : une valeur vide devient `null` → signal « SKU sans GTIN ».

export interface NormalizeContext {
  orgId: string;
  connectionId: string;
}

/** Attribut (metafield/metaobject) rattaché à un produit ou un variant. */
export interface AttributeKV {
  namespace: string;
  key: string;
  value: string | null;
  value_type: string | null;
}

export interface NormalizedVariant {
  shopify_variant_id: string;
  sku: string | null;
  gtin: string | null;
  price: number | null;
  currency: string | null;
  inventory_qty: number | null;
  availability: string | null;
  position: number | null;
  attributes: AttributeKV[];
}

export interface NormalizedProduct {
  product: {
    org_id: string;
    connection_id: string;
    canonical_key: string;
    shopify_product_id: string;
    title: string | null;
    description_html: string | null;
    vendor: string | null;
    pdp_url: string | null;
    status: string | null;
  };
  attributes: AttributeKV[];
  variants: NormalizedVariant[];
}

// --- Accès tolérants (le brut est une donnée externe non fiable) --------------------------

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toInt(value: unknown): number | null {
  const n = toNumber(value);
  return n === null ? null : Math.trunc(n);
}

/** `availableForSale` (bool, bulk) → texte ; laissé null si absent. */
function availabilityFromBool(value: unknown): string | null {
  if (typeof value !== "boolean") return null;
  return value ? "available" : "unavailable";
}

function attribute(node: Record<string, unknown>): AttributeKV | null {
  const namespace = str(node.namespace);
  const key = str(node.key);
  if (!namespace || !key) return null;
  return {
    namespace,
    key,
    value: str(node.value),
    value_type: str(node.type) ?? str(node.value_type),
  };
}

// --- Normalisation depuis le bulk (arbre reconstruit) -------------------------------------

/**
 * Normalise un produit bulk reconstruit (`reconstructTree`). Les enfants directs sont les
 * variants et les metafields produit ; les petits-enfants d'un variant sont ses metafields.
 * On distingue variant / metafield / metaobject via le type de ressource du GID.
 */
export function normalizeBulkProductTree(
  tree: TreeNode,
  ctx: NormalizeContext,
): NormalizedProduct {
  const gid = tree.id;
  const productAttributes: AttributeKV[] = [];
  const variants: NormalizedVariant[] = [];

  for (const child of tree.__children) {
    const type = resourceTypeFromGid(child.id);
    if (type === "variant") {
      variants.push(normalizeBulkVariant(child));
    } else if (type === "metafield" || type === "metaobject") {
      const attr = attribute(child);
      if (attr) productAttributes.push(attr);
    }
  }

  return {
    product: {
      org_id: ctx.orgId,
      connection_id: ctx.connectionId,
      canonical_key: gid,
      shopify_product_id: gid,
      title: str(tree.title),
      description_html: str(tree.descriptionHtml),
      vendor: str(tree.vendor),
      pdp_url: str(tree.onlineStoreUrl),
      status: str(tree.status),
    },
    attributes: productAttributes,
    variants,
  };
}

function normalizeBulkVariant(node: TreeNode): NormalizedVariant {
  const attributes: AttributeKV[] = [];
  for (const child of node.__children) {
    const type = resourceTypeFromGid(child.id);
    if (type === "metafield" || type === "metaobject") {
      const attr = attribute(child);
      if (attr) attributes.push(attr);
    }
  }
  return {
    shopify_variant_id: node.id,
    sku: str(node.sku),
    gtin: str(node.barcode),
    price: toNumber(node.price),
    currency: null, // le bulk n'expose pas la devise ; renseignée ultérieurement si besoin.
    inventory_qty: toInt(node.inventoryQuantity),
    availability: availabilityFromBool(node.availableForSale),
    position: toInt(node.position),
    attributes,
  };
}

// --- Normalisation depuis un webhook REST (payload auto-porté) -----------------------------

/**
 * Normalise un payload produit REST (webhook `products/create|update`). Les variants sont
 * imbriqués dans le corps (snake_case). Le GID vient de `admin_graphql_api_id`. Les webhooks
 * produit standards ne portent pas de metafields → `attributes` vide (réconciliés au bulk).
 */
export function normalizeWebhookProduct(
  payload: Record<string, unknown>,
  ctx: NormalizeContext,
): NormalizedProduct {
  const gid = str(payload.admin_graphql_api_id);
  if (!gid) {
    throw new Error(
      "Payload produit webhook sans admin_graphql_api_id (GID requis)",
    );
  }
  const rawVariants = Array.isArray(payload.variants) ? payload.variants : [];
  const variants = rawVariants
    .filter(
      (v): v is Record<string, unknown> => typeof v === "object" && v !== null,
    )
    .map(normalizeWebhookVariant)
    .filter((v): v is NormalizedVariant => v !== null);

  return {
    product: {
      org_id: ctx.orgId,
      connection_id: ctx.connectionId,
      canonical_key: gid,
      shopify_product_id: gid,
      title: str(payload.title),
      description_html: str(payload.body_html),
      vendor: str(payload.vendor),
      pdp_url: null, // le webhook ne porte pas d'URL de PDP ; réconciliée au bulk.
      status: str(payload.status),
    },
    attributes: [],
    variants,
  };
}

function normalizeWebhookVariant(
  node: Record<string, unknown>,
): NormalizedVariant | null {
  const gid = str(node.admin_graphql_api_id);
  if (!gid) return null;
  return {
    shopify_variant_id: gid,
    sku: str(node.sku),
    gtin: str(node.barcode),
    price: toNumber(node.price),
    currency: null,
    inventory_qty: toInt(node.inventory_quantity),
    availability: null, // le webhook REST ne porte pas availableForSale directement.
    position: toInt(node.position),
    attributes: [],
  };
}

// --- Agrégation depuis raw_records (bulk + webhook confondus) ------------------------------

/** Ligne `raw_records` telle que lue par le DAL (sous-ensemble utile à la normalisation). */
export interface RawRecordRow {
  external_id: string;
  resource_type: string;
  payload: Record<string, unknown>;
  fetched_at: string;
}

/** Retient, par `external_id`, l'observation la plus récente (append-only → dédup à la lecture). */
function latestByExternalId(rows: readonly RawRecordRow[]): RawRecordRow[] {
  const latest = new Map<string, RawRecordRow>();
  for (const row of rows) {
    const prev = latest.get(row.external_id);
    if (!prev || row.fetched_at > prev.fetched_at)
      latest.set(row.external_id, row);
  }
  return [...latest.values()];
}

/**
 * Agrège les `raw_records` d'une connexion (bulk ET webhooks REST) en produits canoniques.
 * Discriminant bulk/webhook : un payload REST porte `admin_graphql_api_id` (les nœuds bulk
 * GraphQL non — leur GID est dans `id`). Pour un même GID produit observé par les deux sources,
 * on garde la plus RÉCENTE (`fetched_at`). Les nœuds bulk sont reliés via `__parentId`
 * (produit→variants→metafields) ; les payloads webhook sont auto-portés (variants imbriqués).
 * Les lignes inventory_level (webhook) ne mappent pas un produit → ignorées ici (V1).
 */
export function normalizeRawRecords(
  rows: readonly RawRecordRow[],
  ctx: NormalizeContext,
): NormalizedProduct[] {
  const latest = latestByExternalId(rows);
  const fetchedAtById = new Map(
    latest.map((r) => [r.external_id, r.fetched_at]),
  );

  const isWebhookPayload = (row: RawRecordRow): boolean =>
    Object.prototype.hasOwnProperty.call(row.payload, "admin_graphql_api_id");

  // Nœuds bulk (sans admin_graphql_api_id, GID dans `id`) → reconstruction en arbre.
  const bulkNodes: BulkNode[] = latest
    .filter(
      (row) => !isWebhookPayload(row) && typeof row.payload.id === "string",
    )
    .map((row) => row.payload as unknown as BulkNode);

  // Par GID produit, on garde la version la plus récente (bulk vs webhook).
  const byGid = new Map<
    string,
    { product: NormalizedProduct; fetchedAt: string }
  >();
  const consider = (
    gid: string,
    product: NormalizedProduct,
    fetchedAt: string,
  ) => {
    const prev = byGid.get(gid);
    if (!prev || fetchedAt > prev.fetchedAt)
      byGid.set(gid, { product, fetchedAt });
  };

  for (const root of reconstructTree(bulkNodes)) {
    if (resourceTypeFromGid(root.id) !== "product") continue;
    consider(
      root.id,
      normalizeBulkProductTree(root, ctx),
      fetchedAtById.get(root.id) ?? "",
    );
  }

  for (const row of latest) {
    if (!isWebhookPayload(row) || row.resource_type !== "product") continue;
    const gid = str(row.payload.admin_graphql_api_id);
    if (!gid) continue;
    consider(gid, normalizeWebhookProduct(row.payload, ctx), row.fetched_at);
  }

  return [...byGid.values()].map((entry) => entry.product);
}

// --- Signal d'audit : couverture GTIN ------------------------------------------------------

export interface GtinCoverage {
  total: number;
  withGtin: number;
  missing: number;
  ratio: number;
}

/**
 * Couverture GTIN sur un ensemble de variants : part des SKU avec un GTIN renseigné.
 * Signal d'audit clé (« X % des SKU sans GTIN → invisibles aux agents »). Ratio 0 si aucun
 * variant (pas de division par zéro).
 */
export function gtinCoverage(
  variants: readonly { gtin: string | null }[],
): GtinCoverage {
  const total = variants.length;
  const withGtin = variants.filter(
    (v) => typeof v.gtin === "string" && v.gtin.length > 0,
  ).length;
  return {
    total,
    withGtin,
    missing: total - withGtin,
    ratio: total === 0 ? 0 : withGtin / total,
  };
}
