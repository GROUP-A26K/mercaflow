import { describe, expect, it } from "vitest";

import { NOTE_MAX_LENGTH, validateNoteContent } from "@/lib/validations/notes";

describe("validateNoteContent", () => {
  it("accepte un contenu valide et le nettoie (trim)", () => {
    expect(validateNoteContent("  hello  ")).toEqual({
      ok: true,
      value: "hello",
    });
  });

  it("rejette une note vide", () => {
    expect(validateNoteContent("   ")).toMatchObject({ ok: false });
  });

  it("rejette un contenu non-string", () => {
    expect(validateNoteContent(null)).toMatchObject({ ok: false });
  });

  it("rejette au-delà de la longueur max", () => {
    expect(validateNoteContent("a".repeat(NOTE_MAX_LENGTH + 1))).toMatchObject({
      ok: false,
    });
  });
});
