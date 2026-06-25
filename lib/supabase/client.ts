"use client";

import { useMemo } from "react";

import { useSession } from "@clerk/nextjs";
import { createClient } from "@supabase/supabase-js";

// Client Supabase côté navigateur. L'identité vient de CLERK (JWT via `accessToken`).
// À n'utiliser QUE si nécessaire (ex. realtime) — par convention (cf. AGENTS.md / DAL),
// l'accès DB se fait côté serveur (lib/data). Mémoïsé sur la session Clerk.
export function useSupabaseClient() {
  const { session } = useSession();

  return useMemo(
    () =>
      createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          accessToken: async () => (await session?.getToken()) ?? null,
        },
      ),
    [session],
  );
}
