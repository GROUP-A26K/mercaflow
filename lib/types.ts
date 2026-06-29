// Types partagés à travers l'application. À étoffer au fil de l'eau.
// Pour les types Supabase générés, lancer la CLI Supabase et les placer ici
// (ex. `supabase gen types typescript`), puis exporter une `Database`.

/** Forme générique d'une réponse d'action serveur (succès / erreur). */
export type ActionResult<T = void> =
  { ok: true; data: T } | { ok: false; error: string };
