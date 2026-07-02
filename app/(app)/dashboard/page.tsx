import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { getCurrentUser } from "@/lib/data/auth";
import { buildMetadata } from "@/lib/seo/metadata";

import { ConnectShopifyCard } from "./_components/connect-shopify-card";
import { DashboardGreeting } from "./_components/dashboard-greeting";
import { SignOutButton } from "./_components/sign-out-button";

// Page privée → exclue de l'indexation.
export const metadata = buildMetadata({
  title: "Tableau de bord",
  path: "/dashboard",
  noIndex: true,
});

// Server Component : orchestre le fetch (via lib/data) et compose les sous-composants.
// `searchParams` est une Promise en Next 16 → toujours `await`.
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ shopify?: string }>;
}) {
  const [user, params] = await Promise.all([getCurrentUser(), searchParams]);
  const justConnected = params.shopify === "connected";

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-10">
      <div className="flex items-start justify-between gap-4">
        <DashboardGreeting email={user?.email ?? null} />
        <SignOutButton />
      </div>

      <div className="mt-8 space-y-6">
        {justConnected ? (
          <Alert>
            <AlertTitle>Boutique connectée</AlertTitle>
            <AlertDescription>
              Votre boutique Shopify est désormais reliée à Mercaflow.
            </AlertDescription>
          </Alert>
        ) : null}

        <ConnectShopifyCard />
      </div>
    </main>
  );
}
