import Link from "next/link";

import { Button } from "@/components/ui/button";

// 404 global. Server Component. Next renvoie automatiquement le status HTTP 404 (bon pour le SEO).
export default function NotFound() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-sm font-medium text-muted-foreground">404</p>
      <h1 className="font-heading text-2xl font-semibold tracking-tight">
        Page introuvable
      </h1>
      <Button asChild>
        <Link href="/">Retour à l&apos;accueil</Link>
      </Button>
    </main>
  );
}
