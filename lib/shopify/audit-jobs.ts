import "server-only";

import {
  checkpointJob,
  claimAuditJob,
  completeJob,
  failJob,
  saveJobProgress,
} from "@/lib/data/background-jobs";
import { getConnectionById } from "@/lib/data/shopify-connections";
import { runAuditBatch } from "@/lib/shopify/audit";
import type { FetchLike } from "@/lib/shopify/discoverability";

// Worker durable de l'audit PUS (MER-58). Draine UN job `catalog_audit` : le réclame
// atomiquement (lease), puis audite le catalogue par pages keyset dans un budget temps borné
// (< durée max serverless). Reprise idempotente : le curseur est checkpointé après chaque page
// (crash → au pire 1 page re-auditée), et le job relâché (queued) au budget est repris par le
// tick cron suivant. Découplé du webhook bulk-finish (qui se contente d'enqueue).

/** Lease : au-delà, un job `running` est considéré orphelin et re-réclamable (worker mort). */
const DEFAULT_LEASE_SECONDS = 300;
/** Produits audités par page (keyset). Petit → peu de perte en cas de crash intra-page. */
const DEFAULT_PAGE_SIZE = 100;
/** Budget temps mou d'une invocation worker : on relâche avant la limite serverless. */
const DEFAULT_TIME_BUDGET_MS = 50_000;

export interface DrainAuditOptions {
  leaseSeconds?: number;
  pageSize?: number;
  timeBudgetMs?: number;
  /** Horloge injectable (tests). */
  now?: () => number;
  /** Fetch injectable (tests). */
  fetchImpl?: FetchLike;
}

export interface DrainAuditResult {
  /** true si un job a été réclamé (sinon no-op). */
  claimed: boolean;
  jobId?: string;
  /** Compteurs cumulés du job (baseline + travail de cette invocation). */
  processed: number;
  failed: number;
  /** true si le job a été mené à complétion dans cette invocation. */
  done: boolean;
}

/**
 * Réclame et fait avancer un job d'audit. Renvoie l'état atteint ; ne lève pas pour les cas
 * terminaux métier (connexion absente/inactive → `failJob`). Une erreur technique (lecture de
 * page KO) remonte à l'appelant : le job reste `running`, son lease expire, il est re-réclamé.
 */
export async function drainAuditJobs(
  options: DrainAuditOptions = {},
): Promise<DrainAuditResult> {
  const leaseSeconds = options.leaseSeconds ?? DEFAULT_LEASE_SECONDS;
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
  const timeBudgetMs = options.timeBudgetMs ?? DEFAULT_TIME_BUDGET_MS;
  const now = options.now ?? (() => Date.now());

  const claimed = await claimAuditJob(leaseSeconds);
  if (!claimed) {
    return { claimed: false, processed: 0, failed: 0, done: false };
  }

  if (!claimed.connectionId) {
    await failJob({ id: claimed.id, error: "job d'audit sans connection_id" });
    return {
      claimed: true,
      jobId: claimed.id,
      processed: claimed.processed,
      failed: claimed.failed,
      done: false,
    };
  }

  const connection = await getConnectionById(claimed.connectionId);
  if (!connection || connection.status !== "active") {
    await failJob({
      id: claimed.id,
      error: `connexion ${claimed.connectionId} introuvable ou inactive`,
    });
    return {
      claimed: true,
      jobId: claimed.id,
      processed: claimed.processed,
      failed: claimed.failed,
      done: false,
    };
  }

  let cursor = claimed.cursor;
  let processed = claimed.processed;
  let failed = claimed.failed;
  const start = now();

  for (;;) {
    const batch = await runAuditBatch(connection, {
      afterCursor: cursor,
      pageSize,
      fetchImpl: options.fetchImpl,
    });
    processed += batch.processed;
    failed += batch.failed;

    if (batch.done) {
      await completeJob({ id: claimed.id, processed, failed });
      return {
        claimed: true,
        jobId: claimed.id,
        processed,
        failed,
        done: true,
      };
    }

    // Page pleine → il reste des produits ; `nextCursor` est non-null.
    cursor = batch.nextCursor;

    if (now() - start >= timeBudgetMs) {
      // Budget atteint : relâcher (queued) → le tick cron suivant reprend au curseur.
      await saveJobProgress({ id: claimed.id, cursor, processed, failed });
      return {
        claimed: true,
        jobId: claimed.id,
        processed,
        failed,
        done: false,
      };
    }

    // Continuer dans la même invocation, mais checkpointer (running + lease renouvelé) pour
    // borner la reprise à une page en cas de crash.
    await checkpointJob({ id: claimed.id, cursor, processed, failed });
  }
}
