// Validation d'entrée pour les notes (pure, sans dépendance → testable et réutilisable
// côté serveur ET client). zod pourra remplacer ça quand on l'installera.

export const NOTE_MAX_LENGTH = 280;

export type ValidationResult =
  { ok: true; value: string } | { ok: false; error: string };

export function validateNoteContent(input: unknown): ValidationResult {
  if (typeof input !== "string") {
    return { ok: false, error: "Contenu invalide." };
  }
  const value = input.trim();
  if (!value) {
    return { ok: false, error: "La note ne peut pas être vide." };
  }
  if (value.length > NOTE_MAX_LENGTH) {
    return { ok: false, error: `Maximum ${NOTE_MAX_LENGTH} caractères.` };
  }
  return { ok: true, value };
}
