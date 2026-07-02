import "server-only";

// Product Understanding Score — scorer pur (MER-29).
// Rubrique figée : décision D-2026-07-02 (vault MercaflowWiki) — 7 dimensions PDP-level
// orientées « readiness » (l'agent me trouve → comprend → compare → fait confiance → répond),
// PAS de la complétude de champs. Les dimensions 5 (identifiants) et 7 (cohérence) sont des
// ROLLUPS des flags d'éligibilité variant (conforme ADR D1 : pas de duplication des 7 scores
// par variant). La dim. 6 (avis) est un data-gap V1 (score null, PAS 0 → n'altère pas un futur
// agrégat). La dim. 1 (découvrabilité) vient d'un fetch live de la PDP (signal injecté).
//
// Échelle 0-100 par dimension ; `evidence` = le « pourquoi » (jsonb). Fonction PURE : le fetch
// réseau (découvrabilité) est réalisé en amont et injecté, pour rester testable sans I/O.

export const PUS_DIMENSIONS = [
  "discoverability",
  "identity_clarity",
  "intent_coverage",
  "specs_comparability",
  "identifiers",
  "trust_authority",
  "consistency_freshness",
] as const;

export type PusDimension = (typeof PUS_DIMENSIONS)[number];

export interface ScoringAttribute {
  namespace: string;
  key: string;
  value: string | null;
}

export interface ScoringVariant {
  shopify_variant_id: string;
  gtin: string | null;
  price: number | null;
  availability: string | null;
  inventory_qty: number | null;
}

export interface ScoringProduct {
  title: string | null;
  description_html: string | null;
  vendor: string | null;
  status: string | null;
  pdp_url: string | null;
  attributes: ScoringAttribute[];
  variants: ScoringVariant[];
}

/** Signal de découvrabilité issu du fetch de la PDP (null = PDP non récupérée → data-gap). */
export interface DiscoverabilitySignal {
  jsonLdProduct: boolean;
  openGraph: boolean;
  indexable: boolean;
}

export interface DimensionScore {
  dimension: PusDimension;
  value: number | null;
  evidence: Record<string, unknown>;
}

export interface VariantIssues {
  gtin_missing: boolean;
  price_missing: boolean;
  unavailable: boolean;
}

export interface VariantEligibility {
  shopify_variant_id: string;
  issues: VariantIssues;
}

export interface ProductScoreResult {
  scores: DimensionScore[];
  eligibility: VariantEligibility[];
}

// --- Éligibilité variant (source des rollups dim. 5 & 7) -----------------------------------

/** Un variant est indisponible s'il est marqué `unavailable` ou a un stock connu ≤ 0. */
function isUnavailable(variant: ScoringVariant): boolean {
  if (variant.availability === "unavailable") return true;
  return variant.inventory_qty != null && variant.inventory_qty <= 0;
}

function hasGtin(variant: ScoringVariant): boolean {
  return typeof variant.gtin === "string" && variant.gtin.trim().length > 0;
}

/**
 * Disponibilité CONFIRMÉE (signal positif) : le stock CONNU fait foi (cohérent avec
 * `isUnavailable`) — un stock ≤ 0 n'est jamais « confirmé disponible », même si `availability`
 * dit `available`. Sinon `available` explicite, ou stock connu > 0. Une dispo inconnue (les
 * deux champs null) n'est PAS confirmée → ne compte pas comme « clean » (ne pas surévaluer).
 */
function isConfirmedAvailable(variant: ScoringVariant): boolean {
  // Symétrique de `isUnavailable` : `unavailable` explicite OU stock connu ≤ 0 → jamais
  // confirmé (pas de désaccord avec variantEligibility). Sinon `available` ou stock > 0.
  if (variant.availability === "unavailable") return false;
  if (variant.inventory_qty != null && variant.inventory_qty <= 0) return false;
  if (variant.availability === "available") return true;
  return variant.inventory_qty != null && variant.inventory_qty > 0;
}

/** Flags d'éligibilité par variant (GTIN manquant, prix manquant, indisponibilité). */
export function variantEligibility(
  variants: readonly ScoringVariant[],
): VariantEligibility[] {
  return variants.map((variant) => ({
    shopify_variant_id: variant.shopify_variant_id,
    issues: {
      gtin_missing: !hasGtin(variant),
      price_missing: variant.price == null,
      unavailable: isUnavailable(variant),
    },
  }));
}

// --- Dimensions ----------------------------------------------------------------------------

const clamp = (n: number): number => Math.max(0, Math.min(100, n));

/** Longueur du TEXTE (balises HTML retirées) : mesure le contenu réel, pas le markup. */
const textLen = (html: string | null): number =>
  html
    ? html
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim().length
    : 0;

