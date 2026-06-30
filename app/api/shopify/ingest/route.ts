import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import {
  connectionAccessToken,
  getActiveConnectionForOrg,
} from "@/lib/data/shopify-connections";
import { createAdminGraphQLClient } from "@/lib/shopify/admin-graphql";
import { shopifyConfig } from "@/lib/shopify/config";
import {
  BULK_FINISH_WEBHOOK_PATH,
  BulkAlreadyRunningError,
  startCatalogIngestion,
} from "@/lib/shopify/ingestion";

export const dynamic = "force-dynamic";

// POST /api/shopify/ingest
// Déclenche l'import initial du catalogue pour la connexion Shopify de l'org active.
// Protégé par Clerk (route hors matcher public de proxy.ts) → `auth()` fournit l'org.
// Le callback du webhook DOIT être l'URL publique de l'app (Shopify ne joint pas localhost)
// → fail-closed sur NEXT_PUBLIC_SITE_URL (PAS de repli sur l'origine de la requête, qui
// dérive du header Host injectable et pourrait rediriger les webhooks vers un tiers).
export async function POST() {
  const { orgId } = await auth();
  if (!orgId) {
    return NextResponse.json(
      { error: "Organisation active requise" },
      { status: 401 },
    );
  }

  const base = process.env.NEXT_PUBLIC_SITE_URL;
  if (!base) {
    return NextResponse.json(
      { error: "Configuration manquante : NEXT_PUBLIC_SITE_URL" },
      { status: 500 },
    );
  }

  const connection = await getActiveConnectionForOrg(orgId);
  if (!connection) {
    return NextResponse.json(
      { error: "Aucune connexion Shopify active pour cette organisation" },
      { status: 404 },
    );
  }

  const config = shopifyConfig();
  const client = createAdminGraphQLClient({
    shop: connection.shopDomain,
    accessToken: connectionAccessToken(connection),
    apiVersion: config.apiVersion,
  });
  const callbackUrl = `${base}${BULK_FINISH_WEBHOOK_PATH}`;

  try {
    const op = await startCatalogIngestion({ client, callbackUrl });
    // 202 : l'import est lancé en arrière-plan ; le résultat arrive via le webhook finish.
    return NextResponse.json(
      { ok: true, bulkOperationId: op.id, status: op.status },
      { status: 202 },
    );
  } catch (error) {
    if (error instanceof BulkAlreadyRunningError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    // Erreur amont (Shopify/réseau) ou interne : 502, distinct du conflit 409.
    const message = error instanceof Error ? error.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
