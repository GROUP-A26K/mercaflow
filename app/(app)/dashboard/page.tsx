import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { getCurrentUser, requireOrg } from "@/lib/data/auth";
import { listActiveConnectionsForOrg } from "@/lib/data/shopify-connections";
import { buildMetadata } from "@/lib/seo/metadata";

import { ConnectShopifyCard } from "./_components/connect-shopify-card";
import { DashboardGreeting } from "./_components/dashboard-greeting";
import { IngestCatalogCard } from "./_components/ingest-catalog-card";
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
  // `requireOrg` (mémoïsé, déjà appelé par le layout (app)) garantit l'org active.
  const { orgId } = await requireOrg();
  const [user, connections, params] = await Promise.all([
    getCurrentUser(),
    listActiveConnectionsForOrg(orgId),
    searchParams,
  ]);
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
        <IngestCatalogCard connections={connections} />
      </div>
    </main>
  );
}
