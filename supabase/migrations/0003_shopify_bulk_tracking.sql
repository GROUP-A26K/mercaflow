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

-- RLS org-scopée (cohérent avec 0002). Les écritures machine (ingest + webhook) passent
-- par le client service-role qui contourne la RLS ; les lectures authentifiées restent
-- limitées à l'org active.
alter table public.shopify_bulk_operations enable row level security;

create policy shopify_bulk_operations on public.shopify_bulk_operations
  for select using (public.clerk_org_id() = org_id);
create policy shopify_bulk_operations_insert on public.shopify_bulk_operations
  for insert with check (public.clerk_org_id() = org_id);
