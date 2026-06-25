import { requireUser } from "@/lib/data/auth";

// Zone authentifiée : contenu par-utilisateur → JAMAIS de rendu statique. `force-dynamic`
// s'applique à tout le segment (app) (dashboard, notes, …) et évite que le build tente
// de prérendre des pages qui lisent le token Clerk via `headers()`.
export const dynamic = "force-dynamic";

// Layout du groupe (app) : zone authentifiée. Garde d'auth centralisée — toute page sous
// (app) hérite de cette protection. `requireUser()` redirige vers /sign-in si non connecté.
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireUser();

  return <div className="flex min-h-svh flex-col">{children}</div>;
}
