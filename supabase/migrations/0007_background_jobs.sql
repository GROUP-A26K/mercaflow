-- Brique de jobs durables (MER-58) — suivi de revue MER-29 (PR #33).
-- ADR : D-2026-07-02 « Durabilité des jobs de fond » (vault MercaflowWiki).
--
-- Problème : `runConnectionAudit` tournait dans le `after()` du webhook bulk-finish, 1 fetch
-- PDP / produit (concurrence 5). Sur 500–20k SKU → >1 h → dépasse la durée serverless, et un
-- crash n'a aucun retry. Solution : une table de jobs générique drainée par Vercel Cron,
-- batchée par pages de produits (keyset), avec claim atomique + lease (reprise après crash).
--
-- Générique dès le départ : `type` = 'catalog_audit' en V1, extensible (ingestion, fixes…)
-- sans migration. MER-58 ne câble que l'audit ; la migration de l'ingestion = suivi (MER-26).

create table public.background_jobs (
  id             uuid primary key default gen_random_uuid(),
  org_id         text not null,
  type           text not null,                              -- 'catalog_audit' (extensible)
  status         text not null default 'queued'
                   check (status in ('queued', 'running', 'completed', 'failed')),
  connection_id  uuid references public.shopify_connections(id) on delete cascade,
  cursor         text,                                       -- keyset : dernier product.id traité
  processed      integer not null default 0,                 -- produits audités (cumulé)
  failed         integer not null default 0,                 -- produits en échec (cumulé)
  attempts       integer not null default 0,                 -- nb de claims (garde anti-boucle)
  max_attempts   integer not null default 20,
  last_error     text,
  payload        jsonb,                                      -- extensible (params de job)
  locked_at      timestamptz,                                -- lease : détecte un worker mort
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  started_at     timestamptz,
  finished_at    timestamptz
);

-- Anti-doublon : au plus UN job actif (queued/running) par (connexion, type). Le webhook
-- bulk-finish peut être retenté par Shopify → l'enqueue devient idempotent (ON CONFLICT).
-- ⚠️ On EXCLUT les jobs épuisés (`attempts >= max_attempts`) : un job « poison » (échec répété
-- avant tout progrès) sort du claim (`attempts < max_attempts`) MAIS resterait sinon compté par
-- l'index → il bloquerait à jamais tout nouvel audit de la connexion. En l'excluant, un enqueue
-- ultérieur repart proprement (le job poison devient un vestige inerte, jamais réclamé).
create unique index uniq_background_jobs_active
  on public.background_jobs (connection_id, type)
  where status in ('queued', 'running') and attempts < max_attempts;

create index idx_background_jobs_org    on public.background_jobs (org_id);
create index idx_background_jobs_claim  on public.background_jobs (type, status, created_at);

create trigger set_updated_at_background_jobs
  before update on public.background_jobs
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Claim atomique d'un job (worker cron)
-- ---------------------------------------------------------------------------
-- Sélectionne le plus ancien job éligible et le passe `running` en UNE transaction.
-- `FOR UPDATE SKIP LOCKED` : deux ticks cron concurrents ne prennent jamais le même job.
-- Éligible = `queued`, OU `running` dont le lease `locked_at` est périmé (worker mort →
-- reprise après crash). Renvoie NULL si aucun job (→ le worker répond no-op).
create or replace function public.claim_background_job(
  p_type          text,
  p_lease_seconds integer default 300
) returns public.background_jobs
  language plpgsql
  security invoker
  set search_path = public
as $$
declare
  v_job public.background_jobs;
begin
  select * into v_job
  from public.background_jobs
  where type = p_type
    and attempts < max_attempts
    and (
      status = 'queued'
      or (status = 'running' and locked_at < now() - make_interval(secs => p_lease_seconds))
    )
  order by created_at
  for update skip locked
  limit 1;

  if not found then
    return null;
  end if;

  update public.background_jobs
    set status     = 'running',
        attempts   = attempts + 1,
        locked_at  = now(),
        started_at = coalesce(started_at, now()),
        updated_at = now()
    where id = v_job.id
    returning * into v_job;

  return v_job;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------------
-- Les jobs sont écrits/mutés UNIQUEMENT par le worker service-role (contourne la RLS).
-- Le rôle authentifié Clerk n'a besoin que du SELECT org-scopé (futur affichage de progression).
-- Pas de policy INSERT/UPDATE/DELETE → aucune écriture possible en rôle authentifié.
alter table public.background_jobs enable row level security;

create policy background_jobs on public.background_jobs
  for select using (public.clerk_org_id() = org_id);

-- Least privilege : seul service_role peut réclamer un job (la RPC fait un UPDATE).
revoke all on function public.claim_background_job(text, integer) from public, anon, authenticated;
grant execute on function public.claim_background_job(text, integer) to service_role;
