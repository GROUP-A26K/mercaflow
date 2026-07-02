-- Scoring PUS (MER-29) : vue de lecture du « now » sur des scores APPEND-ONLY.
-- Les tables `audits` / `scores` sont append-only (un re-run = nouveau snapshot horodaté,
-- jamais d'UPDATE). Pour lire l'état courant d'un produit, on prend le score le PLUS RÉCENT
-- par (product_id, dimension) via `DISTINCT ON ... ORDER BY run_at DESC` (cf. ADR D4).
--
-- `security_invoker = on` : la vue applique la RLS des tables sous-jacentes au rôle appelant
-- (un Server Component Clerk ne voit que son org ; l'ingestion service-role contourne la RLS).

create view public.current_product_scores
  with (security_invoker = on)
  as
select distinct on (s.product_id, s.dimension)
  s.org_id,
  s.product_id,
  s.dimension,
  s.value,
  s.evidence,
  s.audit_id,
  a.run_at
from public.scores s
  join public.audits a on a.id = s.audit_id
order by s.product_id, s.dimension, a.run_at desc, a.id desc;
