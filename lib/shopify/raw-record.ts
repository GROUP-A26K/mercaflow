import "server-only";

import { createHash } from "node:crypto";

import type { BulkNode } from "@/lib/shopify/jsonl";

// Mapping nœud bulk Shopify → ligne `raw_records` (couche 1, ingestion brute, MER-26).
// Append-only : on stocke le payload tel quel + un `content_hash` qui sert de clé de
// déduplication (un payload identique réémis = no-op via la contrainte unique de la table).

/** Forme d'insertion d'une ligne `raw_records` (cf. migration 0002). */
export interface RawRecordInsert {
  org_id: string;
  connection_id: string;
  resource_type: string;
  external_id: string;
  // jsonb : nœud bulk (GID en `id`) OU payload webhook REST (MER-27, id numérique).
  payload: BulkNode | Record<string, unknown>;
  content_hash: string;
}

/**
 * Déduit le `resource_type` depuis un GID Shopify : `gid://shopify/ProductVariant/456`
 * → `variant`. On normalise quelques types connus, sinon on rabat sur la forme minuscule
 * du nom de ressource (extensible sans modifier ce mapping).
 */
export function resourceTypeFromGid(gid: string): string {
  const match = /^gid:\/\/shopify\/([A-Za-z]+)\/.+$/.exec(gid);
  if (!match) {
    throw new Error(`GID Shopify malformé : ${gid}`);
  }
  const resource = match[1];
  const known: Record<string, string> = {
    Product: "product",
    ProductVariant: "variant",
    Metafield: "metafield",
    Metaobject: "metaobject",
  };
  return known[resource] ?? resource.toLowerCase();
}

/** Sérialisation déterministe (clés triées récursivement) → hash stable. */
function stableStringify(value: unknown): string {
  // `JSON.stringify(undefined)` renvoie `undefined` (pas `"null"`) → normaliser explicitement
  // pour que `{a: undefined, b: 1}` et `{b: 1}` ne soient pas confondus par inadvertance.
  if (value === undefined) return "null";
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.keys(value as Record<string, unknown>)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`,
      );
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/** SHA-256 (hex) d'un payload, indépendant de l'ordre des clés. */
export function contentHash(payload: unknown): string {
  return createHash("sha256").update(stableStringify(payload)).digest("hex");
}

export interface ToRawRecordParams {
  orgId: string;
  connectionId: string;
  node: BulkNode;
}

/** Transforme un nœud bulk en ligne `raw_records` prête à insérer. */
export function toRawRecord(params: ToRawRecordParams): RawRecordInsert {
  return {
    org_id: params.orgId,
    connection_id: params.connectionId,
    resource_type: resourceTypeFromGid(params.node.id),
    external_id: params.node.id,
    payload: params.node,
    content_hash: contentHash(params.node),
  };
}
