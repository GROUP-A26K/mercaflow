import { createHmac } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  buildInstallUrl,
  isValidShopDomain,
  resolvePublicOrigin,
  verifyShopifyHmac,
} from "@/lib/shopify/oauth";

describe("isValidShopDomain", () => {
  it("accepte un domaine myshopify valide", () => {
    expect(isValidShopDomain("acme-store.myshopify.com")).toBe(true);
  });

  it.each([
    "acme.example.com",
    "acme.myshopify.com.evil.com",
    "https://acme.myshopify.com",
    "ACME.myshopify.com",
    "acme-.myshopify.com",
    "",
    null,
    undefined,
  ])("rejette %s", (value) => {
    expect(isValidShopDomain(value)).toBe(false);
  });
});

describe("resolvePublicOrigin", () => {
  const fallback = { protocol: "https:", host: "localhost:3000" };

  it("utilise X-Forwarded-Host + X-Forwarded-Proto derrière un tunnel/proxy", () => {
    const headers = new Headers({
      host: "shopify-dev.mercaflow.ai",
      "x-forwarded-host": "shopify-dev.mercaflow.ai",
      "x-forwarded-proto": "https",
    });
    // ↳ ne doit PAS retomber sur le socket local (localhost:3000).
    expect(resolvePublicOrigin(headers, fallback)).toBe(
      "https://shopify-dev.mercaflow.ai",
    );
  });

  it("retombe sur l'en-tête Host quand X-Forwarded-Host est absent", () => {
    const headers = new Headers({ host: "app.mercaflow.ai" });
    expect(resolvePublicOrigin(headers, fallback)).toBe(
      "https://app.mercaflow.ai",
    );
  });

  it("utilise le protocole du fallback quand X-Forwarded-Proto est absent", () => {
    const headers = new Headers({ host: "app.mercaflow.ai" });
    expect(
      resolvePublicOrigin(headers, {
        protocol: "http:",
        host: "localhost:3000",
      }),
    ).toBe("http://app.mercaflow.ai");
  });

  it("retombe entièrement sur le fallback sans en-têtes", () => {
    expect(resolvePublicOrigin(new Headers(), fallback)).toBe(
      "https://localhost:3000",
    );
  });
});

describe("buildInstallUrl", () => {
  it("compose l'URL d'autorisation (token offline)", () => {
    const url = new URL(
      buildInstallUrl({
        shop: "acme.myshopify.com",
        clientId: "cid",
        scopes: "read_products,read_inventory",
        redirectUri: "https://app.mercaflow.ai/api/shopify/callback",
        state: "nonce123",
      }),
    );
    expect(`${url.origin}${url.pathname}`).toBe(
      "https://acme.myshopify.com/admin/oauth/authorize",
    );
    expect(url.searchParams.get("client_id")).toBe("cid");
    expect(url.searchParams.get("scope")).toBe("read_products,read_inventory");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://app.mercaflow.ai/api/shopify/callback",
    );
    expect(url.searchParams.get("state")).toBe("nonce123");
    // Token offline → on n'envoie PAS grant_options[]=per-user.
    expect(url.searchParams.has("grant_options[]")).toBe(false);
  });
});

describe("verifyShopifyHmac", () => {
  const secret = "test_secret";

  function signed(params: Record<string, string>): URLSearchParams {
    const sp = new URLSearchParams(params);
    const message = [...sp.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${k}=${v}`)
      .join("&");
    sp.set("hmac", createHmac("sha256", secret).update(message).digest("hex"));
    return sp;
  }

  it("valide un HMAC correct", () => {
    const sp = signed({
      shop: "acme.myshopify.com",
      code: "abc",
      state: "n",
      timestamp: "1700000000",
    });
    expect(verifyShopifyHmac(sp, secret)).toBe(true);
  });

  it("rejette un paramètre falsifié", () => {
    const sp = signed({ shop: "acme.myshopify.com", code: "abc", state: "n" });
    sp.set("code", "tampered");
    expect(verifyShopifyHmac(sp, secret)).toBe(false);
  });

  it("rejette l'absence de HMAC", () => {
    expect(
      verifyShopifyHmac(
        new URLSearchParams({ shop: "acme.myshopify.com" }),
        secret,
      ),
    ).toBe(false);
  });

  it("rejette un mauvais secret", () => {
    const sp = signed({ shop: "acme.myshopify.com", code: "abc" });
    expect(verifyShopifyHmac(sp, "wrong_secret")).toBe(false);
  });
});
