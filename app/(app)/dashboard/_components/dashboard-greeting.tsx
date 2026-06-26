// Composant PRIVÉ à la route /dashboard (dossier _components hors routing).
// Server Component : pur affichage, aucune interactivité → pas de 'use client'.
export function DashboardGreeting({ email }: { email: string | null }) {
  return (
    <div className="space-y-1">
      <h1 className="font-heading text-2xl font-semibold tracking-tight">
        Tableau de bord
      </h1>
      <p className="text-sm text-muted-foreground">
        {email ? `Connecté en tant que ${email}` : "Bienvenue"}
      </p>
    </div>
  );
}
