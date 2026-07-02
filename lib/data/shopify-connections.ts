import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { decryptToken, encryptToken } from "@/lib/shopify/crypto";

// DATA ACCESS LAYER — connexions Shopify (MER-24, étendu MER-26).
// Écriture via le client SERVICE-ROLE : le callback OAuth n'a pas de session Clerk
// (redirection depuis Shopify), donc il ne peut pas passer la RLS en rôle authentifié.
// L'`org_id` provient du `state` signé (cookie), jamais d'une entrée utilisateur brute.

/** Ligne `shopify_connections` (sous-ensemble utile à l'ingestion). */
export interface ShopifyConnection {
  id: string;
  orgId: string;
  shopDomain: string;
  accessTokenEnc: string | null;
  scope: string | null;
  status: string;
}

interface ConnectionRow {
  id: string;
  org_id: string;
  shop_domain: string;
  access_token_enc: string | null;
  scope: string | null;
  status: string;
}

const CONNECTION_COLUMNS =
  "id, org_id, shop_domain, access_token_enc, scope, status";

function mapConnection(row: ConnectionRow): ShopifyConnection {
  return {
    id: row.id,
    orgId: row.org_id,
    shopDomain: row.shop_domain,
    accessTokenEnc: row.access_token_enc,
    scope: row.scope,
    status: row.status,
  };
}

/** Déchiffre le token offline d'une connexion ; lève s'il est absent (connexion révoquée). */
export function connectionAccessToken(connection: ShopifyConnection): string {
  if (!connection.accessTokenEnc) {
    throw new Error(
      `Connexion Shopify ${connection.shopDomain} sans token (révoquée ?)`,
    );
  }
  return decryptToken(connection.accessTokenEnc);
}

export interface UpsertConnectionParams {
  orgId: string;
  shopDomain: string;
  accessToken: string;
  scope: string;
}

export async function upsertShopifyConnection(
  params: UpsertConnectionParams,
): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.from("shopify_connections").upsert(
    {
      org_id: params.orgId,
      shop_domain: params.shopDomain,
      access_token_enc: encryptToken(params.accessToken),
      scope: params.scope,
      status: "active",
    },
    { onConflict: "org_id,shop_domain" },
  );
  if (error) {
    throw new Error(
      `Enregistrement de la connexion Shopify échoué : ${error.message}`,
    );
  }
}

/** Levée quand une org a plusieurs boutiques actives et qu'aucune n'est précisée. */
export class AmbiguousConnectionError extends Error {
  constructor(
    message = "Plusieurs boutiques Shopify actives : préciser la boutique (?shop=<domaine>.myshopify.com).",
  ) {
    super(message);
    this.name = "AmbiguousConnectionError";
  }
}

/**
 * Connexion active d'une organisation (pour déclencher l'ingestion depuis la zone authentifiée).
 * Service-role : l'`orgId` provient de la session Clerk (`requireOrg`), filtré explicitement.
 * Si `shop` est fourni, on cible cette boutique ; sinon, on exige qu'il n'y en ait qu'une
 * (sinon `AmbiguousConnectionError` — ne pas deviner silencieusement la mauvaise boutique).
 */
export async function getActiveConnectionForOrg(
  orgId: string,
  shop?: string,
): Promise<ShopifyConnection | null> {
  const supabase = createAdminClient();
  let query = supabase
    .from("shopify_connections")
    .select(CONNECTION_COLUMNS)
    .eq("org_id", orgId)
    .eq("status", "active");
  if (shop) query = query.eq("shop_domain", shop);
  const { data, error } = await query
    .order("installed_at", { ascending: false })
    .limit(2);
  if (error) {
    throw new Error(
      `Lecture de la connexion Shopify échouée : ${error.message}`,
    );
  }
  const rows = (data ?? []) as ConnectionRow[];
  if (rows.length === 0) return null;
  if (!shop && rows.length > 1) throw new AmbiguousConnectionError();
  return mapConnection(rows[0]);
}

/**
 * Toutes les connexions ACTIVES d'un domaine de boutique (MER-27, fan-out webhooks).
 * Un webhook Shopify ne porte pas d'org : on rafraîchit chaque connexion active de ce
 * domaine (un même domaine peut être connecté par plusieurs orgs — cf. ADR tenancy).
 * Service-role : pas de session Clerk sur un webhook machine-à-machine.
 */
export async function getActiveConnectionsForShop(
  shopDomain: string,
): Promise<ShopifyConnection[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("shopify_connections")
    .select(CONNECTION_COLUMNS)
    .eq("shop_domain", shopDomain)
    .eq("status", "active");
  if (error) {
    throw new Error(
      `Lecture des connexions Shopify du domaine échouée : ${error.message}`,
    );
  }
  return ((data ?? []) as ConnectionRow[]).map(mapConnection);
}

/**
 * Révoque toutes les connexions d'un domaine (MER-27, webhook `app/uninstalled`) : statut
 * `revoked` + token effacé. Arrête de fait les syncs (le webhook bulk refuse déjà une
 * connexion non-active/sans token). Idempotent (une désinstallation peut être renvoyée).
 */
export async function revokeConnectionsForShop(
  shopDomain: string,
): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("shopify_connections")
    .update({ status: "revoked", access_token_enc: null })
    .eq("shop_domain", shopDomain);
  if (error) {
    throw new Error(
      `Révocation des connexions Shopify du domaine échouée : ${error.message}`,
    );
  }
}

export interface RecordBulkOperationParams {
  bulkOperationId: string;
  orgId: string;
  connectionId: string;
  shopDomain: string;
}

/**
 * Enregistre une bulk operation lancée (id d'op → connexion/org) dans `shopify_bulk_operations`.
 * Service-role. La PK sur `bulk_operation_id` (id globalement unique) garantit une corrélation
 * 1:1 ; les lignes ne sont jamais écrasées → un webhook tardif d'une op précédente reste résoluble.
 */
export async function recordBulkOperation(
  params: RecordBulkOperationParams,
): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.from("shopify_bulk_operations").insert({
    bulk_operation_id: params.bulkOperationId,
    org_id: params.orgId,
    connection_id: params.connectionId,
    shop_domain: params.shopDomain,
  });
  if (error) {
    throw new Error(
      `Suivi de la bulk operation Shopify échoué : ${error.message}`,
    );
  }
}

/**
 * Connexion qui a lancé une bulk operation, résolue par l'id d'op (globalement unique → 1 org).
 * Pour le webhook : pas de session Clerk ; l'op id du payload identifie sans ambiguïté l'org.
 */
export async function getConnectionByBulkOperationId(
  bulkOperationId: string,
): Promise<ShopifyConnection | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("shopify_bulk_operations")
    .select(`connection:shopify_connections!inner(${CONNECTION_COLUMNS})`)
    .eq("bulk_operation_id", bulkOperationId)
    .maybeSingle();
  if (error) {
    throw new Error(
      `Lecture de la bulk operation Shopify échouée : ${error.message}`,
    );
  }
  const connection = (data as { connection: ConnectionRow } | null)?.connection;
  return connection ? mapConnection(connection) : null;
}
