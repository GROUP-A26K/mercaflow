import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// DAL des jobs durables (MER-58). Écriture/mutation via client SERVICE-ROLE (le worker cron
// n'a pas de session Clerk). On mocke `from` (capture des payloads insert/update + le filtre
// `eq`) et `rpc` (claim atomique). Le claim passe TOUJOURS par la RPC SKIP LOCKED — jamais par
// un SELECT applicatif.

const { fromSpy, rpcSpy, state } = vi.hoisted(() => {
  const state: {
    inserts: unknown[];
    updates: { payload: unknown; eq: [string, unknown] | null }[];
    fromResult: { data?: unknown; error: unknown };
    rpcResult: { data?: unknown; error: unknown };
    rpcCalls: { name: string; args: unknown }[];
  } = {
    inserts: [],
    updates: [],
    fromResult: { error: null },
    rpcResult: { data: null, error: null },
    rpcCalls: [],
  };

  const fromSpy = vi.fn(() => {
    let pendingUpdate: unknown = undefined;
    const builder: Record<string, unknown> = {
      insert: vi.fn((payload: unknown) => {
        state.inserts.push(payload);
        return builder;
      }),
      update: vi.fn((payload: unknown) => {
        pendingUpdate = payload;
        state.updates.push({ payload, eq: null });
        return builder;
      }),
      eq: vi.fn((col: string, val: unknown) => {
        if (pendingUpdate !== undefined) {
          state.updates[state.updates.length - 1].eq = [col, val];
        }
        return builder;
      }),
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
  saveJobProgress,
} from "@/lib/data/background-jobs";

beforeEach(() => {
  state.inserts = [];
  state.updates = [];
  state.fromResult = { error: null };
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

describe("saveJobProgress", () => {
  it("sauvegarde le curseur, relâche le job (queued, lease libéré) et remet attempts à 0", async () => {
    await saveJobProgress({
      id: "job-1",
      cursor: "prod-99",
      processed: 150,
      failed: 3,
    });

    const upd = state.updates[0];
    expect(upd.eq).toEqual(["id", "job-1"]);
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

describe("checkpointJob", () => {
  it("sauvegarde le curseur en gardant le job running et en renouvelant le lease", async () => {
    await checkpointJob({
      id: "job-1",
      cursor: "prod-50",
      processed: 50,
      failed: 1,
    });

    const upd = state.updates[0];
    expect(upd.eq).toEqual(["id", "job-1"]);
    const payload = upd.payload as Record<string, unknown>;
    expect(payload.status).toBe("running");
    expect(payload.cursor).toBe("prod-50");
    expect(payload.processed).toBe(50);
    expect(payload.failed).toBe(1);
    // Lease renouvelé (pas libéré) → un job long n'est pas volé par un re-claim.
    expect(typeof payload.locked_at).toBe("string");
  });
});

describe("completeJob", () => {
  it("marque le job completed avec les compteurs finaux et une date de fin", async () => {
    await completeJob({ id: "job-1", processed: 200, failed: 5 });

    const upd = state.updates[0];
    expect(upd.eq).toEqual(["id", "job-1"]);
    const payload = upd.payload as Record<string, unknown>;
    expect(payload.status).toBe("completed");
    expect(payload.processed).toBe(200);
    expect(payload.failed).toBe(5);
    expect(payload.locked_at).toBeNull();
    expect(typeof payload.finished_at).toBe("string");
  });
});

describe("failJob", () => {
  it("marque le job failed avec le message d'erreur et libère le lease", async () => {
    await failJob({ id: "job-1", error: "connexion révoquée" });

    const upd = state.updates[0];
    expect(upd.eq).toEqual(["id", "job-1"]);
    const payload = upd.payload as Record<string, unknown>;
    expect(payload.status).toBe("failed");
    expect(payload.last_error).toBe("connexion révoquée");
    expect(payload.locked_at).toBeNull();
  });
});
