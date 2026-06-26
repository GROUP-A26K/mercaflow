import { getNotes } from "@/lib/data/notes";
import { buildMetadata } from "@/lib/seo/metadata";

import { NoteForm } from "./_components/note-form";

// Page de DÉMO (privée) : valide la chaîne Clerk → Supabase (RLS).
export const metadata = buildMetadata({
  title: "Notes (démo)",
  path: "/notes",
  noIndex: true,
});

export default async function NotesPage() {
  const notes = await getNotes();

  return (
    <main className="mx-auto w-full max-w-2xl space-y-6 px-6 py-10">
      <div className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Notes
        </h1>
        <p className="text-sm text-muted-foreground">
          Démo de la chaîne Clerk → Supabase (RLS) : vous ne voyez que vos
          propres notes.
        </p>
      </div>

      <NoteForm />

      <ul className="space-y-2">
        {notes.length === 0 ? (
          <li className="text-sm text-muted-foreground">
            Aucune note pour l&apos;instant.
          </li>
        ) : (
          notes.map((note) => (
            <li key={note.id} className="rounded-md border px-3 py-2 text-sm">
              {note.content}
            </li>
          ))
        )}
      </ul>
    </main>
  );
}
