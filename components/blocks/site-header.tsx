import Link from "next/link";
import { Show, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";

import { Button } from "@/components/ui/button";

// Bloc réutilisable : en-tête de site. Les contrôles d'auth Clerk (`Show`/`*Button`)
// sont des composants client autonomes qu'on peut rendre depuis ce Server Component.
export function SiteHeader() {
  return (
    <header className="flex h-14 items-center justify-between border-b px-6">
      <Link
        href="/"
        className="font-heading text-lg font-semibold tracking-tight"
      >
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
