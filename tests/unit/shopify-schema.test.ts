import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// Test-garde du schéma Shopify (MER-25). On ne dispose pas d'une vraie DB en unit ;
// ce test vérifie statiquement les invariants de SÉCURITÉ et de structure de la
// migration, pour empêcher la régression la plus dangereuse : une table sans RLS.
// La vérification fonctionnelle de la RLS (rôle authentifié vs anon) se fait en
// intégration contre Supabase, une fois Clerk Organizations activé.

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/0002_shopify_schema.sql"),
  "utf8",
);

// Toutes les tables du Product Intelligence Graph (3 couches).
const TABLES = [
  "shopify_connections",
  "raw_records",
  "products",
  "variants",
  "attributes",
  "audits",
  "scores",
  "variant_eligibility",
  "fixes",
  "retests",
] as const;

// Couche 3 — intelligence longitudinale : append-only (jamais d'UPDATE/DELETE applicatif).
const APPEND_ONLY = [
  "audits",
  "scores",
  "variant_eligibility",
  "fixes",
  "retests",
] as const;

describe("migration 0002_shopify_schema", () => {
  it("définit le helper d'org Clerk robuste aux deux formats de claim", () => {
    expect(migration).toContain("function public.clerk_org_id()");
    expect(migration).toContain("auth.jwt() -> 'o' ->> 'id'"); // session token récent
    expect(migration).toContain("auth.jwt() ->> 'org_id'"); // claim legacy
  });

  it.each(TABLES)("crée la table %s avec un org_id", (table) => {
    expect(migration).toContain(`create table public.${table} (`);
    // Dénormalisation org_id pour une RLS simple et indexée.
    expect(migration).toMatch(new RegExp(`create index idx_${table}_org`));
  });

  it.each(TABLES)("active la Row-Level Security sur %s", (table) => {
    expect(migration).toMatch(
      new RegExp(`alter table public\\.${table}\\s+enable row level security;`),
    );
  });

  it("scope toutes les tables dans le bloc de policies SELECT/INSERT", () => {
    for (const table of TABLES) {
      expect(migration).toContain(`'${table}'`);
    }
    expect(migration).toContain("public.clerk_org_id() = org_id");
  });

  it("garde les tables d'intelligence en append-only (hors liste mutable)", () => {
    // Le bloc UPDATE/DELETE ne porte que sur les tables mutables (couches 1 & 2).
    const mutableBlock = migration.slice(migration.indexOf("mutable text[]"));
    for (const table of APPEND_ONLY) {
      expect(mutableBlock).not.toContain(`'${table}'`);
    }
  });
});
