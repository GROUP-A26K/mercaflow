-- MER-26 — Corrélation bulk operation → connexion qui l'a lancée.
--
-- Problème : le webhook `bulk_operations/finish` ne porte que le domaine de boutique
-- (en-tête) + l'id de l'opération (payload). Si la MÊME boutique est connectée par
-- plusieurs orgs (la contrainte d'unicité du schéma est `(org_id, shop_domain)`, pas
-- `shop_domain` seul), résoudre la connexion par domaine seul ingérerait le catalogue
-- dans la MAUVAISE org (cross-tenant).
--
-- Fix : on mémorise l'id de la bulk operation lancée sur la connexion qui l'a lancée
-- (`/api/shopify/ingest`, côté org authentifiée). Le webhook résout alors la connexion
-- par `(shop_domain, last_bulk_operation_id)` → toujours la bonne org.

alter table public.shopify_connections
  add column last_bulk_operation_id text;

-- Index de résolution côté webhook (lookup par domaine + id d'opération).
create index idx_shopify_connections_bulk_op
  on public.shopify_connections (shop_domain, last_bulk_operation_id);
