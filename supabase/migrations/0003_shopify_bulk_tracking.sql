-- MER-26 — Corrélation bulk operation → connexion qui l'a lancée (table dédiée).
--
-- Problème : le webhook `bulk_operations/finish` ne porte que le domaine de boutique
-- (en-tête) + l'id de l'opération (payload). Résoudre par domaine seul ingérerait dans
-- la mauvaise org si un même domaine est connecté par plusieurs orgs (le schéma autorise
-- `(org_id, shop_domain)`, pas l'unicité globale du domaine).
--
-- Fix : une table de suivi clé par l'id d'opération (GID Shopify, GLOBALEMENT unique).
-- Chaque lancement insère une ligne (id d'op → connexion/org). Le webhook résout par
-- cet id → exactement une org. Une PK sur `bulk_operation_id` garantit l'unicité ; les
-- lignes ne sont jamais écrasées → pas de course « le webhook tardif d'une op précédente
-- est perdu quand une nouvelle ingestion démarre ».

create table public.shopify_bulk_operations (
  bulk_operation_id text primary key,                 -- GID Shopify, globalement unique
  org_id            text not null,
  connection_id     uuid not null references public.shopify_connections(id) on delete cascade,
  shop_domain       text not null,
  status            text not null default 'running',
  created_at        timestamptz not null default now()
);

create index idx_shopify_bulk_operations_connection
  on public.shopify_bulk_operations (connection_id);
create index idx_shopify_bulk_operations_org
  on public.shopify_bulk_operations (org_id);

-- RLS : table d'état SENSIBLE écrite UNIQUEMENT par le client service-role (ingest + webhook),
-- qui contourne la RLS. Pas de policy INSERT/UPDATE/DELETE pour le rôle authentifié : un tenant
-- ne doit jamais pouvoir réserver/empoisonner un `bulk_operation_id` que le webhook corrèle
-- ensuite à une connexion. Seule une lecture org-scopée est autorisée (visibilité dashboard).
alter table public.shopify_bulk_operations enable row level security;

create policy shopify_bulk_operations on public.shopify_bulk_operations
  for select using (public.clerk_org_id() = org_id);
