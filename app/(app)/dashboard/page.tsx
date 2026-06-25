import { getCurrentUser } from "@/lib/data/auth";
import { buildMetadata } from "@/lib/seo/metadata";

import { DashboardGreeting } from "./_components/dashboard-greeting";
import { SignOutButton } from "./_components/sign-out-button";

// Page privée → exclue de l'indexation.
export const metadata = buildMetadata({
  title: "Tableau de bord",
  path: "/dashboard",
  noIndex: true,
});

// Server Component : orchestre le fetch (via lib/data) et compose les sous-composants.
export default async function DashboardPage() {
  const user = await getCurrentUser();

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-10">
      <div className="flex items-start justify-between gap-4">
        <DashboardGreeting email={user?.email ?? null} />
        <SignOutButton />
      </div>
    </main>
  );
}
