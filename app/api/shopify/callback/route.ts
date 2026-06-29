import { type NextRequest, NextResponse } from "next/server";

import { upsertShopifyConnection } from "@/lib/data/shopify-connections";
import { SHOPIFY_SCOPES, shopifyConfig } from "@/lib/shopify/config";
import { decryptToken } from "@/lib/shopify/crypto";
import {
  exchangeCodeForToken,
  isValidShopDomain,
  verifyShopifyHmac,
} from "@/lib/shopify/oauth";

export const dynamic = "force-dynamic";

const STATE_COOKIE = "shopify_oauth_state";

interface OAuthState {
  nonce: string;
  orgId: string;
  shop: string;
  exp: number;
}

// GET /api/shopify/callback — retour de Shopify après consentement.
// Vérifs STRICTES (shop → state → HMAC) avant tout échange de token. Route publique
// (machine-à-machine), authentifiée par le HMAC Shopify, pas par Clerk.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const shop = params.get("shop");
  const code = params.get("code");
  const state = params.get("state");

  if (!isValidShopDomain(shop) || !code || !state) {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }

  const cookie = request.cookies.get(STATE_COOKIE)?.value;
  if (!cookie) {
    return NextResponse.json({ error: "State manquant" }, { status: 400 });
  }

  let parsed: OAuthState;
  try {
    parsed = JSON.parse(decryptToken(cookie)) as OAuthState;
  } catch {
    return NextResponse.json({ error: "State invalide" }, { status: 401 });
  }
  if (
    parsed.nonce !== state ||
    parsed.shop !== shop ||
    parsed.exp < Date.now()
  ) {
    return NextResponse.json({ error: "State invalide" }, { status: 401 });
  }

  const config = shopifyConfig();
  if (!verifyShopifyHmac(params, config.clientSecret)) {
    return NextResponse.json({ error: "HMAC invalide" }, { status: 401 });
  }

  const { accessToken, scope } = await exchangeCodeForToken(
    shop,
    config.clientId,
    config.clientSecret,
    code,
  );

  // La boutique doit avoir accordé tous les scopes demandés (sinon connexion inutilisable).
  const granted = new Set(
    scope
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
  const missing = SHOPIFY_SCOPES.filter((value) => !granted.has(value));
  if (missing.length > 0) {
    return NextResponse.json(
      { error: `Scopes insuffisants : ${missing.join(", ")}` },
      { status: 400 },
    );
  }

  await upsertShopifyConnection({
    orgId: parsed.orgId,
    shopDomain: shop,
    accessToken,
    scope,
  });

  const response = NextResponse.redirect(
    new URL("/dashboard?shopify=connected", request.url),
  );
  // Le cookie a été posé avec path=/api/shopify → le supprimer au MÊME path.
  response.cookies.set(STATE_COOKIE, "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/api/shopify",
    maxAge: 0,
  });
  return response;
}
