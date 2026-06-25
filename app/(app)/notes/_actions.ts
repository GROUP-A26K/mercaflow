"use server";

import { revalidatePath } from "next/cache";

import { createNote } from "@/lib/data/notes";
import { validateNoteContent } from "@/lib/validations/notes";

export type NoteFormState = { error: string | null };

// Server Action pour le formulaire (pattern useActionState : (prevState, formData)).
export async function createNoteAction(
  _prevState: NoteFormState,
  formData: FormData,
): Promise<NoteFormState> {
  const result = validateNoteContent(formData.get("content"));
  if (!result.ok) return { error: result.error };

  await createNote(result.value);
  revalidatePath("/notes");
  return { error: null };
}
