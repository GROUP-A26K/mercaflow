import "server-only";

import {
  checkpointJob,
  claimAuditJob,
  completeJob,
  failJob,
  LostLeaseError,
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
/**
 * Produits audités par page (keyset). Borné pour qu'UNE page tienne DANS la fenêtre serverless :
 * pire cas ≈ ceil(pageSize / concurrence 5) × timeout fetch PDP 8 s. À 25 → ~5 tours × 8 s = 40 s.
 */
const DEFAULT_PAGE_SIZE = 25;
/**
 * Budget temps : on n'ENTAME une nouvelle page que si l'écoulé est sous ce seuil, en laissant la
 * place au pire cas d'une page (~40 s). 15 s + 40 s = 55 s < `maxDuration` route (60 s) → jamais
 * coupé en plein milieu (sinon checkpoint perdu + un `attempts` consommé pour rien). La 1ʳᵉ page
 * s'exécute toujours (écoulé = 0). Invariant : budget + pire-cas-page < maxDuration.
 */
const DEFAULT_TIME_BUDGET_MS = 15_000;

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
  /** true si l'invocation s'est arrêtée car le job a été repris par un autre worker. */
  lostLease?: boolean;
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

  // `attempts` du claim = jeton de propriété : toute mutation est bornée à cette valeur (verrou
  // optimiste). Si un autre worker re-réclame (lease périmé → attempts++), nos écritures matchent
  // 0 ligne → `LostLeaseError` → arrêt propre sans corrompre le curseur/statut du job.
  const expectedAttempts = claimed.attempts;
  let cursor = claimed.cursor;
  let processed = claimed.processed;
  let failed = claimed.failed;

  // Un seul try/catch couvre TOUTES les mutations (y compris les `failJob` des cas terminaux) :
  // si le job a été repris entre-temps, un `LostLeaseError` sur n'importe quel appel doit se
  // traduire par un arrêt propre, jamais par une 500 bruyante côté route.
  try {
    if (!claimed.connectionId) {
      await failJob({
        id: claimed.id,
        expectedAttempts,
        error: "job d'audit sans connection_id",
      });
      return {
        claimed: true,
        jobId: claimed.id,
        processed,
        failed,
        done: false,
      };
    }

    const connection = await getConnectionById(claimed.connectionId);
    if (!connection || connection.status !== "active") {
      await failJob({
        id: claimed.id,
        expectedAttempts,
        error: `connexion ${claimed.connectionId} introuvable ou inactive`,
      });
      return {
        claimed: true,
        jobId: claimed.id,
        processed,
        failed,
        done: false,
      };
    }

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
        await completeJob({
          id: claimed.id,
          expectedAttempts,
          processed,
          failed,
        });
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
        await saveJobProgress({
          id: claimed.id,
          expectedAttempts,
          cursor,
          processed,
          failed,
        });
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
      await checkpointJob({
        id: claimed.id,
        expectedAttempts,
        cursor,
        processed,
        failed,
      });
    }
  } catch (error) {
    if (error instanceof LostLeaseError) {
      // Un autre worker a repris le job (notre lease avait expiré) → on s'efface sans réécrire.
      console.warn(error.message);
      return {
        claimed: true,
        jobId: claimed.id,
        processed,
        failed,
        done: false,
        lostLease: true,
      };
    }
    throw error;
  }
}
