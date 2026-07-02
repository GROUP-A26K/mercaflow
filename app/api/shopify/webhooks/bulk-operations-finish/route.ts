import { after, NextResponse, type NextRequest } from "next/server";

import { enqueueAuditJob } from "@/lib/data/background-jobs";
import {
  connectionAccessToken,
  getConnectionByBulkOperationId,
} from "@/lib/data/shopify-connections";
import { createAdminGraphQLClient } from "@/lib/shopify/admin-graphql";
import { shopifyConfig } from "@/lib/shopify/config";
import { processBulkOperationFinish } from "@/lib/shopify/ingestion";
import { normalizeConnectionCatalog } from "@/lib/shopify/normalization";
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

  // Résoudre la connexion AVANT de répondre : si la ligne de corrélation manque encore
  // (lag de réplication, ou insert d'ingest en échec), répondre 503 → Shopify retente
  // (backoff ~48 h) plutôt que de perdre l'import sur un 200 définitif.
  const connection = await getConnectionByBulkOperationId(
    payload.bulkOperationId,
  );
  if (!connection) {
    console.warn(
      `Webhook bulk : aucune connexion ne correspond à ${payload.bulkOperationId} (${shopDomain}) — retry`,
    );
    return NextResponse.json(
      { error: "Corrélation introuvable, retry" },
      { status: 503 },
    );
  }

  // Cas TERMINAL distinct du transitoire : si la connexion a été révoquée (ou n'a plus de
  // token) depuis le lancement de la bulk, l'ingestion est impossible — pas de token pour
  // télécharger le JSONL. On abandonne explicitement (log + 200) plutôt que de laisser
  // `connectionAccessToken` lever au fond du `after()`, et SANS demander un retry inutile.
  if (connection.status !== "active" || !connection.accessTokenEnc) {
    console.error(
      `Webhook bulk : connexion ${connection.shopDomain} révoquée/sans token — import ${payload.bulkOperationId} abandonné`,
    );
    return NextResponse.json(
      { ok: true, skipped: "connection_inactive" },
      { status: 200 },
    );
  }

  // L'ingestion réelle (download + streaming) tourne en tâche de fond : un gros catalogue
  // dépasse le budget temps d'un webhook (~5 s côté Shopify).
  after(async () => {
    try {
      const client = createAdminGraphQLClient({
        shop: connection.shopDomain,
        accessToken: connectionAccessToken(connection),
        apiVersion: config.apiVersion,
      });
      const result = await processBulkOperationFinish({
        client,
        connection,
        bulkOperationId: payload.bulkOperationId,
      });
      if (result.status !== "COMPLETED") {
        console.error(
          `Bulk ${payload.bulkOperationId} non ingérée : ${result.status}` +
            (result.errorCode ? ` (${result.errorCode})` : ""),
        );
        return;
      }
      // Ingestion réussie → normalisation (MER-28) : raw_records → products/variants/attributes
      // + signal de couverture GTIN. Même tâche de fond (`after()`) que l'ingestion.
      const normalized = await normalizeConnectionCatalog(connection);
      console.info(
        `Normalisation ${connection.shopDomain} : ${normalized.products} produits ` +
          `(${normalized.failed} échec(s)), couverture GTIN ` +
          `${(normalized.gtin.ratio * 100).toFixed(1)}% ` +
          `(${normalized.gtin.withGtin}/${normalized.gtin.total}).`,
      );
      // Catalogue normalisé → on ENQUEUE un job d'audit durable (MER-58) au lieu d'auditer
      // en ligne : sur 500–20k SKU, l'audit (1 fetch PDP/produit) dépasse la durée serverless
      // et n'a aucun retry dans un `after()`. Le worker cron (`/api/shopify/jobs/audit`) le
      // draine par pages, avec reprise idempotente. Enqueue idempotent (au plus 1 job actif/co).
      await enqueueAuditJob({
        orgId: connection.orgId,
        connectionId: connection.id,
      });
      console.info(
        `Audit PUS ${connection.shopDomain} : job d'audit enqueue (worker cron).`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `Ingestion bulk (after) échouée pour ${shopDomain} : ${message}`,
      );
    }
  });

  return NextResponse.json({ ok: true }, { status: 200 });
}
