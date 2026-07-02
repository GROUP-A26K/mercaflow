import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// Orchestrateur d'audit PUS (MER-29) : on isole `runConnectionAudit` en mockant la DAL
// (lecture des entrées + persistance) et le fetch de découvrabilité. Le scorer pur reste réel
// (aucun I/O) → on vérifie le câblage réel read → score → persist, l'isolation par produit et
// le comptage des échecs, pas la formule de scoring (couverte par shopify-scoring.test.ts).

const { readSpy, persistSpy, fetchDiscSpy } = vi.hoisted(() => ({
  readSpy: vi.fn(),
  persistSpy: vi.fn(),
  fetchDiscSpy: vi.fn(),
}));

vi.mock("@/lib/data/scoring", () => ({
  readConnectionScoringInput: readSpy,
  persistProductAudit: persistSpy,
}));
vi.mock("@/lib/shopify/discoverability", () => ({
  fetchDiscoverability: fetchDiscSpy,
}));

import { runConnectionAudit } from "@/lib/shopify/audit";
import type { ShopifyConnection } from "@/lib/data/shopify-connections";
import type { ProductScoringRow } from "@/lib/data/scoring";

const connection: ShopifyConnection = {
  id: "conn-1",
  orgId: "org_1",
  shopDomain: "shop.myshopify.com",
  accessTokenEnc: "enc",
  scope: "read_products",
  status: "active",
};

function row(id: string): ProductScoringRow {
  return {
    productId: id,
    orgId: "org_1",
    variantIdByGid: { "gid://shopify/ProductVariant/1": `${id}-v1` },
    scoring: {
      title: `Produit ${id}`,
      description_html: "<p>Description</p>",
      vendor: "Acme",
      status: "ACTIVE",
      pdp_url: `https://shop.example.com/products/${id}`,
      attributes: [],
      variants: [
        {
          shopify_variant_id: "gid://shopify/ProductVariant/1",
          gtin: "0123456789012",
          price: 10,
          availability: "available",
          inventory_qty: 3,
        },
      ],
    },
  };
}

beforeEach(() => {
  readSpy.mockReset();
  persistSpy.mockReset().mockResolvedValue(undefined);
  fetchDiscSpy.mockReset().mockResolvedValue(null);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("runConnectionAudit", () => {
  it("audite chaque produit du catalogue et persiste un snapshot par produit", async () => {
    readSpy.mockResolvedValue([row("p1"), row("p2"), row("p3")]);

    const result = await runConnectionAudit(connection);

    expect(result).toEqual({ products: 3, failed: 0 });
    expect(readSpy).toHaveBeenCalledWith("conn-1");
    expect(persistSpy).toHaveBeenCalledTimes(3);
    // Chaque persistance porte exactement 1 score/dimension (les 7) + l'éligibilité rollupée.
    const firstCall = persistSpy.mock.calls[0][0];
    expect(firstCall.scores).toHaveLength(7);
    expect(firstCall.productId).toMatch(/^p[123]$/);
    expect(firstCall.variantIdByGid).toEqual({
      "gid://shopify/ProductVariant/1": expect.any(String),
    });
  });

  it("injecte le fetch de découvrabilité avec l'URL PDP et le fetchImpl fourni", async () => {
    readSpy.mockResolvedValue([row("p1")]);
    const fetchImpl = vi.fn();

    await runConnectionAudit(connection, { fetchImpl });

    expect(fetchDiscSpy).toHaveBeenCalledWith(
      "https://shop.example.com/products/p1",
      fetchImpl,
    );
  });

  it("isole les échecs par produit : un produit KO n'interrompt pas les autres", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    readSpy.mockResolvedValue([row("p1"), row("p2"), row("p3")]);
    persistSpy.mockRejectedValueOnce(new Error("insert audits boom"));

    const result = await runConnectionAudit(connection);

    // Un échec compté, mais les 3 produits ont bien été tentés (isolation).
    expect(result).toEqual({ products: 3, failed: 1 });
    expect(persistSpy).toHaveBeenCalledTimes(3);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("insert audits boom"),
    );
  });

  it("un échec de fetch de découvrabilité ne casse pas l'audit (data-gap)", async () => {
    readSpy.mockResolvedValue([row("p1")]);
    fetchDiscSpy.mockResolvedValue(null); // PDP non récupérée → dim. 1 data-gap

    const result = await runConnectionAudit(connection);

    expect(result).toEqual({ products: 1, failed: 0 });
    const disc = persistSpy.mock.calls[0][0].scores.find(
      (s: { dimension: string }) => s.dimension === "discoverability",
    );
    expect(disc.value).toBeNull();
    expect(disc.evidence).toMatchObject({ data_gap: true });
  });

  it("catalogue vide : aucun snapshot, résultat à zéro", async () => {
    readSpy.mockResolvedValue([]);

    const result = await runConnectionAudit(connection);

    expect(result).toEqual({ products: 0, failed: 0 });
    expect(persistSpy).not.toHaveBeenCalled();
  });

  it("propage une erreur de lecture (pas d'isolation en amont du run)", async () => {
    readSpy.mockRejectedValue(new Error("lecture produits KO"));

    await expect(runConnectionAudit(connection)).rejects.toThrow(
      /lecture produits KO/,
    );
    expect(persistSpy).not.toHaveBeenCalled();
  });
});
