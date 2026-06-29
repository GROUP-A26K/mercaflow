import { describe, expect, it } from "vitest";

import {
  extractLinearId,
  shouldSkipSource,
  injectLinearId,
} from "@/scripts/git-hooks/prepare-commit-msg.mjs";

describe("extractLinearId", () => {
  it("extrait l'ID depuis une branche conventionnelle", () => {
    expect(extractLinearId("chore/JB/MER-9-prepare-commit-msg")).toBe("MER-9");
    expect(extractLinearId("feat/JB/MER-123-audit-feed")).toBe("MER-123");
  });

  it("gère un autre préfixe d'équipe", () => {
    expect(extractLinearId("fix/JOS-42-bug")).toBe("JOS-42");
  });

  it("retourne null sans ID (main, branches techniques)", () => {
    expect(extractLinearId("main")).toBeNull();
    expect(extractLinearId("dependabot/npm_and_yarn/foo-1.2.3")).toBeNull();
    expect(extractLinearId("")).toBeNull();
    expect(extractLinearId(undefined)).toBeNull();
  });

  it("ne confond pas un slug versionné avec un ID Linear", () => {
    // pas de préfixe alpha majuscule → pas un ID Linear
    expect(extractLinearId("release/1.2.3")).toBeNull();
  });
});

describe("shouldSkipSource", () => {
  it("saute merge, squash et amend (commit)", () => {
    expect(shouldSkipSource("merge")).toBe(true);
    expect(shouldSkipSource("squash")).toBe(true);
    expect(shouldSkipSource("commit")).toBe(true);
  });

  it("traite message (-m) et template (éditeur)", () => {
    expect(shouldSkipSource("message")).toBe(false);
    expect(shouldSkipSource("template")).toBe(false);
    expect(shouldSkipSource(undefined)).toBe(false);
  });
});

describe("injectLinearId", () => {
  const branch = "chore/JB/MER-9-prepare-commit-msg";

  it("ajoute l'ID dans le corps, séparé du sujet par une ligne vide", () => {
    const out = injectLinearId("feat: ajoute le hook", branch);
    expect(out).toBe("feat: ajoute le hook\n\nMER-9");
  });

  it("est idempotent si l'ID est déjà dans le sujet", () => {
    const msg = "feat: ajoute le hook (MER-9)";
    expect(injectLinearId(msg, branch)).toBe(msg);
  });

  it("est idempotent si l'ID est déjà dans le corps", () => {
    const msg = "feat: ajoute le hook\n\nRefs MER-9";
    expect(injectLinearId(msg, branch)).toBe(msg);
  });

  it("préserve un corps existant et place l'ID en pied", () => {
    const msg = "feat: titre\n\nUn paragraphe d'explication.";
    expect(injectLinearId(msg, branch)).toBe(
      "feat: titre\n\nUn paragraphe d'explication.\n\nMER-9",
    );
  });

  it("insère l'ID avant le bloc de commentaires git", () => {
    const msg =
      "feat: titre\n\n# Please enter the commit message.\n# On branch ...";
    expect(injectLinearId(msg, branch)).toBe(
      "feat: titre\n\nMER-9\n\n# Please enter the commit message.\n# On branch ...",
    );
  });

  it("ne touche pas le message si la branche n'a pas d'ID", () => {
    const msg = "chore: bricole";
    expect(injectLinearId(msg, "main")).toBe(msg);
  });
});