function scoreIdentity(p: ScoringProduct): DimensionScore {
  const hasTitle = !!p.title;
  const titleLen = p.title?.length ?? 0;
  const descriptiveTitle = titleLen >= 15;
  const value =
    (hasTitle ? 40 : 0) +
    (descriptiveTitle ? 20 : 0) +
    (p.vendor ? 20 : 0) +
    (p.status ? 20 : 0);
  return {
    dimension: "identity_clarity",
    value: clamp(value),
    evidence: {
      has_title: hasTitle,
      title_len: titleLen,
      has_vendor: !!p.vendor,
      has_status: !!p.status,
    },
  };
}

function scoreIntent(p: ScoringProduct): DimensionScore {
  const chars = textLen(p.description_html);
  const attrCount = p.attributes.length;
  // Gaté sur le TEXTE réel (chars > 0), pas sur `description_html` non-null : une description
  // purement markup (`<p></p>`) ne mérite ni la présence ni le palier de longueur.
  const descPts = chars >= 300 ? 40 : chars >= 100 ? 25 : chars > 0 ? 10 : 0;
  const presencePts = chars > 0 ? 30 : 0;
  const attrPts = attrCount >= 5 ? 30 : attrCount >= 1 ? 15 : 0;
  return {
    dimension: "intent_coverage",
    value: clamp(presencePts + descPts + attrPts),
    evidence: { description_chars: chars, attribute_count: attrCount },
  };
}

function scoreSpecs(p: ScoringProduct): DimensionScore {
  const n = p.attributes.length;
  const value = n >= 8 ? 100 : n >= 5 ? 75 : n >= 3 ? 50 : n >= 1 ? 25 : 0;
  return {
    dimension: "specs_comparability",
    value,
    evidence: { attribute_count: n },
  };
}

/** Dim. 5 — rollup GTIN depuis les flags d'éligibilité variant. */
function scoreIdentifiers(eligibility: VariantEligibility[]): DimensionScore {
  const total = eligibility.length;
  if (total === 0) {
    return {
      dimension: "identifiers",
      value: null,
      evidence: { data_gap: true, reason: "no_variant" },
    };
  }
  const withGtin = eligibility.filter((e) => !e.issues.gtin_missing).length;
  return {
    dimension: "identifiers",
    value: clamp((withGtin / total) * 100),
    evidence: { total, with_gtin: withGtin, missing: total - withGtin },
  };
}

/**
 * Dim. 7 — rollup cohérence : part des variants avec prix ET disponibilité CONFIRMÉE (V1,
 * cohérence interne). Une dispo inconnue n'est pas comptée comme clean (cf. isConfirmedAvailable)
 * → on ne surévalue pas la dimension sur des lignes sans signal de dispo.
 */
function scoreConsistency(variants: readonly ScoringVariant[]): DimensionScore {
  const total = variants.length;
  if (total === 0) {
    return {
      dimension: "consistency_freshness",
      value: null,
      evidence: { data_gap: true, reason: "no_variant" },
    };
  }
  const clean = variants.filter(
    (v) => v.price != null && isConfirmedAvailable(v),
  ).length;
  return {
    dimension: "consistency_freshness",
    value: clamp((clean / total) * 100),
    evidence: { total, priced_and_available: clean },
  };
}

function scoreDiscoverability(
  signal: DiscoverabilitySignal | null,
): DimensionScore {
  if (!signal) {
    return {
      dimension: "discoverability",
      value: null,
      evidence: { data_gap: true, reason: "pdp_not_fetched" },
    };
  }
  const value =
    (signal.jsonLdProduct ? 60 : 0) +
    (signal.openGraph ? 20 : 0) +
    (signal.indexable ? 20 : 0);
  return {
    dimension: "discoverability",
    value: clamp(value),
    evidence: {
      json_ld_product: signal.jsonLdProduct,
      open_graph: signal.openGraph,
      indexable: signal.indexable,
    },
  };
}

/** Dim. 6 — avis/autorité : non ingéré en V1 → data-gap (null), findings on-brand. */
function scoreTrust(): DimensionScore {
  return {
    dimension: "trust_authority",
    value: null,
    evidence: { data_gap: true, reason: "reviews_not_ingested" },
  };
}

/**
 * Score un produit sur les 7 dimensions du PUS (exactement 1 score/dimension) + les flags
 * d'éligibilité variant (source des rollups dim. 5 & 7). `discoverability` = signal injecté
 * depuis le fetch de la PDP (null → dim. 1 en data-gap). Fonction pure (aucune I/O).
 */
export function scoreProduct(
  product: ScoringProduct,
  discoverability: DiscoverabilitySignal | null,
): ProductScoreResult {
  const eligibility = variantEligibility(product.variants);
  const scores: DimensionScore[] = [
    scoreDiscoverability(discoverability),
    scoreIdentity(product),
    scoreIntent(product),
    scoreSpecs(product),
    scoreIdentifiers(eligibility),
    scoreTrust(),
    scoreConsistency(product.variants),
  ];
  return { scores, eligibility };
}
