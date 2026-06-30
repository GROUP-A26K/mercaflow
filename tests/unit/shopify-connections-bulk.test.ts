import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// Mock chaînable du query-builder Supabase (select/update/eq/limit/maybeSingle + thenable).
const { fromSpy, builder, setResult } = vi.hoisted(() => {
  let result: { data: unknown; error: unknown } = { data: null, error: null };
  const b = {
    select: vi.fn(() => b),
    update: vi.fn(() => b),
    eq: vi.fn(() => b),
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
  getConnectionByBulkOperation,
  setConnectionBulkOperation,
} from "@/lib/data/shopify-connections";

beforeEach(() => {
  fromSpy.mockClear();
  builder.select.mockClear();
  builder.update.mockClear();
  builder.eq.mockClear();
  builder.limit.mockClear();
  builder.maybeSingle.mockClear();
  setResult({ data: null, error: null });
});

describe("setConnectionBulkOperation", () => {
  it("écrit last_bulk_operation_id sur la bonne connexion", async () => {
    await setConnectionBulkOperation("conn-1", "gid://shopify/BulkOperation/9");
    expect(fromSpy).toHaveBeenCalledWith("shopify_connections");
    expect(builder.update).toHaveBeenCalledWith({
      last_bulk_operation_id: "gid://shopify/BulkOperation/9",
    });
    expect(builder.eq).toHaveBeenCalledWith("id", "conn-1");
  });

  it("propage une erreur Supabase", async () => {
    setResult({ data: null, error: { message: "boom" } });
    await expect(setConnectionBulkOperation("conn-1", "op")).rejects.toThrow(
      /boom/,
    );
  });
});

describe("getConnectionByBulkOperation", () => {
  it("filtre par domaine ET id d'opération (corrélation anti cross-tenant)", async () => {
    setResult({
      data: {
        id: "conn-1",
        org_id: "org_1",
        shop_domain: "acme.myshopify.com",
        access_token_enc: "enc",
        scope: "read_products",
        status: "active",
      },
      error: null,
    });

    const connection = await getConnectionByBulkOperation(
      "acme.myshopify.com",
      "gid://shopify/BulkOperation/9",
    );

    expect(connection?.orgId).toBe("org_1");
    expect(builder.eq).toHaveBeenCalledWith(
      "shop_domain",
      "acme.myshopify.com",
    );
    expect(builder.eq).toHaveBeenCalledWith(
      "last_bulk_operation_id",
      "gid://shopify/BulkOperation/9",
    );
    expect(builder.eq).toHaveBeenCalledWith("status", "active");
  });

  it("renvoie null si aucune connexion ne correspond", async () => {
    setResult({ data: null, error: null });
    const connection = await getConnectionByBulkOperation(
      "acme.myshopify.com",
      "op",
    );
    expect(connection).toBeNull();
  });
});
