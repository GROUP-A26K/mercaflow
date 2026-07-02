import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  classifyWebhookTopic,
  payloadMatchesTopic,
  shopDomainFromUninstallPayload,
  toRawRecordFromWebhook,
  UnmappableWebhookPayloadError,
} from "@/lib/shopify/webhook-events";

describe("classifyWebhookTopic", () => {
  it.each(["products/create", "products/update", "products/delete"])(
    "classe %s en ingestion produit",
    (topic) => {
      expect(classifyWebhookTopic(topic)).toEqual({
        kind: "ingest",
        resourceType: "product",
      });
    },
  );

  it("classe inventory_levels/update en ingestion inventory_level", () => {
    expect(classifyWebhookTopic("inventory_levels/update")).toEqual({
      kind: "ingest",
      resourceType: "inventory_level",
    });
  });

  it("classe app/uninstalled en révocation", () => {
    expect(classifyWebhookTopic("app/uninstalled")).toEqual({ kind: "revoke" });
  });

  it("ignore un topic non géré (ack sans traitement)", () => {
    expect(classifyWebhookTopic("orders/create")).toEqual({ kind: "ignore" });
  });

  it("ignore un topic absent", () => {
    expect(classifyWebhookTopic(null)).toEqual({ kind: "ignore" });
    expect(classifyWebhookTopic(undefined)).toEqual({ kind: "ignore" });
  });
});

describe("shopDomainFromUninstallPayload", () => {
  it("extrait myshopify_domain du corps signé", () => {
    expect(
      shopDomainFromUninstallPayload({
        id: 1,
        myshopify_domain: "acme.myshopify.com",
      }),
    ).toBe("acme.myshopify.com");
  });

  it("renvoie null si myshopify_domain absent ou non-string", () => {
    expect(shopDomainFromUninstallPayload({ id: 1 })).toBeNull();
    expect(shopDomainFromUninstallPayload({ myshopify_domain: 42 })).toBeNull();
  });
});

describe("payloadMatchesTopic", () => {
  it("accepte un vrai payload produit create/update (GID Product)", () => {
    const payload = {
      id: 123,
      admin_graphql_api_id: "gid://shopify/Product/123",
      title: "Sneaker",
    };
    expect(payloadMatchesTopic("products/update", payload)).toBe(true);
    expect(payloadMatchesTopic("products/create", payload)).toBe(true);
  });

  it("accepte un delete produit minimal { id }", () => {
    expect(payloadMatchesTopic("products/delete", { id: 456 })).toBe(true);
  });

  it("accepte un inventory_levels/update valide", () => {
    expect(
      payloadMatchesTopic("inventory_levels/update", {
        inventory_item_id: 1,
        location_id: 2,
      }),
    ).toBe(true);
  });

  it("rejette un corps boutique (uninstall) rejoué en topic d'ingestion", () => {
    const shopBody = {
      id: 999,
      myshopify_domain: "acme.myshopify.com",
      email: "a@b.c",
    };
    expect(payloadMatchesTopic("products/update", shopBody)).toBe(false);
    expect(payloadMatchesTopic("products/delete", shopBody)).toBe(false);
    expect(payloadMatchesTopic("inventory_levels/update", shopBody)).toBe(
      false,
    );
  });

  it("rejette un produit create/update sans GID Product", () => {
    expect(payloadMatchesTopic("products/update", { id: 123 })).toBe(false);
    expect(
      payloadMatchesTopic("products/update", {
        admin_graphql_api_id: "gid://shopify/Shop/1",
      }),
    ).toBe(false);
  });
});

describe("toRawRecordFromWebhook", () => {
  const base = { orgId: "org_1", connectionId: "conn_1" };

  it("mappe un produit via son admin_graphql_api_id (GID)", () => {
    const record = toRawRecordFromWebhook({
      ...base,
      topic: "products/update",
      payload: {
        id: 123,
        admin_graphql_api_id: "gid://shopify/Product/123",
        title: "Sneaker",
      },
    });
    expect(record).toMatchObject({
      org_id: "org_1",
      connection_id: "conn_1",
      resource_type: "product",
      external_id: "gid://shopify/Product/123",
    });
    expect(record.content_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("compose le GID produit depuis l'id numérique si admin_graphql_api_id absent", () => {
    const record = toRawRecordFromWebhook({
      ...base,
      topic: "products/delete",
      payload: { id: 456 },
    });
    expect(record.external_id).toBe("gid://shopify/Product/456");
    expect(record.resource_type).toBe("product");
  });

  it("compose la clé InventoryLevel depuis inventory_item_id + location_id", () => {
    const record = toRawRecordFromWebhook({
      ...base,
      topic: "inventory_levels/update",
      payload: { inventory_item_id: 111, location_id: 222, available: 5 },
    });
    expect(record.resource_type).toBe("inventory_level");
    // GID canonique Shopify : location_id dans le chemin, inventory_item_id en query.
    expect(record.external_id).toBe(
      "gid://shopify/InventoryLevel/222?inventory_item_id=111",
    );
  });

  it("privilégie admin_graphql_api_id pour l'inventory level s'il est fourni", () => {
    const record = toRawRecordFromWebhook({
      ...base,
      topic: "inventory_levels/update",
      payload: {
        inventory_item_id: 111,
        location_id: 222,
        admin_graphql_api_id: "gid://shopify/InventoryLevel/333",
      },
    });
    expect(record.external_id).toBe("gid://shopify/InventoryLevel/333");
  });

  it("produit un content_hash stable (dédup) et sensible au changement", () => {
    const a = toRawRecordFromWebhook({
      ...base,
      topic: "products/update",
      payload: {
        id: 1,
        admin_graphql_api_id: "gid://shopify/Product/1",
        title: "A",
      },
    });
    const aBis = toRawRecordFromWebhook({
      ...base,
      topic: "products/update",
      payload: {
        title: "A",
        admin_graphql_api_id: "gid://shopify/Product/1",
        id: 1,
      },
    });
    const b = toRawRecordFromWebhook({
      ...base,
      topic: "products/update",
      payload: {
        id: 1,
        admin_graphql_api_id: "gid://shopify/Product/1",
        title: "B",
      },
    });
    expect(a.content_hash).toBe(aBis.content_hash);
    expect(a.content_hash).not.toBe(b.content_hash);
  });

  it("lève sur un topic non ingérable", () => {
    expect(() =>
      toRawRecordFromWebhook({
        ...base,
        topic: "app/uninstalled",
        payload: {},
      }),
    ).toThrow();
  });

  it("lève UnmappableWebhookPayloadError si le produit n'a aucun identifiant", () => {
    expect(() =>
      toRawRecordFromWebhook({
        ...base,
        topic: "products/update",
        payload: { title: "sans id" },
      }),
    ).toThrow(UnmappableWebhookPayloadError);
  });
});
