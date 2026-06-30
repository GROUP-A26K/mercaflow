import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// Mock chaînable du query-builder Supabase. `limit()` est terminal pour les listes (thenable),
// `maybeSingle()` pour les lectures uniques, `insert()`/`update()` pour les écritures.
const { fromSpy, builder, setResult } = vi.hoisted(() => {
  let result: { data: unknown; error: unknown } = { data: null, error: null };
  const b = {
    select: vi.fn(() => b),
    insert: vi.fn(() => b),
    update: vi.fn(() => b),
    eq: vi.fn(() => b),
    order: vi.fn(() => b),
    limit: vi.fn(() => b),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
    then: (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
      Promise.resolve(result).then(onF, onR),
  };
  return {
    fromSpy: vi.fn(() => b),
    builder: b,
    setResult: (r: { data: unknown; error: unknown }) => {
      result = r;
    },
  };
});
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: fromSpy }),
}));

import {
  AmbiguousConnectionError,
  getActiveConnectionForOrg,
  getConnectionByBulkOperationId,
  recordBulkOperation,
} from "@/lib/data/shopify-connections";

const CONN_ROW = {
  id: "conn-1",
  org_id: "org_1",
  shop_domain: "acme.myshopify.com",
  access_token_enc: "enc",
  scope: "read_products",
  status: "active",
};

beforeEach(() => {
  fromSpy.mockClear();
  builder.select.mockClear();
  builder.insert.mockClear();
  builder.update.mockClear();
  builder.eq.mockClear();
  builder.order.mockClear();
  builder.limit.mockClear();
  builder.maybeSingle.mockClear();
  setResult({ data: null, error: null });
});

describe("recordBulkOperation", () => {
  it("insère la corrélation op id → connexion/org", async () => {
    await recordBulkOperation({
      bulkOperationId: "gid://shopify/BulkOperation/9",
      orgId: "org_1",
      connectionId: "conn-1",
      shopDomain: "acme.myshopify.com",
    });
    expect(fromSpy).toHaveBeenCalledWith("shopify_bulk_operations");
    expect(builder.insert).toHaveBeenCalledWith({
      bulk_operation_id: "gid://shopify/BulkOperation/9",
      org_id: "org_1",
      connection_id: "conn-1",
      shop_domain: "acme.myshopify.com",
    });
  });

  it("propage une erreur Supabase", async () => {
    setResult({ data: null, error: { message: "boom" } });
    await expect(
      recordBulkOperation({
        bulkOperationId: "op",
        orgId: "o",
        connectionId: "c",
        shopDomain: "s",
      }),
    ).rejects.toThrow(/boom/);
  });
});

describe("getConnectionByBulkOperationId", () => {
  it("résout la connexion par l'id d'opération (jointure)", async () => {
    setResult({ data: { connection: CONN_ROW }, error: null });
    const connection = await getConnectionByBulkOperationId(
      "gid://shopify/BulkOperation/9",
    );
    expect(fromSpy).toHaveBeenCalledWith("shopify_bulk_operations");
    expect(builder.eq).toHaveBeenCalledWith(
      "bulk_operation_id",
      "gid://shopify/BulkOperation/9",
    );
    expect(connection?.orgId).toBe("org_1");
  });

  it("renvoie null si l'op n'est pas tracée", async () => {
    setResult({ data: null, error: null });
    expect(await getConnectionByBulkOperationId("op")).toBeNull();
  });
});

describe("getActiveConnectionForOrg", () => {
  it("renvoie la connexion unique de l'org", async () => {
    setResult({ data: [CONN_ROW], error: null });
    const connection = await getActiveConnectionForOrg("org_1");
    expect(connection?.shopDomain).toBe("acme.myshopify.com");
    expect(builder.eq).toHaveBeenCalledWith("org_id", "org_1");
    expect(builder.eq).toHaveBeenCalledWith("status", "active");
    expect(builder.limit).toHaveBeenCalledWith(2);
  });

  it("cible une boutique précise quand `shop` est fourni", async () => {
    setResult({ data: [CONN_ROW], error: null });
    await getActiveConnectionForOrg("org_1", "acme.myshopify.com");
    expect(builder.eq).toHaveBeenCalledWith(
      "shop_domain",
      "acme.myshopify.com",
    );
  });

  it("lève AmbiguousConnectionError si plusieurs boutiques et aucune précisée", async () => {
    setResult({
      data: [CONN_ROW, { ...CONN_ROW, id: "conn-2" }],
      error: null,
    });
    await expect(getActiveConnectionForOrg("org_1")).rejects.toBeInstanceOf(
      AmbiguousConnectionError,
    );
  });

  it("renvoie null si aucune connexion active", async () => {
    setResult({ data: [], error: null });
    expect(await getActiveConnectionForOrg("org_1")).toBeNull();
  });
});
