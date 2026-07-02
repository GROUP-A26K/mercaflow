import { randomBytes } from "node:crypto";

import { auth } from "@clerk/nextjs/server";
import { type NextRequest, NextResponse } from "next/server";

import { SHOPIFY_REDIRECT_PATH, shopifyConfig } from "@/lib/shopify/config";
import { encryptToken } from "@/lib/shopify/crypto";
import {
  buildInstallUrl,
  isValidShopDomain,
  resolvePublicOrigin,
} from "@/lib/shopify/oauth";

export const dynamic = "force-dynamic";

const STATE_COOKIE = "shopify_oauth_state";
const STATE_TTL_MS = 10 * 60 * 1000;

// GET /api/shopify/install?shop=<boutique>.myshopify.com
// Démarre le flow OAuth : lie un `state` (nonce) à l'org active dans un cookie chiffré
// httpOnly, puis redirige vers l'écran de consentement Shopify (token offline).
export async function GET(request: NextRequest) {
  // Anti-CSRF (fail-closed) : l'install démarre un flow OAuth lié à l'org de la session.
  // On n'autorise que les navigations same-origin / same-site / directes (`none`). Tout le
  // reste — y compris l'ABSENCE d'en-tête — est rejeté (un navigateur moderne envoie toujours
  // `Sec-Fetch-Site` sur une navigation, donc l'absence = client non fiable / cross-site).
  const fetchSite = request.headers.get("sec-fetch-site");
  if (!fetchSite || !["same-origin", "same-site", "none"].includes(fetchSite)) {
    return NextResponse.json(
      { error: "Origine non autorisée" },
      { status: 403 },
    );
  }

  const { orgId } = await auth();
  if (!orgId) {
    // Redirection interne RELATIVE : le navigateur la résout contre l'origine publique
    // qu'il a demandée (le tunnel/proxy masque l'hôte réel côté serveur). Pas d'hôte
    // dérivé d'en-têtes → aucun risque d'open-redirect.
    return new NextResponse(null, {
      status: 307,
      headers: { Location: "/select-organization" },
    });
  }

  const shop = request.nextUrl.searchParams.get("shop");
  if (!isValidShopDomain(shop)) {
    return NextResponse.json(
      { error: "Paramètre shop invalide" },
      { status: 400 },
    );
  }

  const config = shopifyConfig();
  // `redirect_uri` doit être ABSOLU et matcher la whitelist Shopify → on reconstruit
  // l'origine publique depuis les en-têtes de forwarding (`nextUrl` = socket local
  // derrière le tunnel/proxy). La whitelist Shopify borne toute manipulation d'hôte.
  const origin = resolvePublicOrigin(request.headers, {
    protocol: request.nextUrl.protocol,
    host: request.nextUrl.host,
  });
  const redirectUri = `${origin}${SHOPIFY_REDIRECT_PATH}`;
  const nonce = randomBytes(16).toString("hex");

  const response = NextResponse.redirect(
    buildInstallUrl({
      shop,
      clientId: config.clientId,
      scopes: config.scopes,
      redirectUri,
      state: nonce,
    }),
  );

  const state = encryptToken(
    JSON.stringify({ nonce, orgId, shop, exp: Date.now() + STATE_TTL_MS }),
  );
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/api/shopify",
    maxAge: STATE_TTL_MS / 1000,
  });
  return response;
}
