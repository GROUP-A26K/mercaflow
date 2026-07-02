import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

// Flow OAuth « legacy install » Shopify (app standalone non-embedded, token offline).

const SHOP_DOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?\.myshopify\.com$/;

/** Valide un domaine de boutique Shopify (anti-injection d'hôte). */
export function isValidShopDomain(
  shop: string | null | undefined,
): shop is string {
  return typeof shop === "string" && SHOP_DOMAIN_RE.test(shop);
}

/**
 * Origine publique de l'app derrière un reverse-proxy / tunnel (Cloudflare, Vercel).
 * `request.nextUrl.origin` reflète le socket d'écoute (ex. `localhost:3000`) et NON le
 * `Host` public → on reconstruit l'origine depuis `X-Forwarded-Host`/`Host` (+ proto),
 * avec repli sur l'origine locale.
 *
 * Réservé à la construction du `redirect_uri` Shopify (URL ABSOLUE requise), qui DOIT
 * correspondre à la whitelist Shopify — ce qui borne toute manipulation d'hôte. Les
 * redirections internes de l'app utilisent, elles, des `Location` RELATIVES (pas d'hôte
 * dérivé d'en-têtes → pas d'open-redirect).
 */
export function resolvePublicOrigin(
  headers: Headers,
  fallback: { protocol: string; host: string },
): string {
  // Chaîne multi-proxy : `X-Forwarded-*` peut valoir « client, proxy1, … » → premier saut.
  const firstHop = (value: string | null): string | undefined =>
    value?.split(",")[0]?.trim() || undefined;
  const proto =
    firstHop(headers.get("x-forwarded-proto")) ??
    fallback.protocol.replace(/:$/, "");
  const host =
    firstHop(headers.get("x-forwarded-host")) ??
    headers.get("host") ??
    fallback.host;
  return `${proto}://${host}`;
}

export interface InstallUrlParams {
  shop: string;
  clientId: string;
  scopes: string;
  redirectUri: string;
  state: string;
}

/** Construit l'URL de consentement `/admin/oauth/authorize`. `grant_options[]` vide = token OFFLINE. */
export function buildInstallUrl(params: InstallUrlParams): string {
  const url = new URL(`https://${params.shop}/admin/oauth/authorize`);
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("scope", params.scopes);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("state", params.state);
  return url.toString();
}

function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/**
 * Vérifie le HMAC d'un callback Shopify : retire `hmac`/`signature`, trie les paramètres,
 * recompose `clé=valeur&…`, calcule HMAC-SHA256 avec le secret de l'app, compare en
 * temps constant. Renvoie false si `hmac` absent.
 */
export function verifyShopifyHmac(
  searchParams: URLSearchParams,
  secret: string,
): boolean {
  const provided = searchParams.get("hmac");
  if (!provided) return false;

  const params = new URLSearchParams(searchParams);
  params.delete("hmac");
  params.delete("signature");

  const message = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");

  const digest = createHmac("sha256", secret).update(message).digest("hex");
  return safeEqualHex(digest, provided);
}

export interface ShopifyToken {
  accessToken: string;
  scope: string;
}

/** Échange le code d'autorisation contre un access token OFFLINE (n'expire pas). */
export async function exchangeCodeForToken(
  shop: string,
  clientId: string,
  clientSecret: string,
  code: string,
): Promise<ShopifyToken> {
  const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
    }).toString(),
  });

  if (!response.ok) {
    throw new Error(`Échange du code Shopify échoué (HTTP ${response.status})`);
  }

  const data = (await response.json()) as {
    access_token?: string;
    scope?: string;
  };
  if (!data.access_token) throw new Error("Réponse Shopify sans access_token");

  return { accessToken: data.access_token, scope: data.scope ?? "" };
}
