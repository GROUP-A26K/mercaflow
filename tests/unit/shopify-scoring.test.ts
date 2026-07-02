import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  PUS_DIMENSIONS,
  scoreProduct,
  variantEligibility,
  type ScoringProduct,
} from "@/lib/shopify/scoring";

const fullProduct: ScoringProduct = {
  title: "Chaussure de running légère pour pieds plats",
  description_html:
    "<p>" +
    "Semelle à amorti dynamique, drop 8mm, mesh respirant. ".repeat(8) +
    "</p>",
  vendor: "Acme",
  status: "ACTIVE",
  pdp_url: "https://shop.example.com/products/sneaker",
  attributes: [
    { namespace: "custom", key: "material", value: "mesh" },
    { namespace: "custom", key: "drop", value: "8mm" },
    { namespace: "custom", key: "usage", value: "route" },
    { namespace: "specs", key: "weight", value: "240g" },
    { namespace: "specs", key: "arch", value: "plat" },
  ],
  variants: [
    {
      shopify_variant_id: "gid://shopify/ProductVariant/11",
      gtin: "0123456789012",
      price: 99.9,
      availability: "available",
      inventory_qty: 5,
    },
    {
      shopify_variant_id: "gid://shopify/ProductVariant/12",
      gtin: null,
      price: null,
      availability: "unavailable",
      inventory_qty: 0,
    },
  ],
};

describe("variantEligibility", () => {
  it("détecte gtin manquant, prix manquant, indisponibilité par variant", () => {
    const flags = variantEligibility(fullProduct.variants);
    expect(flags[0].issues).toEqual({
      gtin_missing: false,
      price_missing: false,
      unavailable: false,
    });
    expect(flags[1].issues).toEqual({
      gtin_missing: true,
      price_missing: true,
      unavailable: true,
    });
    expect(flags[1].shopify_variant_id).toBe("gid://shopify/ProductVariant/12");
  });
});

describe("scoreProduct", () => {
  const discoverability = {
    jsonLdProduct: true,
    openGraph: true,
    indexable: true,
  };
  const result = scoreProduct(fullProduct, discoverability);
  const byDim = new Map(result.scores.map((s) => [s.dimension, s]));

  it("produit exactement 1 score par dimension (les 7)", () => {
    expect(result.scores).toHaveLength(7);
    expect(new Set(result.scores.map((s) => s.dimension))).toEqual(
      new Set(PUS_DIMENSIONS),
    );
  });

  it("découvrabilité : 100 si JSON-LD + OG + indexable", () => {
    expect(byDim.get("discoverability")?.value).toBe(100);
  });

  it("découvrabilité : data_gap (null) si la PDP n'a pas été récupérée", () => {
    const noFetch = scoreProduct(fullProduct, null);
    const disc = noFetch.scores.find((s) => s.dimension === "discoverability");
    expect(disc?.value).toBeNull();
    expect(disc?.evidence).toMatchObject({ data_gap: true });
  });

  it("identifiants : rollup du GTIN variant (1 sur 2 → 50)", () => {
    expect(byDim.get("identifiers")?.value).toBe(50);
  });

  it("confiance/avis : data_gap en V1 (null, pas 0)", () => {
    const trust = byDim.get("trust_authority");
    expect(trust?.value).toBeNull();
    expect(trust?.evidence).toMatchObject({ data_gap: true });
  });

  it("cohérence : rollup prix+dispo variant (1 sur 2 complet → 50)", () => {
    expect(byDim.get("consistency_freshness")?.value).toBe(50);
  });

  it("cohérence : stock 0 fait foi même si availability='available'", () => {
    const zeroStock: ScoringProduct = {
      ...fullProduct,
      variants: [
        {
          shopify_variant_id: "gid://shopify/ProductVariant/7",
          gtin: "0123456789012",
          price: 10,
          availability: "available",
          inventory_qty: 0,
        },
      ],
    };
    const r = scoreProduct(zeroStock, null);
    // stock ≤ 0 → non confirmé disponible (cohérent avec variantEligibility.unavailable).
    expect(
      r.scores.find((s) => s.dimension === "consistency_freshness")?.value,
    ).toBe(0);
    expect(r.eligibility[0].issues.unavailable).toBe(true);
  });

  it("cohérence : 'unavailable' explicite l'emporte même avec du stock > 0", () => {
    const explicitUnavail: ScoringProduct = {
      ...fullProduct,
      variants: [
        {
          shopify_variant_id: "gid://shopify/ProductVariant/6",
          gtin: "0123456789012",
          price: 10,
          availability: "unavailable",
          inventory_qty: 3,
        },
      ],
    };
    const r = scoreProduct(explicitUnavail, null);
    expect(
      r.scores.find((s) => s.dimension === "consistency_freshness")?.value,
    ).toBe(0);
    expect(r.eligibility[0].issues.unavailable).toBe(true);
  });

  it("cohérence : une dispo INCONNUE ne compte pas comme disponible", () => {
    const unknownAvail: ScoringProduct = {
      ...fullProduct,
      variants: [
        {
          shopify_variant_id: "gid://shopify/ProductVariant/9",
          gtin: "0123456789012",
          price: 10,
          availability: null,
          inventory_qty: null,
        },
      ],
    };
    const r = scoreProduct(unknownAvail, null);
    // prix présent mais dispo non confirmée → 0, pas 100.
    expect(
      r.scores.find((s) => s.dimension === "consistency_freshness")?.value,
    ).toBe(0);
  });

  it("intention : une description purement markup ne reçoit aucun point de présence", () => {
    const markupOnly: ScoringProduct = {
      ...fullProduct,
      description_html: "<p></p><div></div>",
      attributes: [],
    };
    const r = scoreProduct(markupOnly, null);
    // ni présence ni palier de longueur (texte réel vide) ni attribut → 0.
    expect(r.scores.find((s) => s.dimension === "intent_coverage")?.value).toBe(
      0,
    );
  });

  it("identité et intention sont élevées sur un produit riche", () => {
    expect(byDim.get("identity_clarity")?.value ?? 0).toBeGreaterThanOrEqual(
      80,
    );
    expect(byDim.get("intent_coverage")?.value ?? 0).toBeGreaterThanOrEqual(80);
  });

  it("un produit vide tombe bas et n'a pas de variant éligible", () => {
    const empty: ScoringProduct = {
      title: null,
      description_html: null,
      vendor: null,
      status: null,
      pdp_url: null,
      attributes: [],
      variants: [],
    };
    const r = scoreProduct(empty, null);
    expect(
      r.scores.find((s) => s.dimension === "identity_clarity")?.value,
    ).toBe(0);
    // identifiants/cohérence sans variant → data_gap (pas 0 trompeur).
    expect(
      r.scores.find((s) => s.dimension === "identifiers")?.value,
    ).toBeNull();
    expect(r.eligibility).toEqual([]);
  });
});
