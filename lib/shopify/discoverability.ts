import "server-only";

import type { DiscoverabilitySignal } from "@/lib/shopify/scoring";

// Découvrabilité agent (MER-29, dim. 1). On récupère la PDP publique (thème Shopify) et on
// vérifie les signaux qu'un agent exploite pour TROUVER et indexer le produit :
//   - JSON-LD schema.org `Product` (données structurées) — le plus fort ;
//   - Open Graph (og:title/type) — partage/preview ;
//   - indexabilité (pas de `<meta name="robots" content="noindex">`).
// Parsing volontairement tolérant (regex, pas de DOM) : on ne veut qu'une présence binaire,
// et le HTML d'un thème est bruité. Le fetch est best-effort (null si échec → dim. 1 data-gap).

const JSONLD_SCRIPT =
  /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

/** Vrai si un bloc JSON-LD déclare un `@type` Product (schema.org), même imbriqué (@graph). */
function hasProductJsonLd(html: string): boolean {
  for (const match of html.matchAll(JSONLD_SCRIPT)) {
    const block = match[1];
    // Rapide et robuste au JSON multiligne / @graph : on cherche un "@type":"Product".
    if (/["']@type["']\s*:\s*["']Product["']/.test(block)) return true;
  }
  return false;
}

function hasOpenGraph(html: string): boolean {
  return /<meta[^>]+property=["']og:(?:title|type)["']/i.test(html);
}

function isIndexable(html: string): boolean {
  const robots = html.match(
    /<meta[^>]+name=["']robots["'][^>]*content=["']([^"']*)["']/i,
  );
  if (!robots) return true; // pas de directive robots → indexable par défaut
  return !/noindex/i.test(robots[1]);
}

/** Analyse le HTML d'une PDP en signaux de découvrabilité (pur, sans I/O). */
export function parseDiscoverability(html: string): DiscoverabilitySignal {
  return {
    jsonLdProduct: hasProductJsonLd(html),
    openGraph: hasOpenGraph(html),
    indexable: isIndexable(html),
  };
}

export type FetchLike = (
  url: string,
  init?: { signal?: AbortSignal },
) => Promise<{ ok: boolean; text: () => Promise<string> }>;

/** Fenêtre de lecture d'une PDP (ms) : borne l'attente sur un storefront lent. */
const PDP_FETCH_TIMEOUT_MS = 8000;

/**
 * Récupère la PDP et en extrait les signaux de découvrabilité. Best-effort : renvoie `null`
 * (→ dim. 1 en data-gap) si l'URL manque, si le fetch échoue, ou en cas de timeout — jamais
 * d'exception propagée (un audit ne doit pas casser parce qu'un storefront répond mal).
 */
export async function fetchDiscoverability(
  pdpUrl: string | null,
  fetchImpl: FetchLike = fetch as unknown as FetchLike,
): Promise<DiscoverabilitySignal | null> {
  if (!pdpUrl) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PDP_FETCH_TIMEOUT_MS);
  try {
    const response = await fetchImpl(pdpUrl, { signal: controller.signal });
    if (!response.ok) return null;
    return parseDiscoverability(await response.text());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
