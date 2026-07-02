import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// Worker durable de l'audit (MER-58) : claim d'un job → boucle de batches keyset → checkpoint /
// release / complete. On mocke la DAL des jobs, la lecture de connexion et `runAuditBatch` (le
// batch lui-même est couvert par shopify-audit.test.ts) pour vérifier l'orchestration : reprise
// au curseur, accumulation des compteurs, budget temps, complétion, et gestion des cas terminaux.

const {
  claimSpy,
  checkpointSpy,
  saveProgressSpy,
  completeSpy,
  failSpy,
  getConnSpy,
  runBatchSpy,
  LostLeaseError,
} = vi.hoisted(() => {
  class LostLeaseError extends Error {
    constructor(id: string) {
      super(`Lease perdu sur le job ${id}`);
      this.name = "LostLeaseError";
    }
  }
  return {
    claimSpy: vi.fn(),
    checkpointSpy: vi.fn(),
    saveProgressSpy: vi.fn(),
    completeSpy: vi.fn(),
    failSpy: vi.fn(),
    getConnSpy: vi.fn(),
    runBatchSpy: vi.fn(),
    LostLeaseError,
  };
});

vi.mock("@/lib/data/background-jobs", () => ({
  AUDIT_JOB_TYPE: "catalog_audit",
  LostLeaseError,
  claimAuditJob: claimSpy,
  checkpointJob: checkpointSpy,
  saveJobProgress: saveProgressSpy,
  completeJob: completeSpy,
  failJob: failSpy,
}));
vi.mock("@/lib/data/shopify-connections", () => ({
  getConnectionById: getConnSpy,
}));
vi.mock("@/lib/shopify/audit", () => ({
  runAuditBatch: runBatchSpy,
}));

import { drainAuditJobs } from "@/lib/shopify/audit-jobs";

const activeConnection = {
  id: "conn-1",
  orgId: "org_1",
  shopDomain: "shop.myshopify.com",
  accessTokenEnc: "enc",
  scope: "read_products",
  status: "active",
};

function job(overrides: Record<string, unknown> = {}) {
  return {
    id: "job-1",
    orgId: "org_1",
    type: "catalog_audit",
    status: "running",
    connectionId: "conn-1",
    cursor: null,
    processed: 0,
    failed: 0,
    attempts: 1,
    maxAttempts: 20,
    ...overrides,
  };
}

beforeEach(() => {
  claimSpy.mockReset();
  checkpointSpy.mockReset().mockResolvedValue(undefined);
  saveProgressSpy.mockReset().mockResolvedValue(undefined);
  completeSpy.mockReset().mockResolvedValue(undefined);
  failSpy.mockReset().mockResolvedValue(undefined);
  getConnSpy.mockReset().mockResolvedValue(activeConnection);
  runBatchSpy.mockReset();
});

