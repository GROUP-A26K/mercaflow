import "server-only";

import { createClient } from "@/lib/supabase/server";

// DATA ACCESS LAYER — notes (démo de la chaîne Clerk → Supabase / RLS).
// La RLS filtre par utilisateur via le JWT Clerk : pas besoin de filtrer le user_id
// ici, la DB ne renvoie/accepte que les lignes de l'utilisateur courant.
// NB : sans types Supabase générés, on type manuellement (cast). `supabase gen types`
// supprimera ces casts plus tard.

export type Note = {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
};

export async function getNotes(): Promise<Note[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notes")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Lecture des notes échouée : ${error.message}`);
  return (data ?? []) as Note[];
}

export async function createNote(content: string): Promise<Note> {
  const supabase = await createClient();
  // user_id rempli automatiquement par la DB (default auth.jwt()->>'sub').
  const { data, error } = await supabase
    .from("notes")
    .insert({ content })
    .select()
    .single();

  if (error) throw new Error(`Création de la note échouée : ${error.message}`);
  return data as Note;
}
