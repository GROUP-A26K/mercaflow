import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// DAL des jobs durables (MER-58). Écriture/mutation via client SERVICE-ROLE (le worker cron
// n'a pas de session Clerk). On mocke `from` (capture insert + update chaîné avec ses filtres
// `eq`) et `rpc` (claim atomique). Les mutations de job sont bornées à la propriété du claim
// (`id` + `attempts` attendu = verrou optimiste) : 0 ligne touchée → `LostLeaseError`.

const { fromSpy, rpcSpy, state } = vi.hoisted(() => {
  const state: {
    inserts: unknown[];
    updates: { payload: unknown; filters: [string, unknown][] }[];
    fromResult: { data?: unknown; error: unknown };
    rpcResult: { data?: unknown; error: unknown };
    rpcCalls: { name: string; args: unknown }[];
  } = {
    inserts: [],
    updates: [],
    fromResult: { data: [{ id: "job-1" }], error: null },
    rpcResult: { data: null, error: null },
    rpcCalls: [],
  };

  const fromSpy = vi.fn(() => {
    let current: { payload: unknown; filters: [string, unknown][] } | null =
      null;
    const builder: Record<string, unknown> = {
      insert: vi.fn((payload: unknown) => {
        state.inserts.push(payload);
        return builder;
      }),
      update: vi.fn((payload: unknown) => {
        current = { payload, filters: [] };
        state.updates.push(current);
        return builder;
      }),
      eq: vi.fn((col: string, val: unknown) => {
        if (current) current.filters.push([col, val]);
        return builder;
      }),
      select: vi.fn(() => builder),
      then: (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
        Promise.resolve(state.fromResult).then(onF, onR),
    };
    return builder;
  });

  const rpcSpy = vi.fn((name: string, args: unknown) => {
    state.rpcCalls.push({ name, args });
    return Promise.resolve(state.rpcResult);
  });

  return { fromSpy, rpcSpy, state };
});

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: fromSpy, rpc: rpcSpy }),
}));

import {
  AUDIT_JOB_TYPE,
  checkpointJob,
  claimAuditJob,
  completeJob,
  enqueueAuditJob,
  failJob,
  LostLeaseError,
  saveJobProgress,
} from "@/lib/data/background-jobs";

beforeEach(() => {
  state.inserts = [];
  state.updates = [];
  state.fromResult = { data: [{ id: "job-1" }], error: null };
  state.rpcResult = { data: null, error: null };
  state.rpcCalls = [];
  fromSpy.mockClear();
  rpcSpy.mockClear();
});

describe("enqueueAuditJob", () => {
  it("insère un job catalog_audit queued pour la connexion", async () => {
    await enqueueAuditJob({ orgId: "org_1", connectionId: "conn-1" });

    expect(fromSpy).toHaveBeenCalledWith("background_jobs");
    expect(state.inserts[0]).toEqual({
      org_id: "org_1",
      type: AUDIT_JOB_TYPE,
      connection_id: "conn-1",
      status: "queued",
    });
  });

  it("est idempotent : un doublon (unique_violation 23505) est absorbé, pas d'erreur", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    state.fromResult = { error: { code: "23505", message: "duplicate" } };
    await expect(
      enqueueAuditJob({ orgId: "org_1", connectionId: "conn-1" }),
    ).resolves.toBeUndefined();
  });

  it("propage toute autre erreur d'insertion", async () => {
    state.fromResult = { error: { code: "42501", message: "denied" } };
    await expect(
      enqueueAuditJob({ orgId: "org_1", connectionId: "conn-1" }),
    ).rejects.toThrow(/denied/);
  });
});

