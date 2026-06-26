"use client"; // Les error boundaries doivent être des Client Components.

import { useEffect } from "react";

import { Button } from "@/components/ui/button";

// ⚠️ Next 16 : la prop de relance s'appelle `unstable_retry` (anciennement `reset`).
export default function ErrorPage({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    // Brancher ici un service de reporting (Sentry, etc.).
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="font-heading text-2xl font-semibold tracking-tight">
        Une erreur est survenue
      </h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Réessayez ; si le problème persiste, contactez le support.
      </p>
      <Button onClick={() => unstable_retry()}>Réessayer</Button>
    </main>
  );
}
