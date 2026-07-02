import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { ShopifyConnection } from "@/lib/data/shopify-connections";

import { IngestButton } from "./ingest-button";

// Bloc « Importer le catalogue » (MER-55). Server Component : reçoit les connexions actives
// (lues côté page via la DAL) et rend un déclencheur par boutique. Le seul morceau client est
// le bouton (`IngestButton`) — 'use client' poussé au plus bas (perf : JS minimal envoyé).

interface IngestCatalogCardProps {
  connections: readonly Pick<ShopifyConnection, "id" | "shopDomain">[];
}

export function IngestCatalogCard({ connections }: IngestCatalogCardProps) {
  // Pas de connexion active → rien à importer : on n'affiche pas le bloc.
  if (connections.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Importer le catalogue</CardTitle>
        <CardDescription>
          Lancez l&apos;import initial du catalogue de votre boutique Shopify.
          L&apos;import s&apos;exécute en arrière-plan.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {connections.map((connection) => (
          <div
            key={connection.id}
            className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
          >
            <span className="text-sm font-medium">{connection.shopDomain}</span>
            <IngestButton shopDomain={connection.shopDomain} />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
