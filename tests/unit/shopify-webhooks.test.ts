import { createHmac } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  parseBulkFinishPayload,
  verifyWebhookHmac,
} from "@/lib/shopify/webhooks";

const SECRET = "shpss_test_secret";

function sign(body: string, secret = SECRET): string {
  return createHmac("sha256", secret).update(body, "utf8").digest("base64");
}

describe("verifyWebhookHmac", () => {
  const body = '{"admin_graphql_api_id":"gid://shopify/BulkOperation/1"}';

  it("valide un HMAC base64 correct sur le corps brut", () => {
    expect(verifyWebhookHmac(body, sign(body), SECRET)).toBe(true);
  });

  it("rejette un corps altéré", () => {
    expect(verifyWebhookHmac(body + " ", sign(body), SECRET)).toBe(false);
  });

  it("rejette un mauvais secret", () => {
    expect(verifyWebhookHmac(body, sign(body, "autre"), SECRET)).toBe(false);
  });

  it("rejette un header vide ou absent", () => {
    expect(verifyWebhookHmac(body, "", SECRET)).toBe(false);
    expect(verifyWebhookHmac(body, null, SECRET)).toBe(false);
  });

  it("rejette un header de longueur différente sans planter (timingSafeEqual)", () => {
    expect(verifyWebhookHmac(body, "dG9vc2hvcnQ=", SECRET)).toBe(false);
  });

  it("rejette un base64 non canonique qui décode pourtant aux bons octets", () => {
    // Même signature valide + un caractère ignoré au décodage (newline) → décode aux 32
    // octets attendus mais l'encodage n'est pas canonique → doit être rejeté.
    const valid = sign(body);
    expect(verifyWebhookHmac(body, valid, SECRET)).toBe(true);
    expect(verifyWebhookHmac(body, `${valid}\n`, SECRET)).toBe(false);
  });
});

describe("parseBulkFinishPayload", () => {
  it("extrait l'id de l'opération bulk et le statut", () => {
    const result = parseBulkFinishPayload(
      JSON.stringify({
        admin_graphql_api_id: "gid://shopify/BulkOperation/123",
        status: "completed",
      }),
    );
    expect(result).toEqual({
      bulkOperationId: "gid://shopify/BulkOperation/123",
      status: "completed",
    });
  });

  it("lève si le payload n'a pas d'admin_graphql_api_id", () => {
    expect(() => parseBulkFinishPayload('{"status":"completed"}')).toThrow();
  });

  it("lève sur du JSON invalide", () => {
    expect(() => parseBulkFinishPayload("{bad")).toThrow();
  });
});
