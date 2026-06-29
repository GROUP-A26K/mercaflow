import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { createClientSpy } = vi.hoisted(() => ({
  createClientSpy: vi.fn((..._args: unknown[]) => ({ ok: true })),
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: (...args: unknown[]) => createClientSpy(...args),
}));

import { createAdminClient } from "@/lib/supabase/admin";

const SNAPSHOT = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  key: process.env.SUPABASE_SERVICE_ROLE_KEY,
};

beforeEach(() => {
  createClientSpy.mockClear();
});

afterEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = SNAPSHOT.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SNAPSHOT.key;
});

describe("createAdminClient", () => {
  it("instancie le client avec l'URL et la service-role key", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://proj.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service_role_key";
    createAdminClient();
    expect(createClientSpy).toHaveBeenCalledWith(
      "https://proj.supabase.co",
      "service_role_key",
      expect.objectContaining({ auth: expect.any(Object) }),
    );
  });

  it("lève si l'URL est manquante", () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
    expect(() => createAdminClient()).toThrow();
  });

  it("lève si la service-role key est manquante", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://proj.supabase.co";
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(() => createAdminClient()).toThrow();
  });
});