describe("claimAuditJob", () => {
  it("réclame via la RPC atomique et mappe la ligne renvoyée", async () => {
    state.rpcResult = {
      data: {
        id: "job-1",
        org_id: "org_1",
        type: AUDIT_JOB_TYPE,
        status: "running",
        connection_id: "conn-1",
        cursor: "prod-42",
        processed: 100,
        failed: 2,
        attempts: 1,
        max_attempts: 20,
      },
      error: null,
    };

    const job = await claimAuditJob(120);

    expect(state.rpcCalls[0]).toEqual({
      name: "claim_background_job",
      args: { p_type: AUDIT_JOB_TYPE, p_lease_seconds: 120 },
    });
    expect(job).toEqual({
      id: "job-1",
      orgId: "org_1",
      type: AUDIT_JOB_TYPE,
      status: "running",
      connectionId: "conn-1",
      cursor: "prod-42",
      processed: 100,
      failed: 2,
      attempts: 1,
      maxAttempts: 20,
    });
  });

  it("renvoie null quand aucun job n'est éligible", async () => {
    state.rpcResult = { data: null, error: null };
    expect(await claimAuditJob()).toBeNull();
  });

  it("propage une erreur de la RPC de claim", async () => {
    state.rpcResult = { data: null, error: { message: "claim boom" } };
    await expect(claimAuditJob()).rejects.toThrow(/claim boom/);
  });
});

describe("checkpointJob", () => {
  it("sauvegarde le curseur (running + lease renouvelé), borné à id + attempts attendu", async () => {
    await checkpointJob({
      id: "job-1",
      expectedAttempts: 3,
      cursor: "prod-50",
      processed: 50,
      failed: 1,
    });

    const upd = state.updates[0];
    // Verrou optimiste : filtré par id ET par attempts du claim.
    expect(upd.filters).toEqual([
      ["id", "job-1"],
      ["attempts", 3],
    ]);
    const payload = upd.payload as Record<string, unknown>;
    expect(payload.status).toBe("running");
    expect(payload.cursor).toBe("prod-50");
    expect(payload.processed).toBe(50);
    expect(payload.failed).toBe(1);
    expect(typeof payload.locked_at).toBe("string");
  });

  it("lève LostLeaseError si aucune ligne n'est touchée (job repris par un autre worker)", async () => {
    state.fromResult = { data: [], error: null };
    await expect(
      checkpointJob({
        id: "job-1",
        expectedAttempts: 2,
        cursor: "prod-9",
        processed: 9,
        failed: 0,
      }),
    ).rejects.toBeInstanceOf(LostLeaseError);
  });
});

describe("saveJobProgress", () => {
  it("relâche le job (queued, lease libéré, attempts remis à 0), borné au claim", async () => {
    await saveJobProgress({
      id: "job-1",
      expectedAttempts: 4,
      cursor: "prod-99",
      processed: 150,
      failed: 3,
    });

    const upd = state.updates[0];
    expect(upd.filters).toEqual([
      ["id", "job-1"],
      ["attempts", 4],
    ]);
    expect(upd.payload).toEqual({
      cursor: "prod-99",
      processed: 150,
      failed: 3,
      status: "queued",
      locked_at: null,
      attempts: 0,
    });
  });
});

describe("completeJob", () => {
  it("marque le job completed (compteurs finaux + date de fin), borné au claim", async () => {
    await completeJob({
      id: "job-1",
      expectedAttempts: 1,
      processed: 200,
      failed: 5,
    });

    const upd = state.updates[0];
    expect(upd.filters).toEqual([
      ["id", "job-1"],
      ["attempts", 1],
    ]);
    const payload = upd.payload as Record<string, unknown>;
    expect(payload.status).toBe("completed");
    expect(payload.processed).toBe(200);
    expect(payload.failed).toBe(5);
    expect(payload.locked_at).toBeNull();
    expect(typeof payload.finished_at).toBe("string");
  });
});

describe("failJob", () => {
  it("marque le job failed avec le message d'erreur, borné au claim", async () => {
    await failJob({
      id: "job-1",
      expectedAttempts: 1,
      error: "connexion révoquée",
    });

    const upd = state.updates[0];
    expect(upd.filters).toEqual([
      ["id", "job-1"],
      ["attempts", 1],
    ]);
    const payload = upd.payload as Record<string, unknown>;
    expect(payload.status).toBe("failed");
    expect(payload.last_error).toBe("connexion révoquée");
    expect(payload.locked_at).toBeNull();
  });
});
