import { auth } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";

import {
  AmbiguousConnectionError,
  connectionAccessToken,
  getActiveConnectionForOrg,
  recordBulkOperation,
} from "@/lib/data/shopify-connections";
import { createAdminGraphQLClient } from "@/lib/shopify/admin-graphql";
import { shopifyConfig } from "@/lib/shopify/config";
import {
  BULK_FINISH_WEBHOOK_PATH,
  BulkAlreadyRunningError,
  startCatalogIngestion,
} from "@/lib/shopify/ingestion";

export const dynamic = "force-dynamic";

// POST /api/shopify/ingest[?shop=<boutique>.myshopify.com]
// Déclenche l'import initial du catalogue pour la connexion Shopify de l'org active.
// Protégé par Clerk (route hors matcher public de proxy.ts) → `auth()` fournit l'org.
// Le callback du webhook DOIT être l'URL publique de l'app (Shopify ne joint pas localhost)
// → fail-closed sur NEXT_PUBLIC_SITE_URL (PAS de repli sur l'origine de la requête, qui
// dérive du header Host injectable et pourrait rediriger les webhooks vers un tiers).
export async function POST(req: NextRequest) {
  // Anti-CSRF (fail-closed) : POST mutatif lié à l'org de la session. On n'autorise que les
  // navigations same-origin / same-site / directes ; l'absence d'en-tête = client non fiable.
  const fetchSite = req.headers.get("sec-fetch-site");
  if (!fetchSite || !["same-origin", "same-site", "none"].includes(fetchSite)) {
    return NextResponse.json(
      { error: "Origine non autorisée" },
      { status: 403 },
    );
  }

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

  const shop = req.nextUrl.searchParams.get("shop") ?? undefined;

  let connection;
  try {
    connection = await getActiveConnectionForOrg(orgId, shop);
  } catch (error) {
    if (error instanceof AmbiguousConnectionError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
  if (!connection) {
    return NextResponse.json(
      { error: "Aucune connexion Shopify active pour cette organisation" },
      { status: 404 },
    );
  }

  const callbackUrl = `${base}${BULK_FINISH_WEBHOOK_PATH}`;

  try {
    // Dans le try : `connectionAccessToken` lève si le token est révoqué/malformé
    // → réponse JSON 502 plutôt qu'un 500 non capturé.
    const config = shopifyConfig();
    const client = createAdminGraphQLClient({
      shop: connection.shopDomain,
      accessToken: connectionAccessToken(connection),
      apiVersion: config.apiVersion,
    });
    const op = await startCatalogIngestion({ client, callbackUrl });
    // Tracer l'op (id → connexion/org) pour corréler le futur webhook finish (anti cross-tenant).
    // Si ce write échoue, on renvoie 502 : la bulk tourne mais re-déclencher après sa fin
    // relancera une bulk (catalogue COMPLET) → ingestion idempotente, pas de perte de données.
    await recordBulkOperation({
      bulkOperationId: op.id,
      orgId,
      connectionId: connection.id,
      shopDomain: connection.shopDomain,
    });
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
