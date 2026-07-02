import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// Test-garde de la migration `background_jobs` (MER-58). Pas de vraie DB en unit : on vérifie
// statiquement les invariants de SÉCURITÉ et de durabilité (RLS, claim atomique, lease,
// anti-doublon, least-privilege). La vérification fonctionnelle (claim/lease) se fait en
// intégration contre Supabase dev.

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/0007_background_jobs.sql"),
  "utf8",
);

describe("migration 0007_background_jobs", () => {
  it("crée la table background_jobs avec org_id + statut contraint", () => {
    expect(migration).toContain("create table public.background_jobs (");
    expect(migration).toContain("org_id         text not null");
    expect(migration).toMatch(
      /check \(status in \('queued', 'running', 'completed', 'failed'\)\)/,
    );
  });

  it("active la Row-Level Security et scope le SELECT sur l'org Clerk", () => {
    expect(migration).toMatch(
      /alter table public\.background_jobs enable row level security;/,
    );
    expect(migration).toContain("public.clerk_org_id() = org_id");
  });

  it("garantit au plus un job actif par (connexion, type) — enqueue idempotent", () => {
    expect(migration).toMatch(
      /create unique index uniq_background_jobs_active/,
    );
    // Exclut les jobs épuisés du prédicat → un job « poison » ne bloque pas un futur enqueue.
    expect(migration).toMatch(
      /where status in \('queued', 'running'\) and attempts < max_attempts/,
    );
  });

  it("réclame les jobs atomiquement (FOR UPDATE SKIP LOCKED) avec lease", () => {
    expect(migration).toContain("function public.claim_background_job(");
    expect(migration).toContain("for update skip locked");
    // Reprise après crash : un job `running` au lease périmé redevient éligible.
    expect(migration).toMatch(
      /status = 'running' and locked_at < now\(\) - make_interval/,
    );
  });

  it("restreint l'EXECUTE de la RPC de claim au seul service_role", () => {
    expect(migration).toMatch(
      /revoke all on function public\.claim_background_job\(text, integer\) from public, anon, authenticated;/,
    );
    expect(migration).toMatch(
      /grant execute on function public\.claim_background_job\(text, integer\) to service_role;/,
    );
  });
});
