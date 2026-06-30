import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { upsertSpy, fromSpy } = vi.hoisted(() => {
  const upsertSpy = vi.fn().mockResolvedValue({ error: null });
  const fromSpy = vi.fn(() => ({ upsert: upsertSpy }));
  return { upsertSpy, fromSpy };
});
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: fromSpy }),
}));

import { insertRawRecords } from "@/lib/data/raw-records";
import type { RawRecordInsert } from "@/lib/shopify/raw-record";

const record: RawRecordInsert = {
  org_id: "org_1",
  connection_id: "conn-1",
  resource_type: "product",
  external_id: "gid://shopify/Product/1",
  payload: { id: "gid://shopify/Product/1" },
  content_hash: "abc",
};

beforeEach(() => {
  upsertSpy.mockClear();
  fromSpy.mockClear();
  upsertSpy.mockResolvedValue({ error: null });
});

describe("insertRawRecords", () => {
  it("upsert en ignorant les doublons sur la contrainte de dédup", async () => {
    await insertRawRecords([record]);
    expect(fromSpy).toHaveBeenCalledWith("raw_records");
    const [rows, options] = upsertSpy.mock.calls[0];
    expect(rows).toEqual([record]);
    expect(options).toEqual({
      onConflict: "connection_id,external_id,content_hash",
      ignoreDuplicates: true,
    });
  });

  it("ne fait rien (pas d'appel DB) sur un lot vide", async () => {
    await insertRawRecords([]);
    expect(fromSpy).not.toHaveBeenCalled();
  });

  it("propage une erreur Supabase", async () => {
    upsertSpy.mockResolvedValueOnce({ error: { message: "boom" } });
    await expect(insertRawRecords([record])).rejects.toThrow(/boom/);
  });
});
