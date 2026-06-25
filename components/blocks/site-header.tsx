import Link from "next/link";
import { Show, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";

import { Button } from "@/components/ui/button";

// Bloc réutilisable : en-tête de site. Les contrôles d'auth Clerk (`Show`/`*Button`)
// sont des composants client autonomes qu'on peut rendre depuis ce Server Component.
export function SiteHeader() {
  return (
    <header className="glass sticky top-0 z-50 flex h-14 items-center justify-between border-b border-foreground/10 px-6">
      <Link
        href="/"
        className="flex items-center gap-2 font-heading text-lg font-semibold tracking-tight"
      >
        <span className="size-5 rounded-md bg-linear-to-br from-primary to-chart-2 shadow-sm shadow-primary/40" />
        Mercaflow
      </Link>
      <nav className="flex items-center gap-2">
        <Show when="signed-out">
          <SignInButton mode="modal">
            <Button variant="ghost" size="sm">
              Se connecter
            </Button>
          </SignInButton>
          <SignUpButton mode="modal">
            <Button size="sm">S&apos;inscrire</Button>
          </SignUpButton>
        </Show>
        <Show when="signed-in">
          <Button asChild variant="ghost" size="sm">
            <Link href="/dashboard">Tableau de bord</Link>
          </Button>
          <UserButton />
        </Show>
      </nav>
    </header>
  );
}
