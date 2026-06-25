"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { NOTE_MAX_LENGTH } from "@/lib/validations/notes";

import { createNoteAction, type NoteFormState } from "../_actions";

const initialState: NoteFormState = { error: null };

export function NoteForm() {
  const [state, formAction, pending] = useActionState(
    createNoteAction,
    initialState,
  );

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          name="content"
          maxLength={NOTE_MAX_LENGTH}
          placeholder="Nouvelle note…"
          aria-label="Contenu de la note"
          className="border-input flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        <Button type="submit" disabled={pending}>
          {pending ? "Ajout…" : "Ajouter"}
        </Button>
      </div>
      {state.error ? (
        <p className="text-destructive text-sm">{state.error}</p>
      ) : null}
    </form>
  );
}
