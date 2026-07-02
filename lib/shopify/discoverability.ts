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
    // Robuste au JSON multiligne / @graph ET au `@type` déclaré en TABLEAU
    // (`"@type":["Product","..."]`, valide schema.org) autant qu'en chaîne.
    if (
      /["']@type["']\s*:\s*(?:["']Product["']|\[[^\]]*["']Product["'][^\]]*\])/.test(
        block,
      )
    ) {
      return true;
    }
  }
  return false;
}

function hasOpenGraph(html: string): boolean {
  return /<meta[^>]+property=["']og:(?:title|type)["']/i.test(html);
}

const META_TAG = /<meta\b[^>]*>/gi;

/** Valeur d'un attribut dans une balise (ordre des attributs indifférent). */
function tagAttr(tag: string, attr: "name" | "content"): string | null {
  const m = tag.match(
    attr === "name"
      ? /\bname=["']([^"']*)["']/i
      : /\bcontent=["']([^"']*)["']/i,
  );
  return m ? m[1] : null;
}

function isIndexable(html: string): boolean {
  // Balayer les <meta> et repérer un robots=noindex, quel que soit l'ORDRE des attributs
  // (`name` avant/après `content`) — un ordre inversé est du HTML valide fréquent.
  for (const match of html.matchAll(META_TAG)) {
    const tag = match[0];
    if (tagAttr(tag, "name")?.toLowerCase() !== "robots") continue;
    if (/noindex/i.test(tagAttr(tag, "content") ?? "")) return false;
  }
  return true; // pas de directive noindex → indexable par défaut
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
