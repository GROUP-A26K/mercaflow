import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  gtinCoverage,
  normalizeBulkProductTree,
  normalizeRawRecords,
  normalizeWebhookProduct,
  type RawRecordRow,
} from "@/lib/shopify/normalize";
import { reconstructTree } from "@/lib/shopify/jsonl";
import { resourceTypeFromGid as resourceTypeFor } from "@/lib/shopify/raw-record";

// Nœuds bulk plats (comme le JSONL Shopify `groupObjects:false`) → reconstruits en arbre.
const bulkNodes = [
  {
    id: "gid://shopify/Product/1",
    handle: "sneaker",
    title: "Sneaker",
    descriptionHtml: "<p>Cuir</p>",
    vendor: "Acme",
    productType: "Shoes",
    status: "ACTIVE",
    onlineStoreUrl: "https://shop.example.com/products/sneaker",
  },
  {
    id: "gid://shopify/ProductVariant/11",
    __parentId: "gid://shopify/Product/1",
    title: "42",
    sku: "SNK-42",
    barcode: "0123456789012",
    price: "99.90",
    availableForSale: true,
    inventoryQuantity: 5,
    position: 1,
  },
  {
    id: "gid://shopify/ProductVariant/12",
    __parentId: "gid://shopify/Product/1",
    title: "43",
    sku: "SNK-43",
    barcode: "",
    price: "99.90",
    availableForSale: false,
    inventoryQuantity: 0,
    position: 2,
  },
  {
    id: "gid://shopify/Metafield/91",
    __parentId: "gid://shopify/Product/1",
    namespace: "custom",
    key: "material",
    value: "leather",
    type: "single_line_text_field",
  },
  {
    id: "gid://shopify/Metafield/92",
    __parentId: "gid://shopify/ProductVariant/11",
    namespace: "custom",
    key: "width",
    value: "wide",
    type: "single_line_text_field",
  },
];

const ctx = { orgId: "org_1", connectionId: "conn_1" };

describe("normalizeBulkProductTree", () => {
  const [tree] = reconstructTree(bulkNodes);
  const normalized = normalizeBulkProductTree(tree, ctx);

  it("mappe le produit (canonical_key = shopify_product_id = GID)", () => {
    expect(normalized.product).toMatchObject({
      org_id: "org_1",
      connection_id: "conn_1",
      shopify_product_id: "gid://shopify/Product/1",
      canonical_key: "gid://shopify/Product/1",
      title: "Sneaker",
      description_html: "<p>Cuir</p>",
      vendor: "Acme",
      pdp_url: "https://shop.example.com/products/sneaker",
      status: "ACTIVE",
    });
  });

  it("mappe les variants avec gtin depuis barcode", () => {
    expect(normalized.variants).toHaveLength(2);
    const v = normalized.variants[0];
    expect(v).toMatchObject({
      shopify_variant_id: "gid://shopify/ProductVariant/11",
      sku: "SNK-42",
      gtin: "0123456789012",
      price: 99.9,
      inventory_qty: 5,
      position: 1,
    });
    // barcode vide → gtin null (signal « SKU sans GTIN »).
    expect(normalized.variants[1].gtin).toBeNull();
  });

  it("extrait les attributs produit et variant depuis les metafields", () => {
    expect(normalized.attributes).toContainEqual({
      namespace: "custom",
      key: "material",
      value: "leather",
      value_type: "single_line_text_field",
    });
    expect(normalized.variants[0].attributes).toContainEqual({
      namespace: "custom",
      key: "width",
      value: "wide",
      value_type: "single_line_text_field",
    });
  });
});

