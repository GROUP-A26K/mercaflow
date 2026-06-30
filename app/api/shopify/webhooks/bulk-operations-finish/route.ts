import { after, NextResponse, type NextRequest } from "next/server";

import {
  connectionAccessToken,
  getConnectionByBulkOperation,
} from "@/lib/data/shopify-connections";
import { createAdminGraphQLClient } from "@/lib/shopify/admin-graphql";
import { shopifyConfig } from "@/lib/shopify/config";
import { processBulkOperationFinish } from "@/lib/shopify/ingestion";
import {
  parseBulkFinishPayload,
  verifyWebhookHmac,
} from "@/lib/shopify/webhooks";

export const dynamic = "force-dynamic";

// POST /api/shopify/webhooks/bulk-operations-finish
// Webhook Shopify déclenché à la fin d'une Bulk Operation (PAS de polling). Route publique
// (machine-à-machine), authentifiée par le HMAC sur le corps BRUT, pas par Clerk (proxy.ts).
// L'ingestion réelle (download + streaming JSONL → raw_records) tourne en tâche de fond
// via `after()` : un gros catalogue dépasse le budget temps d'un webhook (~5 s côté Shopify).
export async function POST(req: NextRequest) {
  // ⚠️ Lire le corps BRUT avant tout parse : le HMAC porte sur les octets exacts.
  const rawBody = await req.text();
  const config = shopifyConfig();

  if (
    !verifyWebhookHmac(
      rawBody,
      req.headers.get("x-shopify-hmac-sha256"),
      config.clientSecret,
    )
  ) {
    return NextResponse.json({ error: "HMAC invalide" }, { status: 401 });
  }

  const shopDomain = req.headers.get("x-shopify-shop-domain");
  if (!shopDomain) {
    return NextResponse.json(
      { error: "Domaine de boutique manquant" },
      { status: 400 },
    );
  }

  let payload: ReturnType<typeof parseBulkFinishPayload>;
  try {
    payload = parseBulkFinishPayload(rawBody);
  } catch {
    return NextResponse.json({ error: "Payload invalide" }, { status: 400 });
  }

  after(async () => {
    try {
      // Corréler par l'op id annoncé (et non par domaine seul) : un même domaine peut
      // être connecté par plusieurs orgs → résoudre par domaine seul ingérerait dans la
      // mauvaise org (cross-tenant). L'op id a été mémorisé au lancement (ingest route).
      const connection = await getConnectionByBulkOperation(
        shopDomain,
        payload.bulkOperationId,
      );
      if (!connection) {
        console.warn(
          `Webhook bulk : aucune connexion ne correspond à ${payload.bulkOperationId} (${shopDomain})`,
        );
        return;
      }
      const client = createAdminGraphQLClient({
        shop: connection.shopDomain,
        accessToken: connectionAccessToken(connection),
        apiVersion: config.apiVersion,
      });
      const result = await processBulkOperationFinish({
        client,
        connection,
        // Corrèle l'ingestion à l'opération annoncée par le webhook (anti-race / anti-replay).
        expectedOperationId: payload.bulkOperationId,
      });
      if (result.status !== "COMPLETED") {
        console.error(
          `Bulk ${payload.bulkOperationId} non ingérée : ${result.status}` +
            (result.errorCode ? ` (${result.errorCode})` : ""),
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `Ingestion bulk (after) échouée pour ${shopDomain} : ${message}`,
      );
    }
  });

  return NextResponse.json({ ok: true }, { status: 200 });
}
