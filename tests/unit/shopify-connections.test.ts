import { randomBytes } from "node:crypto";

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.mock("server-only", () => ({}));

const { upsertSpy, fromSpy } = vi.hoisted(() => {
  const upsertSpy = vi.fn().mockResolvedValue({ error: null });
  const fromSpy = vi.fn(() => ({ upsert: upsertSpy }));
  return { upsertSpy, fromSpy };
});
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: fromSpy }),
}));

import { upsertShopifyConnection } from "@/lib/data/shopify-connections";
import { decryptToken } from "@/lib/shopify/crypto";

const ORIGINAL_KEY = process.env.SHOPIFY_TOKEN_ENCRYPTION_KEY;

beforeAll(() => {
  process.env.SHOPIFY_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
});

afterAll(() => {
  process.env.SHOPIFY_TOKEN_ENCRYPTION_KEY = ORIGINAL_KEY;
});

beforeEach(() => {
  upsertSpy.mockClear();
  fromSpy.mockClear();
  upsertSpy.mockResolvedValue({ error: null });
});

describe("upsertShopifyConnection", () => {
  it("chiffre le token et upsert sur (org_id, shop_domain)", async () => {
    await upsertShopifyConnection({
      orgId: "org_1",
      shopDomain: "acme.myshopify.com",
      accessToken: "shpat_secret_token",
      scope: "read_products",
    });

    expect(fromSpy).toHaveBeenCalledWith("shopify_connections");
    const [row, options] = upsertSpy.mock.calls[0];
    expect(row.org_id).toBe("org_1");
    expect(row.shop_domain).toBe("acme.myshopify.com");
    expect(row.status).toBe("active");
    // Le token n'est jamais stocké en clair, mais reste déchiffrable.
    expect(row.access_token_enc).not.toContain("shpat_secret_token");
    expect(decryptToken(row.access_token_enc)).toBe("shpat_secret_token");
    expect(options).toEqual({ onConflict: "org_id,shop_domain" });
  });

  it("propage une erreur Supabase", async () => {
    upsertSpy.mockResolvedValueOnce({ error: { message: "boom" } });
    await expect(
      upsertShopifyConnection({
        orgId: "o",
        shopDomain: "a.myshopify.com",
        accessToken: "t",
        scope: "",
      }),
    ).rejects.toThrow(/boom/);
  });
});
