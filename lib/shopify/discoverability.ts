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
  // `type` optionnellement (non-)quoté + éventuels paramètres MIME (`; charset=…`) : on ancre
  // sur `application/ld+json` sans exiger de guillemet fermant juste après.
  /<script\b[^>]*\btype\s*=\s*["']?application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi;

// `@type` Product : jeton court `Product` OU IRI complet `https://schema.org/Product`,
// en chaîne ou dans un tableau (`["Product", …]`), valides schema.org.
const PRODUCT_TYPE =
  /["']@type["']\s*:\s*(?:["'](?:https?:\/\/schema\.org\/)?Product["']|\[[^\]]*["'](?:https?:\/\/schema\.org\/)?Product["'][^\]]*\])/;

/** Vrai si un bloc JSON-LD déclare un `@type` Product (schema.org), même imbriqué (@graph). */
function hasProductJsonLd(html: string): boolean {
  for (const match of html.matchAll(JSONLD_SCRIPT)) {
    if (PRODUCT_TYPE.test(match[1])) return true;
  }
  return false;
}

function hasOpenGraph(html: string): boolean {
  return /<meta[^>]+property\s*=\s*["']?og:(?:title|type)/i.test(html);
}

const META_TAG = /<meta\b[^>]*>/gi;
// Attribut quoté OU non quoté (`name=robots`, `content=noindex`).
const NAME_ATTR = /\bname\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/i;
const CONTENT_ATTR = /\bcontent\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/i;

/** Valeur d'un attribut dans une balise (ordre indifférent, guillemets optionnels). */
function tagAttr(tag: string, attr: "name" | "content"): string | null {
  const m = tag.match(attr === "name" ? NAME_ATTR : CONTENT_ATTR);
  return m ? (m[2] ?? m[3] ?? m[4] ?? null) : null;
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
