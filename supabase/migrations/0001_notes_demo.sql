-- Démo : valide la chaîne d'authentification Clerk → Supabase (RLS).
-- À exécuter dans le SQL Editor de Supabase (ou via la CLI Supabase).
-- Prérequis : intégration "Third-Party Auth" Clerk activée côté Supabase.

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  -- Rempli automatiquement depuis le JWT Clerk (sub = userId Clerk).
  user_id text not null default (auth.jwt() ->> 'sub'),
  content text not null,
  created_at timestamptz not null default now()
);

-- Active la Row-Level Security : sans policy, plus aucun accès.
alter table public.notes enable row level security;

-- Chaque utilisateur ne voit / écrit QUE ses propres notes.
create policy "notes_select_own" on public.notes
  for select using (auth.jwt() ->> 'sub' = user_id);

create policy "notes_insert_own" on public.notes
  for insert with check (auth.jwt() ->> 'sub' = user_id);

create policy "notes_delete_own" on public.notes
  for delete using (auth.jwt() ->> 'sub' = user_id);
