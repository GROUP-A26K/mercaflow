import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

// DATA ACCESS LAYER — jobs durables (MER-58). Socle générique pour découpler le travail lourd
// (audit PUS, à terme ingestion) du webhook. Écriture/mutation via client SERVICE-ROLE : le
// worker cron n'a PAS de session Clerk → il contourne la RLS (seule la lecture est org-scopée).
// Le claim d'un job passe par la RPC atomique `claim_background_job` (FOR UPDATE SKIP LOCKED +
// lease) : jamais un SELECT applicatif, sinon deux ticks cron pourraient prendre le même job.

/** Type de job de l'audit catalogue PUS (colonne `type`). */
export const AUDIT_JOB_TYPE = "catalog_audit";

export type BackgroundJobStatus = "queued" | "running" | "completed" | "failed";

export interface BackgroundJob {
  id: string;
  orgId: string;
  type: string;
  status: BackgroundJobStatus;
  connectionId: string | null;
  cursor: string | null;
  processed: number;
  failed: number;
  attempts: number;
  maxAttempts: number;
}

interface BackgroundJobRow {
  id: string;
  org_id: string;
  type: string;
  status: BackgroundJobStatus;
  connection_id: string | null;
  cursor: string | null;
  processed: number;
  failed: number;
  attempts: number;
  max_attempts: number;
}

function mapJob(row: BackgroundJobRow): BackgroundJob {
  return {
    id: row.id,
    orgId: row.org_id,
    type: row.type,
    status: row.status,
    connectionId: row.connection_id,
    cursor: row.cursor,
    processed: row.processed,
    failed: row.failed,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
  };
}

/**
 * Levée quand une mutation ne touche AUCUNE ligne parce que le job a été repris par un autre
 * worker (lease périmé → re-claim → `attempts` incrémenté). Signale au worker courant qu'il est
 * un zombie et doit s'arrêter SANS réécrire (sinon corruption du curseur/statut).
 */
export class LostLeaseError extends Error {
  constructor(id: string) {
    super(`Lease perdu sur le job ${id} (repris par un autre worker)`);
    this.name = "LostLeaseError";
  }
}

/**
 * UPDATE optimiste borné à la propriété du claim : `id` + `attempts` attendu (verrou optimiste).
 * Un re-claim incrémente `attempts` → l'ancien worker ne matche plus 0 ligne → `LostLeaseError`.
 * `.select("id")` fait remonter les lignes affectées pour détecter le cas « 0 ligne ».
 */
async function updateOwnedJob(
  id: string,
  expectedAttempts: number,
  patch: Record<string, unknown>,
  context: string,
): Promise<void> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("background_jobs")
    .update(patch)
    .eq("id", id)
    .eq("attempts", expectedAttempts)
    .select("id");
  if (error) {
    throw new Error(`${context} : ${error.message}`);
  }
  if (!data || (Array.isArray(data) && data.length === 0)) {
    throw new LostLeaseError(id);
  }
}

/**
 * Enqueue un job d'audit pour une connexion. Idempotent : l'index partiel unique
 * `uniq_background_jobs_active` garantit au plus UN job actif (queued/running) par
 * (connexion, type) → un webhook bulk-finish retenté par Shopify n'empile pas de doublons
 * (la `unique_violation` 23505 est absorbée en no-op).
 */
export async function enqueueAuditJob(params: {
  orgId: string;
  connectionId: string;
}): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.from("background_jobs").insert({
    org_id: params.orgId,
    type: AUDIT_JOB_TYPE,
    connection_id: params.connectionId,
    status: "queued",
  });
  if (error && error.code === "23505") {
    // Un job d'audit actif existe déjà pour cette connexion : no-op idempotent. En V1 la
    // cadence de ré-audit est au niveau d'un cycle de sync bulk — les produits changés par une
    // 2ᵉ sync concurrente seront ré-audités au prochain cycle (ré-audit par changement = suivi).
    console.info(
      `Job d'audit déjà actif pour la connexion ${params.connectionId} — enqueue ignoré (idempotent).`,
    );
    return;
  }
  if (error) {
    throw new Error(`Enqueue du job d'audit échoué : ${error.message}`);
  }
}

/**
 * Réclame atomiquement le prochain job d'audit éligible (queued, ou running au lease périmé →
 * reprise après crash). Renvoie null si aucun job disponible.
 */
export async function claimAuditJob(
  leaseSeconds = 300,
): Promise<BackgroundJob | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("claim_background_job", {
    p_type: AUDIT_JOB_TYPE,
    p_lease_seconds: leaseSeconds,
  });
  if (error) {
    throw new Error(`Claim d'un job d'audit échoué : ${error.message}`);
  }
  return data ? mapJob(data as BackgroundJobRow) : null;
}

/**
 * Checkpoint INTRA-invocation : sauvegarde curseur + compteurs, garde le job `running` et
 * RENOUVELLE le lease (`locked_at = now()`). Appelé entre deux pages d'une même invocation
 * worker → un crash après plusieurs pages ne re-traite qu'UNE page (le lease expiré rendra le
 * job réclamable au curseur checkpointé), et un job long n'est pas volé par un re-claim.
 */
export async function checkpointJob(params: {
  id: string;
  expectedAttempts: number;
  cursor: string | null;
  processed: number;
  failed: number;
}): Promise<void> {
  await updateOwnedJob(
    params.id,
    params.expectedAttempts,
    {
      cursor: params.cursor,
      processed: params.processed,
      failed: params.failed,
      status: "running",
      locked_at: new Date().toISOString(),
    },
    "Checkpoint du job échoué",
  );
}

/**
 * Sauvegarde la progression d'un job puis le RELÂCHE (status→queued, lease libéré) : le tick
 * cron suivant le reprend immédiatement au curseur. Remet `attempts` à 0 — le compteur ne borne
 * que les claims SANS progrès (crash avant tout checkpoint), pas la continuation normale d'un
 * gros catalogue étalée sur de nombreux ticks.
 */
export async function saveJobProgress(params: {
  id: string;
  expectedAttempts: number;
  cursor: string | null;
  processed: number;
  failed: number;
}): Promise<void> {
  await updateOwnedJob(
    params.id,
    params.expectedAttempts,
    {
      cursor: params.cursor,
      processed: params.processed,
      failed: params.failed,
      status: "queued",
      locked_at: null,
      attempts: 0,
    },
    "Sauvegarde de la progression échouée",
  );
}

/** Marque un job terminé (compteurs finaux + date de fin, lease libéré), borné au claim courant. */
export async function completeJob(params: {
  id: string;
  expectedAttempts: number;
  processed: number;
  failed: number;
}): Promise<void> {
  await updateOwnedJob(
    params.id,
    params.expectedAttempts,
    {
      status: "completed",
      processed: params.processed,
      failed: params.failed,
      finished_at: new Date().toISOString(),
      locked_at: null,
    },
    "Clôture du job échouée",
  );
}

/** Marque un job en échec terminal (message d'erreur, lease libéré), borné au claim courant. */
export async function failJob(params: {
  id: string;
  expectedAttempts: number;
  error: string;
}): Promise<void> {
  await updateOwnedJob(
    params.id,
    params.expectedAttempts,
    {
      status: "failed",
      last_error: params.error,
      finished_at: new Date().toISOString(),
      locked_at: null,
    },
    "Marquage du job en échec impossible",
  );
}