describe("normalizeWebhookProduct", () => {
  const payload = {
    id: 1,
    admin_graphql_api_id: "gid://shopify/Product/1",
    handle: "sneaker",
    title: "Sneaker",
    body_html: "<p>Cuir</p>",
    vendor: "Acme",
    product_type: "Shoes",
    status: "active",
    variants: [
      {
        id: 11,
        admin_graphql_api_id: "gid://shopify/ProductVariant/11",
        sku: "SNK-42",
        barcode: "0123456789012",
        price: "99.90",
        inventory_quantity: 5,
        position: 1,
      },
    ],
  };
  const normalized = normalizeWebhookProduct(payload, ctx);

  it("mappe le produit REST (snake_case) vers la forme canonique", () => {
    expect(normalized.product).toMatchObject({
      shopify_product_id: "gid://shopify/Product/1",
      canonical_key: "gid://shopify/Product/1",
      title: "Sneaker",
      description_html: "<p>Cuir</p>",
      vendor: "Acme",
      status: "active",
    });
  });

  it("mappe les variants REST imbriqués (barcode → gtin)", () => {
    expect(normalized.variants).toHaveLength(1);
    expect(normalized.variants[0]).toMatchObject({
      shopify_variant_id: "gid://shopify/ProductVariant/11",
      sku: "SNK-42",
      gtin: "0123456789012",
      price: 99.9,
      inventory_qty: 5,
    });
  });

  it("tolère un produit REST sans variants", () => {
    const n = normalizeWebhookProduct(
      { admin_graphql_api_id: "gid://shopify/Product/2", title: "X" },
      ctx,
    );
    expect(n.variants).toEqual([]);
  });
});

describe("normalizeRawRecords", () => {
  const row = (
    external_id: string,
    resource_type: string,
    payload: Record<string, unknown>,
    fetched_at: string,
  ): RawRecordRow => ({ external_id, resource_type, payload, fetched_at });

  it("reconstruit un produit bulk depuis ses lignes plates", () => {
    const rows = bulkNodes.map((n) =>
      row(n.id, resourceTypeFor(n.id), n, "2026-07-01T00:00:00Z"),
    );
    const products = normalizeRawRecords(rows, ctx);
    expect(products).toHaveLength(1);
    expect(products[0].product.shopify_product_id).toBe(
      "gid://shopify/Product/1",
    );
    expect(products[0].variants).toHaveLength(2);
  });

  it("dédoublonne par external_id en gardant l'observation la plus récente", () => {
    const rows = [
      row("gid://shopify/Product/1", "product", bulkNodes[0], "2026-07-01"),
      row(
        "gid://shopify/Product/1",
        "product",
        { ...bulkNodes[0], title: "Ancien" },
        "2026-06-01",
      ),
    ];
    const [product] = normalizeRawRecords(rows, ctx);
    expect(product.product.title).toBe("Sneaker");
  });

  it("préfère un webhook plus récent au bulk pour le même GID produit", () => {
    const rows = [
      row("gid://shopify/Product/1", "product", bulkNodes[0], "2026-07-01"),
      row(
        "gid://shopify/Product/1",
        "product",
        {
          admin_graphql_api_id: "gid://shopify/Product/1",
          title: "Frais (webhook)",
          variants: [],
        },
        "2026-07-02",
      ),
    ];
    const [product] = normalizeRawRecords(rows, ctx);
    expect(product.product.title).toBe("Frais (webhook)");
  });

  it("ignore les lignes inventory_level (pas de mapping produit en V1)", () => {
    const rows = [
      row(
        "gid://shopify/InventoryLevel/5?inventory_item_id=9",
        "inventory_level",
        {
          admin_graphql_api_id: "gid://shopify/InventoryLevel/5",
          available: 3,
        },
        "2026-07-02",
      ),
    ];
    expect(normalizeRawRecords(rows, ctx)).toEqual([]);
  });
});

describe("gtinCoverage", () => {
  it("calcule le ratio de variants avec GTIN", () => {
    const cov = gtinCoverage([
      { gtin: "0123456789012" },
      { gtin: null },
      { gtin: "" },
      { gtin: "9780306406157" },
    ]);
    expect(cov).toEqual({ total: 4, withGtin: 2, missing: 2, ratio: 0.5 });
  });

  it("renvoie ratio 0 et total 0 sans variant (évite la division par zéro)", () => {
    expect(gtinCoverage([])).toEqual({
      total: 0,
      withGtin: 0,
      missing: 0,
      ratio: 0,
    });
  });
});
