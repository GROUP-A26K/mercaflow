import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Client Supabase pour le serveur : Server Components, Server Actions, Route Handlers.
// Dans Next 16, `cookies()` est asynchrone -> on doit `await`.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Appelé depuis un Server Component : ignorable si aucune
            // écriture de cookie n'est nécessaire (cas lecture seule / DB only).
          }
        },
      },
    },
  );
}
