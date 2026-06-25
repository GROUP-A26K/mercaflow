import { requireUser } from "@/lib/data/auth";

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