describe("drainAuditJobs", () => {
  it("no-op quand aucun job n'est réclamé", async () => {
    claimSpy.mockResolvedValue(null);

    const result = await drainAuditJobs();

    expect(result).toEqual({
      claimed: false,
      processed: 0,
      failed: 0,
      done: false,
    });
    expect(runBatchSpy).not.toHaveBeenCalled();
    expect(getConnSpy).not.toHaveBeenCalled();
  });

  it("audite jusqu'à la fin en une invocation : plusieurs pages, checkpoint entre, puis complete", async () => {
    claimSpy.mockResolvedValue(job({ cursor: "p0", processed: 10, failed: 1 }));
    runBatchSpy
      .mockResolvedValueOnce({
        processed: 2,
        failed: 0,
        nextCursor: "p2",
        done: false,
      })
      .mockResolvedValueOnce({
        processed: 1,
        failed: 1,
        nextCursor: null,
        done: true,
      });

    const result = await drainAuditJobs({ pageSize: 2 });

    // Reprise au curseur du job, puis au curseur de page.
    expect(runBatchSpy).toHaveBeenNthCalledWith(1, activeConnection, {
      afterCursor: "p0",
      pageSize: 2,
      fetchImpl: undefined,
    });
    expect(runBatchSpy).toHaveBeenNthCalledWith(2, activeConnection, {
      afterCursor: "p2",
      pageSize: 2,
      fetchImpl: undefined,
    });
    // Un checkpoint entre les pages (running, curseur p2), pas de release. Borné au claim (attempts=1).
    expect(checkpointSpy).toHaveBeenCalledTimes(1);
    expect(checkpointSpy).toHaveBeenCalledWith({
      id: "job-1",
      expectedAttempts: 1,
      cursor: "p2",
      processed: 12,
      failed: 1,
    });
    expect(saveProgressSpy).not.toHaveBeenCalled();
    // Complétion avec les compteurs cumulés (baseline du job + 2 pages).
    expect(completeSpy).toHaveBeenCalledWith({
      id: "job-1",
      expectedAttempts: 1,
      processed: 13,
      failed: 2,
    });
    expect(result).toEqual({
      claimed: true,
      jobId: "job-1",
      processed: 13,
      failed: 2,
      done: true,
    });
  });

  it("relâche le job (queued) quand le budget temps est atteint, sans le compléter", async () => {
    claimSpy.mockResolvedValue(job({ cursor: null, processed: 0, failed: 0 }));
    runBatchSpy.mockResolvedValue({
      processed: 5,
      failed: 0,
      nextCursor: "p5",
      done: false,
    });
    // Horloge : start=0 puis 60_000 → dépasse le budget de 50_000 après la 1re page.
    const now = vi.fn().mockReturnValueOnce(0).mockReturnValue(60_000);

    const result = await drainAuditJobs({ timeBudgetMs: 50_000, now });

    expect(runBatchSpy).toHaveBeenCalledTimes(1);
    expect(saveProgressSpy).toHaveBeenCalledWith({
      id: "job-1",
      expectedAttempts: 1,
      cursor: "p5",
      processed: 5,
      failed: 0,
    });
    expect(completeSpy).not.toHaveBeenCalled();
    expect(result).toEqual({
      claimed: true,
      jobId: "job-1",
      processed: 5,
      failed: 0,
      done: false,
    });
  });

  it("échec terminal si la connexion du job est inactive (révoquée)", async () => {
    claimSpy.mockResolvedValue(job());
    getConnSpy.mockResolvedValue({ ...activeConnection, status: "revoked" });

    const result = await drainAuditJobs();

    expect(failSpy).toHaveBeenCalledWith({
      id: "job-1",
      expectedAttempts: 1,
      error: expect.stringContaining("conn-1"),
    });
    expect(runBatchSpy).not.toHaveBeenCalled();
    expect(result.done).toBe(false);
    expect(result.claimed).toBe(true);
  });

  it("échec terminal si la connexion du job est introuvable (null)", async () => {
    claimSpy.mockResolvedValue(job());
    getConnSpy.mockResolvedValue(null);

    await drainAuditJobs();

    expect(failSpy).toHaveBeenCalledWith({
      id: "job-1",
      expectedAttempts: 1,
      error: expect.stringContaining("conn-1"),
    });
    expect(runBatchSpy).not.toHaveBeenCalled();
  });

  it("échec terminal si le job n'a pas de connection_id", async () => {
    claimSpy.mockResolvedValue(job({ connectionId: null }));

    await drainAuditJobs();

    expect(failSpy).toHaveBeenCalled();
    expect(getConnSpy).not.toHaveBeenCalled();
    expect(runBatchSpy).not.toHaveBeenCalled();
  });

  it("stoppe si la connexion est révoquée EN COURS de drain (re-validation par page)", async () => {
    claimSpy.mockResolvedValue(job({ cursor: null, processed: 0, failed: 0 }));
    // Page 1 : connexion active → auditée ; page 2 : connexion révoquée → on s'arrête.
    getConnSpy
      .mockResolvedValueOnce(activeConnection)
      .mockResolvedValue({ ...activeConnection, status: "revoked" });
    runBatchSpy.mockResolvedValue({
      processed: 2,
      failed: 0,
      nextCursor: "p2",
      done: false,
    });

    const result = await drainAuditJobs({ timeBudgetMs: 50_000 });

    // Une seule page auditée avant la détection de révocation.
    expect(runBatchSpy).toHaveBeenCalledTimes(1);
    expect(failSpy).toHaveBeenCalledWith({
      id: "job-1",
      expectedAttempts: 1,
      error: expect.stringContaining("conn-1"),
    });
    expect(completeSpy).not.toHaveBeenCalled();
    expect(result.done).toBe(false);
  });

  it("s'arrête proprement (lostLease) si un checkpoint révèle un job repris par un autre worker", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    claimSpy.mockResolvedValue(job({ cursor: null, processed: 0, failed: 0 }));
    runBatchSpy.mockResolvedValue({
      processed: 3,
      failed: 0,
      nextCursor: "p3",
      done: false,
    });
    // Le checkpoint échoue en LostLeaseError → le worker s'efface sans compléter.
    checkpointSpy.mockRejectedValueOnce(new LostLeaseError("job-1"));

    const result = await drainAuditJobs({ timeBudgetMs: 50_000 });

    expect(result).toEqual({
      claimed: true,
      jobId: "job-1",
      processed: 3,
      failed: 0,
      done: false,
      lostLease: true,
    });
    expect(completeSpy).not.toHaveBeenCalled();
    expect(saveProgressSpy).not.toHaveBeenCalled();
  });
});
