import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// DAL scoring (MER-29) : lecture des entités canoniques → entrée du scorer, et écriture
// APPEND-ONLY des snapshots. La persistance passe par la RPC transactionnelle
// `persist_product_audit` (MER-57) : audits + scores + variant_eligibility en UNE
// transaction Postgres (tout-ou-rien). On mocke `from` (query-builder chaînable pour la
// lecture) ET `rpc` (capture des arguments + résultat configurable).

const { fromSpy, rpcSpy, state } = vi.hoisted(() => {
  const state: {
    results: Record<string, { data?: unknown; error: unknown }>;
    inserts: Record<string, unknown[]>;
    rpcCalls: { name: string; args: unknown }[];
    rpcResult: { data?: unknown; error: unknown };
  } = { results: {}, inserts: {}, rpcCalls: [], rpcResult: { error: null } };

  const fromSpy = vi.fn((table: string) => {
    const result = state.results[table] ?? { data: null, error: null };
    const builder: Record<string, unknown> = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      order: vi.fn(() => builder),
      range: vi.fn(() => builder),
      limit: vi.fn(() => builder),
      gt: vi.fn(() => builder),
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

  const rpcSpy = vi.fn((name: string, args: unknown) => {
    state.rpcCalls.push({ name, args });
    return Promise.resolve(state.rpcResult);
  });

  return { fromSpy, rpcSpy, state };
});

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: fromSpy, rpc: rpcSpy }),
}));

import {
  persistProductAudit,
  readConnectionScoringInput,
  readConnectionScoringInputPage,
} from "@/lib/data/scoring";
import type { DimensionScore, VariantEligibility } from "@/lib/shopify/scoring";

function productData(id: string) {
  return {
    id,
    org_id: "org_1",
    title: `P ${id}`,
    description_html: null,
    vendor: null,
    status: "ACTIVE",
    pdp_url: `https://shop.example.com/p/${id}`,
    variants: [],
  };
}

beforeEach(() => {
  state.results = {};
  state.inserts = {};
  state.rpcCalls = [];
  state.rpcResult = { error: null };
  fromSpy.mockClear();
  rpcSpy.mockClear();
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

describe("readConnectionScoringInputPage (keyset, MER-58)", () => {
  it("renvoie une page pleine + le curseur (dernier id) et done=false", async () => {
    state.results.products = {
      data: [productData("prod-1"), productData("prod-2")],
      error: null,
    };
    state.results.attributes = { data: [], error: null };

    const page = await readConnectionScoringInputPage("conn-1", null, 2);

    expect(fromSpy).toHaveBeenCalledWith("products");
    expect(page.rows.map((r) => r.productId)).toEqual(["prod-1", "prod-2"]);
    expect(page.nextCursor).toBe("prod-2");
    expect(page.done).toBe(false);
  });

  it("page partielle (moins que la limite) : done=true, curseur null", async () => {
    state.results.products = { data: [productData("prod-9")], error: null };
    state.results.attributes = { data: [], error: null };

    const page = await readConnectionScoringInputPage("conn-1", "prod-8", 5);

    expect(page.rows.map((r) => r.productId)).toEqual(["prod-9"]);
    expect(page.nextCursor).toBeNull();
    expect(page.done).toBe(true);
  });

  it("page vide (fin du catalogue) : rows vides, done=true, pas de lecture d'attributs", async () => {
    state.results.products = { data: [], error: null };

    const page = await readConnectionScoringInputPage("conn-1", "prod-last", 5);

    expect(page.rows).toEqual([]);
    expect(page.nextCursor).toBeNull();
    expect(page.done).toBe(true);
    expect(fromSpy).not.toHaveBeenCalledWith("attributes");
  });

  it("propage une erreur de lecture de page", async () => {
    state.results.products = { data: null, error: { message: "page boom" } };
    await expect(
      readConnectionScoringInputPage("conn-1", null, 5),
    ).rejects.toThrow(/page boom/);
  });

  it("refuse une taille de page ≤ 0 (sinon le worker boucle sans progresser)", async () => {
    await expect(
      readConnectionScoringInputPage("conn-1", null, 0),
    ).rejects.toThrow(/page invalide/);
    await expect(
      readConnectionScoringInputPage("conn-1", null, -5),
    ).rejects.toThrow(/page invalide/);
    // On n'a même pas interrogé la base.
    expect(fromSpy).not.toHaveBeenCalledWith("products");
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
  it("délègue à la RPC transactionnelle persist_product_audit (scores + éligibilité résolue)", async () => {
    await persistProductAudit({
      orgId: "org_1",
      productId: "prod-1",
      model: "pus-v1",
      context: { scorer: "pus-v1" },
      scores,
      eligibility,
      variantIdByGid: { "gid://shopify/ProductVariant/1": "var-1" },
    });

    // Un seul appel RPC : atomicité tout-ou-rien côté Postgres (plus de 3 INSERT séparés).
    expect(state.rpcCalls).toHaveLength(1);
    expect(state.rpcCalls[0]).toEqual({
      name: "persist_product_audit",
      args: {
        p_org_id: "org_1",
        p_product_id: "prod-1",
        p_model: "pus-v1",
        p_context: { scorer: "pus-v1" },
        p_scores: [
          {
            dimension: "identity_clarity",
            value: 80,
            evidence: { has_title: true },
          },
          {
            dimension: "identifiers",
            value: null,
            evidence: { data_gap: true },
          },
        ],
        p_eligibility: [
          {
            variant_id: "var-1",
            issues: {
              gtin_missing: false,
              price_missing: false,
              unavailable: false,
            },
          },
        ],
      },
    });
    // Aucune écriture directe par table : tout passe par la RPC.
    expect(state.inserts.audits).toBeUndefined();
    expect(state.inserts.scores).toBeUndefined();
    expect(state.inserts.variant_eligibility).toBeUndefined();
  });

  it("ignore les variants dont le GID est absent du mapping (éligibilité filtrée)", async () => {
    await persistProductAudit({
      orgId: "org_1",
      productId: "prod-1",
      model: "pus-v1",
      context: {},
      scores,
      eligibility,
      variantIdByGid: {}, // aucun mapping → la ligne d'éligibilité est filtrée
    });

    const args = state.rpcCalls[0]?.args as { p_eligibility: unknown[] };
    expect(args.p_eligibility).toEqual([]);
  });

  it("passe une éligibilité vide si le produit n'a aucun variant", async () => {
    await persistProductAudit({
      orgId: "org_1",
      productId: "prod-1",
      model: "pus-v1",
      context: {},
      scores,
      eligibility: [],
      variantIdByGid: {},
    });

    const args = state.rpcCalls[0]?.args as {
      p_eligibility: unknown[];
      p_scores: unknown[];
    };
    expect(args.p_eligibility).toEqual([]);
    expect(args.p_scores).toHaveLength(2);
  });

  it("propage l'échec de la RPC (rollback complet côté Postgres)", async () => {
    state.rpcResult = { error: { message: "rpc boom" } };

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
    ).rejects.toThrow(/rpc boom/);
  });
});
