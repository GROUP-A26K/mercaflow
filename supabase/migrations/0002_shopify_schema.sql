-- Product Intelligence Graph — schéma d'intégration Shopify.
-- Réf : épic MER-23 / sous-issue MER-25 ; ADR D-2026-06-26 (vault MercaflowWiki).
--
-- Tenancy (décision 2026-06-29) : multi-tenant par ORG Clerk. Toute table porte un
-- `org_id` (dénormalisé pour une RLS simple et indexée — pas de jointure dans les policies)
-- et la RLS compare `org_id` au claim d'org du JWT Clerk.
--
-- Prérequis : Clerk Organizations activé + intégration "Third-Party Auth" Clerk↔Supabase
-- (sinon le JWT n'a pas de claim d'org → la RLS bloque tout, requêtes en rôle `anon`).
--
-- 3 couches :
--   1. Ingestion brute      : raw_records (append-only, payload + content_hash)
--   2. Entités canoniques   : products / variants / attributes
--   3. Intelligence longit.  : audits / scores / variant_eligibility / fixes / retests (append-only)

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Id de l'organisation Clerk active, robuste aux deux formats de session token :
--   - `o` (objet) → claim par défaut récent : { id, slg, rol, per }
--   - `org_id`    → claim plat legacy
-- Renvoie NULL si aucune org active (→ la RLS refuse l'accès, comportement voulu).
create or replace function public.clerk_org_id() returns text
  language sql stable
as $$
  select coalesce(
    auth.jwt() -> 'o' ->> 'id',
    auth.jwt() ->> 'org_id'
  );
$$;

-- Met à jour automatiquement `updated_at` à chaque UPDATE.
create or replace function public.set_updated_at() returns trigger
  language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Couche 1 — Connexion + ingestion brute
-- ---------------------------------------------------------------------------

create table public.shopify_connections (
  id                uuid primary key default gen_random_uuid(),
  org_id            text not null,
  shop_domain       text not null,
  access_token_enc  text,                                   -- token offline chiffré (rempli par MER-24)
  scope             text,
  status            text not null default 'active' check (status in ('active', 'revoked')),
  installed_at      timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (org_id, shop_domain)
);

create table public.raw_records (
  id             uuid primary key default gen_random_uuid(),
  org_id         text not null,
  connection_id  uuid not null references public.shopify_connections(id) on delete cascade,
  resource_type  text not null,                             -- 'product' | 'variant' | 'metafield' | 'metaobject' | ...
  external_id    text not null,                             -- gid Shopify
  payload        jsonb not null,
  content_hash   text not null,
  fetched_at     timestamptz not null default now(),
  unique (connection_id, external_id, content_hash)         -- dédup : ignore les payloads identiques (no-op)
);

-- ---------------------------------------------------------------------------
-- Couche 2 — Entités canoniques
-- ---------------------------------------------------------------------------

create table public.products (
  id                 uuid primary key default gen_random_uuid(),
  org_id             text not null,
  connection_id      uuid not null references public.shopify_connections(id) on delete cascade,
  canonical_key      text not null,                         -- = shopify_product_id en V1 (D2)
  shopify_product_id text not null,
  title              text,
  description_html   text,
  vendor             text,
  pdp_url            text,
  status             text,
  updated_at         timestamptz not null default now(),
  unique (connection_id, shopify_product_id)
);

create table public.variants (
  id                 uuid primary key default gen_random_uuid(),
  org_id             text not null,
  product_id         uuid not null references public.products(id) on delete cascade,
  shopify_variant_id text not null,
  sku                text,
  gtin               text,                                  -- barcode : signal d'audit (D2), futur join key
  price              numeric(12, 2),
  currency           text,
  inventory_qty      integer,
  availability       text,
  position           integer,
  unique (product_id, shopify_variant_id)
);

-- Metafields + metaobjects, polymorphe (rattaché à un product OU un variant).
create table public.attributes (
  id          uuid primary key default gen_random_uuid(),
  org_id      text not null,
  owner_type  text not null check (owner_type in ('product', 'variant')),
  owner_id    uuid not null,
  namespace   text not null,
  key         text not null,
  value       text,
  value_type  text
);

-- ---------------------------------------------------------------------------
-- Couche 3 — Intelligence longitudinale (APPEND-ONLY : jamais d'UPDATE/DELETE applicatif)
-- ---------------------------------------------------------------------------

create table public.audits (
  id          uuid primary key default gen_random_uuid(),
  org_id      text not null,
  product_id  uuid not null references public.products(id) on delete cascade,
  model       text,                                         -- 'chatgpt' | 'perplexity' | 'gemini'
  context     jsonb,
  run_at      timestamptz not null default now()
);

-- 7 scores/SKU stockés EN LIGNES (dimension = text → extensible sans migration, cf. ADR).
create table public.scores (
  id          uuid primary key default gen_random_uuid(),
  org_id      text not null,
  audit_id    uuid not null references public.audits(id) on delete cascade,
  product_id  uuid not null references public.products(id) on delete cascade,
  dimension   text not null,
  value       numeric(5, 2),
  evidence    jsonb,                                        -- le « pourquoi »
  created_at  timestamptz not null default now()
);

-- Flags d'éligibilité au niveau variant → remontent (rollup) vers les scores product.
create table public.variant_eligibility (
  id          uuid primary key default gen_random_uuid(),
  org_id      text not null,
  audit_id    uuid not null references public.audits(id) on delete cascade,
  variant_id  uuid not null references public.variants(id) on delete cascade,
  issues      jsonb,
  created_at  timestamptz not null default now()
);

create table public.fixes (
  id          uuid primary key default gen_random_uuid(),
  org_id      text not null,
  product_id  uuid not null references public.products(id) on delete cascade,
  dimension   text not null,
  before      jsonb,
  after       jsonb,
  fix_type    text,
  status      text not null default 'suggested' check (status in ('suggested', 'applied', 'pushed')),
  applied_at  timestamptz,
  pushed_to   text,                                         -- 'shopify' | 'akeneo' | ...
  created_at  timestamptz not null default now()
);

create table public.retests (
  id            uuid primary key default gen_random_uuid(),
  org_id        text not null,
  fix_id        uuid not null references public.fixes(id) on delete cascade,
  audit_id      uuid not null references public.audits(id) on delete cascade,
  score_before  numeric(5, 2),
  score_after   numeric(5, 2),
  delta         numeric(6, 2),
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------

create trigger set_updated_at_shopify_connections
  before update on public.shopify_connections
  for each row execute function public.set_updated_at();

create trigger set_updated_at_products
  before update on public.products
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Index (org_id partout pour la RLS + accès par parent / clés métier)
-- ---------------------------------------------------------------------------

create index idx_shopify_connections_org      on public.shopify_connections (org_id);
create index idx_raw_records_org              on public.raw_records (org_id);
create index idx_raw_records_connection       on public.raw_records (connection_id, resource_type);
create index idx_products_org                 on public.products (org_id);
create index idx_products_canonical_key       on public.products (canonical_key);
create index idx_variants_org                 on public.variants (org_id);
create index idx_variants_product             on public.variants (product_id);
create index idx_variants_gtin                on public.variants (gtin);
create index idx_attributes_org               on public.attributes (org_id);
create index idx_attributes_owner             on public.attributes (owner_type, owner_id);
create index idx_audits_org                   on public.audits (org_id);
create index idx_audits_product               on public.audits (product_id, run_at desc);
create index idx_scores_org                   on public.scores (org_id);
create index idx_scores_product               on public.scores (product_id, dimension);
create index idx_variant_eligibility_org      on public.variant_eligibility (org_id);
create index idx_variant_eligibility_variant  on public.variant_eligibility (variant_id);
create index idx_fixes_org                    on public.fixes (org_id);
create index idx_fixes_product                on public.fixes (product_id, dimension);
create index idx_retests_org                  on public.retests (org_id);
create index idx_retests_fix                  on public.retests (fix_id);

-- ---------------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------------
-- Modèle :
--   - SELECT + INSERT org-scopés sur TOUTES les tables (lecture via Server Components Clerk).
--   - UPDATE + DELETE org-scopés UNIQUEMENT sur les tables mutables (couches 1 & 2).
--   - Les tables d'intelligence (couche 3) n'ont PAS d'UPDATE/DELETE → append-only au niveau
--     du rôle authentifié (le rôle service-role utilisé par l'ingestion contourne la RLS).
-- Tout est scopé par `clerk_org_id() = org_id`.

alter table public.shopify_connections  enable row level security;
alter table public.raw_records           enable row level security;
alter table public.products              enable row level security;
alter table public.variants              enable row level security;
alter table public.attributes            enable row level security;
alter table public.audits                enable row level security;
alter table public.scores                enable row level security;
alter table public.variant_eligibility   enable row level security;
alter table public.fixes                 enable row level security;
alter table public.retests               enable row level security;

-- SELECT + INSERT pour toutes les tables (org-scopé).
do $$
declare
  t text;
  tables text[] := array[
    'shopify_connections', 'raw_records', 'products', 'variants', 'attributes',
    'audits', 'scores', 'variant_eligibility', 'fixes', 'retests'
  ];
begin
  foreach t in array tables loop
    execute format(
      'create policy %1$I on public.%1$I for select using (public.clerk_org_id() = org_id);',
      t
    );
    execute format(
      'create policy %1$s_insert on public.%1$I for insert with check (public.clerk_org_id() = org_id);',
      t
    );
  end loop;
end $$;

-- UPDATE + DELETE uniquement sur les tables mutables (couches 1 & 2).
do $$
declare
  t text;
  mutable text[] := array[
    'shopify_connections', 'raw_records', 'products', 'variants', 'attributes'
  ];
begin
  foreach t in array mutable loop
    execute format(
      'create policy %1$s_update on public.%1$I for update using (public.clerk_org_id() = org_id) with check (public.clerk_org_id() = org_id);',
      t
    );
    execute format(
      'create policy %1$s_delete on public.%1$I for delete using (public.clerk_org_id() = org_id);',
      t
    );
  end loop;
end $$;
