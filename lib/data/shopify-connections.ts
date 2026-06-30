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

/**
 * Connexion active d'une organisation (pour déclencher l'ingestion depuis la zone authentifiée).
 * Service-role : l'`orgId` provient de la session Clerk (`requireOrg`), filtré explicitement.
 */
export async function getActiveConnectionForOrg(
  orgId: string,
): Promise<ShopifyConnection | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("shopify_connections")
    .select(CONNECTION_COLUMNS)
    .eq("org_id", orgId)
    .eq("status", "active")
    .order("installed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error(
      `Lecture de la connexion Shopify échouée : ${error.message}`,
    );
  }
  return data ? mapConnection(data as ConnectionRow) : null;
}

/**
 * Mémorise l'id de la bulk operation lancée par une connexion (pour corréler le webhook
 * `bulk_operations/finish` à la bonne org). Service-role (déclenché côté org authentifiée).
 */
export async function setConnectionBulkOperation(
  connectionId: string,
  bulkOperationId: string,
): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("shopify_connections")
    .update({ last_bulk_operation_id: bulkOperationId })
    .eq("id", connectionId);
  if (error) {
    throw new Error(
      `Suivi de la bulk operation Shopify échoué : ${error.message}`,
    );
  }
}

/**
 * Connexion qui a lancé une bulk operation donnée, résolue par `(shop_domain, op id)`.
 * Pour le webhook : pas de session Clerk (la boutique vient de l'en-tête `X-Shopify-Shop-Domain`,
 * l'op id du payload). Corréler par l'op id lancé — et non par domaine seul — évite d'ingérer
 * le catalogue dans la mauvaise org quand un même domaine est connecté par plusieurs orgs.
 */
export async function getConnectionByBulkOperation(
  shopDomain: string,
  bulkOperationId: string,
): Promise<ShopifyConnection | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("shopify_connections")
    .select(CONNECTION_COLUMNS)
    .eq("shop_domain", shopDomain)
    .eq("last_bulk_operation_id", bulkOperationId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error(
      `Lecture de la connexion Shopify échouée : ${error.message}`,
    );
  }
  return data ? mapConnection(data as ConnectionRow) : null;
}
