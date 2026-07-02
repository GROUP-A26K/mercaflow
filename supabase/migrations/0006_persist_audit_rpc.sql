-- Snapshot d'audit transactionnel (MER-57) — suivi de revue MER-29 (PR #33).
--
-- Problème : `persistProductAudit` écrivait un snapshot en 3 INSERT PostgREST séparés
-- (audits → scores → variant_eligibility). PostgREST n'ouvre pas de transaction multi-requêtes
-- → un échec à mi-chemin laissait un snapshot PARTIEL. La couche 3 étant append-only (aucun
-- UPDATE/DELETE applicatif), cette ligne partielle n'était jamais nettoyée et pouvait devenir
-- « current » via la vue DISTINCT ON `current_product_scores` (dimensions/flags manquants).
--
-- Solution : une fonction plpgsql fait les 3 INSERT dans le corps d'UNE transaction. Un
-- plpgsql function s'exécute atomiquement dans la transaction appelante : toute exception
-- (FK, contrainte, réseau) annule l'intégralité de ses effets → tout-ou-rien. La fonction ne
-- fait QUE des INSERT → l'invariant append-only est préservé.
--
-- Sécurité : SECURITY INVOKER (défaut). Appelée par la DAL via le client service-role (qui
-- contourne la RLS, comme toute l'ingestion/audit tournant sans session Clerk). On restreint
-- l'EXECUTE à service_role : anon/authenticated (Clerk) ne peuvent pas l'invoquer via
-- PostgREST. `search_path` figé à public pour éviter toute résolution de nom détournée.

create or replace function public.persist_product_audit(
  p_org_id      text,
  p_product_id  uuid,
  p_model       text,
  p_context     jsonb,
  p_scores      jsonb,   -- [{ dimension, value, evidence }]
  p_eligibility jsonb    -- [{ variant_id, issues }]
) returns uuid
  language plpgsql
  security invoker
  set search_path = public
as $$
declare
  v_audit_id uuid;
begin
  insert into public.audits (org_id, product_id, model, context)
  values (p_org_id, p_product_id, p_model, p_context)
  returning id into v_audit_id;

  -- 1 ligne / dimension. `value` peut être NULL (data-gap ; ->> renvoie NULL → cast OK).
  insert into public.scores (org_id, audit_id, product_id, dimension, value, evidence)
  select
    p_org_id,
    v_audit_id,
    p_product_id,
    s ->> 'dimension',
    (s ->> 'value')::numeric,
    s -> 'evidence'
  from jsonb_array_elements(coalesce(p_scores, '[]'::jsonb)) as s;

  -- 1 ligne / variant éligible (déjà résolu GID → id uuid côté DAL). Tableau vide → 0 insert.
  insert into public.variant_eligibility (org_id, audit_id, variant_id, issues)
  select
    p_org_id,
    v_audit_id,
    (e ->> 'variant_id')::uuid,
    e -> 'issues'
  from jsonb_array_elements(coalesce(p_eligibility, '[]'::jsonb)) as e;

  return v_audit_id;
end;
$$;

-- Least privilege : seul le rôle service-role (DAL machine-à-machine) peut appeler la RPC.
-- ⚠️ Supabase applique un ALTER DEFAULT PRIVILEGES qui accorde EXECUTE à anon/authenticated
-- explicitement (pas via PUBLIC) sur chaque nouvelle fonction → un `revoke from public` seul
-- ne suffit PAS. On révoque donc nommément anon + authenticated (sinon un utilisateur Clerk
-- pourrait invoquer la RPC via PostgREST), puis on (re)grant service_role.
revoke all on function public.persist_product_audit(text, uuid, text, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.persist_product_audit(text, uuid, text, jsonb, jsonb, jsonb) to service_role;
