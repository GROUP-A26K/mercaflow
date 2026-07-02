import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// Mock chaînable du query-builder Supabase : `order()` est terminal (thenable) pour une liste.
const { fromSpy, builder, setResult } = vi.hoisted(() => {
  let result: { data: unknown; error: unknown } = { data: null, error: null };
  const b = {
    select: vi.fn(() => b),
    eq: vi.fn(() => b),
    order: vi.fn(() => Promise.resolve(result)),
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

import { listActiveConnectionsForOrg } from "@/lib/data/shopify-connections";

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
  builder.eq.mockClear();
  builder.order.mockClear();
  setResult({ data: null, error: null });
});

describe("listActiveConnectionsForOrg", () => {
  it("filtre sur (org_id, status=active) et mappe les lignes", async () => {
    setResult({
      data: [
        CONN_ROW,
        { ...CONN_ROW, id: "conn-2", shop_domain: "b.myshopify.com" },
      ],
      error: null,
    });
    const connections = await listActiveConnectionsForOrg("org_1");

    expect(fromSpy).toHaveBeenCalledWith("shopify_connections");
    expect(builder.eq).toHaveBeenCalledWith("org_id", "org_1");
    expect(builder.eq).toHaveBeenCalledWith("status", "active");
    expect(connections).toHaveLength(2);
    expect(connections[0].shopDomain).toBe("acme.myshopify.com");
    expect(connections[0].orgId).toBe("org_1");
  });

  it("renvoie un tableau vide si aucune connexion active", async () => {
    setResult({ data: [], error: null });
    expect(await listActiveConnectionsForOrg("org_1")).toEqual([]);
  });

  it("propage une erreur Supabase", async () => {
    setResult({ data: null, error: { message: "boom" } });
    await expect(listActiveConnectionsForOrg("org_1")).rejects.toThrow(/boom/);
  });
});
