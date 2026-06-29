import "server-only";

import { createClient } from "@supabase/supabase-js";

// Client Supabase à privilèges SERVICE-ROLE : contourne la RLS.
// ⚠️ Réservé aux écritures machine-à-machine de confiance, côté serveur uniquement
// (ex. callback OAuth Shopify, ingestion) — JAMAIS exposé au client ni à une requête
// utilisateur arbitraire. L'`org_id` doit toujours être posé explicitement.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquante",
    );
  }
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
