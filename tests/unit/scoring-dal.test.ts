import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// DAL scoring (MER-29) : lecture des entités canoniques → entrée du scorer, et écriture
// APPEND-ONLY des snapshots (audits → scores → variant_eligibility). On mocke le client
// service-role avec un query-builder chaînable dont chaque table renvoie un résultat
// configurable, et on capture les payloads d'`insert` pour vérifier l'append-only + le rollup.

const { fromSpy, state } = vi.hoisted(() => {
  const state: {
    results: Record<string, { data?: unknown; error: unknown }>;
    inserts: Record<string, unknown[]>;
  } = { results: {}, inserts: {} };

  const fromSpy = vi.fn((table: string) => {
    const result = state.results[table] ?? { data: null, error: null };
    const builder: Record<string, unknown> = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      order: vi.fn(() => builder),
      range: vi.fn(() => builder),
      in: vi.fn(() => builder),
      single: vi.fn(() => builder),
      insert: vi.fn((payload: unknown) => {
        (state.inserts[table] ??= []).push(payload);
        return builder;
      }),
      then: (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
        Promise.resolve(result).then(onF, onR),
    };
    return builder;
  });
  return { fromSpy, state };
});

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: fromSpy }),
}));

import {
  persistProductAudit,
  readConnectionScoringInput,
} from "@/lib/data/scoring";
import type { DimensionScore, VariantEligibility } from "@/lib/shopify/scoring";

beforeEach(() => {
  state.results = {};
  state.inserts = {};
  fromSpy.mockClear();
});

describe("readConnectionScoringInput", () => {
  it("mappe produits + variants imbriqués + attributs produit en entrées de scoring", async () => {
    state.results.products = {
      data: [
        {
          id: "prod-1",
          org_id: "org_1",
          title: "Chaussure",
          description_html: "<p>d</p>",
          vendor: "Acme",
          status: "ACTIVE",
          pdp_url: "https://shop.example.com/p/1",
          variants: [
            {
              id: "var-1",
              shopify_variant_id: "gid://shopify/ProductVariant/1",
              gtin: "0123456789012",
              price: 10,
              availability: "available",
              inventory_qty: 2,
            },
          ],
        },
      ],
      error: null,
    };
    state.results.attributes = {
      data: [
        {
          owner_id: "prod-1",
          namespace: "custom",
          key: "material",
          value: "mesh",
        },
      ],
      error: null,
    };

    const rows = await readConnectionScoringInput("conn-1");

    expect(fromSpy).toHaveBeenCalledWith("products");
    expect(fromSpy).toHaveBeenCalledWith("attributes");
    expect(rows).toEqual([
      {
        productId: "prod-1",
        orgId: "org_1",
        variantIdByGid: { "gid://shopify/ProductVariant/1": "var-1" },
        scoring: {
          title: "Chaussure",
          description_html: "<p>d</p>",
          vendor: "Acme",
          status: "ACTIVE",
          pdp_url: "https://shop.example.com/p/1",
          attributes: [{ namespace: "custom", key: "material", value: "mesh" }],
          variants: [
            {
              shopify_variant_id: "gid://shopify/ProductVariant/1",
              gtin: "0123456789012",
              price: 10,
              availability: "available",
              inventory_qty: 2,
            },
          ],
        },
      },
    ]);
  });

  it("catalogue vide : ne lit pas les attributs (pas d'ids), renvoie []", async () => {
    state.results.products = { data: [], error: null };

    const rows = await readConnectionScoringInput("conn-1");

    expect(rows).toEqual([]);
    expect(fromSpy).not.toHaveBeenCalledWith("attributes");
  });

  it("propage une erreur de lecture des produits", async () => {
    state.results.products = { data: null, error: { message: "boom" } };
    await expect(readConnectionScoringInput("conn-1")).rejects.toThrow(/boom/);
  });

  it("propage une erreur de lecture des attributs", async () => {
    state.results.products = {
      data: [
        {
          id: "prod-1",
          org_id: "org_1",
          title: null,
          description_html: null,
          vendor: null,
          status: null,
          pdp_url: null,
          variants: [],
        },
      ],
      error: null,
    };
    state.results.attributes = { data: null, error: { message: "attr boom" } };
    await expect(readConnectionScoringInput("conn-1")).rejects.toThrow(
      /attr boom/,
    );
  });
});

