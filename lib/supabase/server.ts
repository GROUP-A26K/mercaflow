import "server-only";

import { auth } from "@clerk/nextjs/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Client Supabase côté serveur (Server Components, Server Actions, Route Handlers).
//
// ⚠️ L'identité vient de CLERK, pas de Supabase Auth. On passe le JWT Clerk via
// `accessToken` ; Supabase le valide UNIQUEMENT si l'intégration "Third-Party Auth"
// Clerk est activée des DEUX côtés (dashboard Clerk + dashboard Supabase).
// Les policies RLS doivent alors lire l'id utilisateur via `auth.jwt()->>'sub'`.
// Sans cette intégration, les requêtes tombent en rôle `anon`.
export async function createClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      accessToken: async () => {
        const { getToken } = await auth();
        return getToken();
      },
    },
  );
}
