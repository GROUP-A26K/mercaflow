import { NextResponse, type NextRequest } from "next/server";

import { insertRawRecords } from "@/lib/data/raw-records";
import {
  getActiveConnectionsForShop,
  revokeConnectionsForShop,
} from "@/lib/data/shopify-connections";
import { shopifyConfig } from "@/lib/shopify/config";
import {
  classifyWebhookTopic,
  toRawRecordFromWebhook,
} from "@/lib/shopify/webhook-events";
import { verifyWebhookHmac } from "@/lib/shopify/webhooks";

export const dynamic = "force-dynamic";

// POST /api/shopify/webhooks
// Webhooks incrémentaux Shopify (MER-27) : products/{create,update,delete},
// inventory_levels/update, app/uninstalled. Un seul endpoint, dispatché sur `X-Shopify-Topic`.
// Route publique (machine-à-machine) : authentifiée par le HMAC sur le corps BRUT, pas par
// Clerk (exclusion dans proxy.ts). Traitement synchrone : chaque événement porte un seul
// petit objet (pas de gros download comme la bulk operation) → on persiste avant d'acquitter.
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

  const topic = req.headers.get("x-shopify-topic");
  const action = classifyWebhookTopic(topic);

  // Désinstallation : révoquer la connexion (statut + token) et arrêter les syncs. Pas de
  // payload à persister. Idempotent côté DAL (une désinstallation peut être renvoyée).
  if (action.kind === "revoke") {
    await revokeConnectionsForShop(shopDomain);
    return NextResponse.json(
      { ok: true, revoked: shopDomain },
      { status: 200 },
    );
  }

  // Topic non écouté : acquitter sans traiter (éviter les retries Shopify).
  if (action.kind === "ignore") {
    return NextResponse.json({ ok: true, ignored: topic }, { status: 200 });
  }

  let payload: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(rawBody);
    if (typeof parsed !== "object" || parsed === null) {
      throw new Error("payload non-objet");
    }
    payload = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Payload invalide" }, { status: 400 });
  }

  // Fan-out : un même domaine peut être connecté par plusieurs orgs → une ligne raw_records
  // par connexion active (chacune scopée par son org_id / connection_id). Aucune connexion
  // active (désinstallée entre-temps) → rien à faire, on acquitte.
  const connections = await getActiveConnectionsForShop(shopDomain);
  if (connections.length === 0) {
    return NextResponse.json(
      { ok: true, skipped: "no_active_connection" },
      { status: 200 },
    );
  }

  let records;
  try {
    records = connections.map((connection) =>
      toRawRecordFromWebhook({
        orgId: connection.orgId,
        connectionId: connection.id,
        topic: topic as string,
        payload,
      }),
    );
  } catch (error) {
    // Payload sans identifiant exploitable : ne pas demander de retry (il échouerait à
    // l'identique). On journalise et on acquitte.
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Webhook ${topic} (${shopDomain}) non mappable : ${message}`);
    return NextResponse.json(
      { ok: true, skipped: "unmappable_payload" },
      { status: 200 },
    );
  }

  await insertRawRecords(records);

  return NextResponse.json(
    { ok: true, ingested: records.length },
    {
      status: 200,
    },
  );
}
