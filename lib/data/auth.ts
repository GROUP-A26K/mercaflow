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
