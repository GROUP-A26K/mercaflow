import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  contentHash,
  resourceTypeFromGid,
  toRawRecord,
} from "@/lib/shopify/raw-record";

describe("resourceTypeFromGid", () => {
  it.each([
    ["gid://shopify/Product/123", "product"],
    ["gid://shopify/ProductVariant/456", "variant"],
    ["gid://shopify/Metafield/789", "metafield"],
    ["gid://shopify/Metaobject/321", "metaobject"],
  ])("mappe %s → %s", (gid, expected) => {
    expect(resourceTypeFromGid(gid)).toBe(expected);
  });

  it("rabat un type Shopify inconnu sur sa forme minuscule", () => {
    expect(resourceTypeFromGid("gid://shopify/InventoryItem/1")).toBe(
      "inventoryitem",
    );
  });

  it("rejette un gid malformé", () => {
    expect(() => resourceTypeFromGid("not-a-gid")).toThrow();
    expect(() => resourceTypeFromGid("gid://shopify/")).toThrow();
  });
});

describe("contentHash", () => {
  it("est stable quel que soit l'ordre des clés", () => {
    const a = contentHash({ id: "1", title: "A", vendor: "ACME" });
    const b = contentHash({ vendor: "ACME", id: "1", title: "A" });
    expect(a).toBe(b);
  });

  it("change quand le contenu change", () => {
    const a = contentHash({ id: "1", title: "A" });
    const b = contentHash({ id: "1", title: "B" });
    expect(a).not.toBe(b);
  });

  it("produit un sha256 hex (64 caractères)", () => {
    expect(contentHash({ id: "1" })).toMatch(/^[0-9a-f]{64}$/);
  });

  it("traite récursivement les objets imbriqués (ordre indifférent en profondeur)", () => {
    const a = contentHash({ id: "1", o: { x: 1, y: 2 } });
    const b = contentHash({ id: "1", o: { y: 2, x: 1 } });
    expect(a).toBe(b);
  });
});

describe("toRawRecord", () => {
  it("mappe un nœud bulk vers une ligne raw_records", () => {
    const record = toRawRecord({
      orgId: "org_123",
      connectionId: "conn-uuid",
      node: { id: "gid://shopify/Product/123", title: "Chaise" },
    });
    expect(record).toEqual({
      org_id: "org_123",
      connection_id: "conn-uuid",
      resource_type: "product",
      external_id: "gid://shopify/Product/123",
      payload: { id: "gid://shopify/Product/123", title: "Chaise" },
      content_hash: contentHash({
        id: "gid://shopify/Product/123",
        title: "Chaise",
      }),
    });
  });

  it("conserve __parentId dans le payload (parentage pour la normalisation)", () => {
    const record = toRawRecord({
      orgId: "org_123",
      connectionId: "conn-uuid",
      node: {
        id: "gid://shopify/ProductVariant/11",
        __parentId: "gid://shopify/Product/1",
      },
    });
    expect(record.resource_type).toBe("variant");
    expect(record.payload.__parentId).toBe("gid://shopify/Product/1");
  });
});
