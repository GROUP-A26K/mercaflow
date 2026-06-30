import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

// Vérification des webhooks Shopify (MER-26).
// Shopify signe chaque webhook avec HMAC-SHA256(corps brut, API secret), encodé en
// base64 dans l'en-tête `X-Shopify-Hmac-Sha256`. ⚠️ La signature porte sur le corps
// BRUT (`await req.text()` AVANT tout parse) — re-sérialiser le JSON casse la signature.

/**
 * Vérifie le HMAC d'un webhook Shopify en temps constant. Renvoie false si le header
 * est absent/vide ou de longueur différente (jamais d'exception sur entrée hostile).
 */
export function verifyWebhookHmac(
  rawBody: string,
  hmacHeader: string | null | undefined,
  secret: string,
): boolean {
  if (!hmacHeader) return false;

  const expected = createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest();
  // `Buffer.from(_, "base64")` est permissif (ignore caractères invalides / padding, ne lève pas).
  const provided = Buffer.from(hmacHeader, "base64");
  if (provided.length !== expected.length) return false;
  // Rejeter les encodages base64 NON canoniques (le ré-encodage diffère de l'en-tête) :
  // un en-tête malformé ne doit pas être accepté même s'il décode à la bonne taille.
  if (provided.toString("base64") !== hmacHeader) return false;
  return timingSafeEqual(expected, provided);
}

export interface BulkFinishPayload {
  bulkOperationId: string;
  status: string;
}

/**
 * Parse le corps d'un webhook `bulk_operations/finish`. Le payload porte l'id GraphQL
 * de l'opération (`admin_graphql_api_id`) et son statut, mais PAS l'url du JSONL —
 * celle-ci se récupère via `currentBulkOperation`.
 */
export function parseBulkFinishPayload(rawBody: string): BulkFinishPayload {
  const parsed: unknown = JSON.parse(rawBody);
  const id = (parsed as { admin_graphql_api_id?: unknown })
    .admin_graphql_api_id;
  if (typeof id !== "string") {
    throw new Error(
      "Webhook bulk_operations/finish : admin_graphql_api_id manquant",
    );
  }
  const status = (parsed as { status?: unknown }).status;
  return {
    bulkOperationId: id,
    status: typeof status === "string" ? status : "unknown",
  };
}