const scores: DimensionScore[] = [
  { dimension: "identity_clarity", value: 80, evidence: { has_title: true } },
  { dimension: "identifiers", value: null, evidence: { data_gap: true } },
];

const eligibility: VariantEligibility[] = [
  {
    shopify_variant_id: "gid://shopify/ProductVariant/1",
    issues: { gtin_missing: false, price_missing: false, unavailable: false },
  },
];

describe("persistProductAudit", () => {
  beforeEach(() => {
    state.results.audits = { data: { id: "audit-1" }, error: null };
    state.results.scores = { error: null };
    state.results.variant_eligibility = { error: null };
  });

  it("écrit un audit puis ses scores et l'éligibilité variant (append-only, audit_id propagé)", async () => {
    await persistProductAudit({
      orgId: "org_1",
      productId: "prod-1",
      model: "pus-v1",
      context: { scorer: "pus-v1" },
      scores,
      eligibility,
      variantIdByGid: { "gid://shopify/ProductVariant/1": "var-1" },
    });

    expect(state.inserts.audits?.[0]).toEqual({
      org_id: "org_1",
      product_id: "prod-1",
      model: "pus-v1",
      context: { scorer: "pus-v1" },
    });
    expect(state.inserts.scores?.[0]).toEqual([
      {
        org_id: "org_1",
        audit_id: "audit-1",
        product_id: "prod-1",
        dimension: "identity_clarity",
        value: 80,
        evidence: { has_title: true },
      },
      {
        org_id: "org_1",
        audit_id: "audit-1",
        product_id: "prod-1",
        dimension: "identifiers",
        value: null,
        evidence: { data_gap: true },
      },
    ]);
    expect(state.inserts.variant_eligibility?.[0]).toEqual([
      {
        org_id: "org_1",
        audit_id: "audit-1",
        variant_id: "var-1",
        issues: {
          gtin_missing: false,
          price_missing: false,
          unavailable: false,
        },
      },
    ]);
  });

  it("ignore les variants dont le GID est absent du mapping (pas d'insert éligibilité)", async () => {
    await persistProductAudit({
      orgId: "org_1",
      productId: "prod-1",
      model: "pus-v1",
      context: {},
      scores,
      eligibility,
      variantIdByGid: {}, // aucun mapping → la ligne d'éligibilité est filtrée
    });

    expect(state.inserts.variant_eligibility).toBeUndefined();
  });

  it("n'insère pas d'éligibilité si le produit n'a aucun variant", async () => {
    await persistProductAudit({
      orgId: "org_1",
      productId: "prod-1",
      model: "pus-v1",
      context: {},
      scores,
      eligibility: [],
      variantIdByGid: {},
    });

    expect(state.inserts.variant_eligibility).toBeUndefined();
    expect(state.inserts.scores).toHaveLength(1);
  });

  it("propage l'échec d'insertion de l'audit sans écrire les scores", async () => {
    state.results.audits = { data: null, error: { message: "audit boom" } };

    await expect(
      persistProductAudit({
        orgId: "org_1",
        productId: "prod-1",
        model: "pus-v1",
        context: {},
        scores,
        eligibility,
        variantIdByGid: { "gid://shopify/ProductVariant/1": "var-1" },
      }),
    ).rejects.toThrow(/audit boom/);
    expect(state.inserts.scores).toBeUndefined();
  });

  it("propage l'échec d'insertion des scores", async () => {
    state.results.scores = { error: { message: "scores boom" } };

    await expect(
      persistProductAudit({
        orgId: "org_1",
        productId: "prod-1",
        model: "pus-v1",
        context: {},
        scores,
        eligibility,
        variantIdByGid: { "gid://shopify/ProductVariant/1": "var-1" },
      }),
    ).rejects.toThrow(/scores boom/);
  });
});
