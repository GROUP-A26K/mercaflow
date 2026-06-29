import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { encryptToken } from "@/lib/shopify/crypto";

// DATA ACCESS LAYER — connexions Shopify (MER-24).
// Écriture via le client SERVICE-ROLE : le callback OAuth n'a pas de session Clerk
// (redirection depuis Shopify), donc il ne peut pas passer la RLS en rôle authentifié.
// L'`org_id` provient du `state` signé (cookie), jamais d'une entrée utilisateur brute.

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
