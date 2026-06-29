import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { auth, currentUser } from "@clerk/nextjs/server";

// Data Access Layer — authentification (Clerk).
// `import "server-only"` : erreur de compilation si ce module est importé côté client.
// `cache()` (React) : mémoïse le résultat pour toute la durée d'un rendu serveur,
// donc plusieurs appels dans la même requête ne tapent Clerk qu'une fois.

/** Récupère l'utilisateur connecté normalisé (ou null). À utiliser dans Server Components / Actions. */
export const getCurrentUser = cache(async () => {
  const user = await currentUser();
  if (!user) return null;
  return {
    id: user.id,
    email: user.primaryEmailAddress?.emailAddress ?? null,
  };
});

/** Exige un utilisateur connecté ; redirige vers /sign-in sinon. À appeler dans un layout protégé. */
export const requireUser = cache(async () => {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  return getCurrentUser();
});

/**
 * Exige un utilisateur connecté ET une organisation Clerk active.
 * Redirige vers /sign-in (non connecté) ou /select-organization (pas d'org active).
 * La tenancy des données est org-scopée (RLS Supabase sur le claim d'org du JWT Clerk),
 * donc toute la zone (app) exige une org active. Renvoie `{ userId, orgId }`.
 */
export const requireOrg = cache(async () => {
  const { userId, orgId } = await auth();
  if (!userId) redirect("/sign-in");
  if (!orgId) redirect("/select-organization");
  return { userId, orgId };
});
