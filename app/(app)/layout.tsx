import { requireOrg } from "@/lib/data/auth";

// Zone authentifiée : contenu par-organisation → JAMAIS de rendu statique. `force-dynamic`
// s'applique à tout le segment (app) (dashboard, notes, …) et évite que le build tente
// de prérendre des pages qui lisent le token Clerk via `headers()`.
export const dynamic = "force-dynamic";

// Layout du groupe (app) : zone authentifiée + org-scopée. Garde centralisée — toute page
// sous (app) hérite de cette protection. `requireOrg()` redirige vers /sign-in (non connecté)
// ou /select-organization (pas d'org active), prérequis de la RLS org-scopée (Supabase).
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireOrg();

  return <div className="flex min-h-svh flex-col">{children}</div>;
}
