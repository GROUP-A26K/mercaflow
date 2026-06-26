"use client"; // Les error boundaries doivent être des Client Components.

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

// global-error remplace le root layout quand celui-ci (ou un template racine)
// plante : il doit donc fournir ses propres <html>/<body>. C'est le dernier
// filet — les erreurs ici échappent à app/error.tsx, d'où la capture Sentry.
// ⚠️ Next 16 : la prop de relance s'appelle `unstable_retry` (anciennement `reset`).
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="fr">
      <body className="flex min-h-svh flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          Une erreur critique est survenue
        </h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          Réessayez ; si le problème persiste, contactez le support.
        </p>
        <button
          type="button"
          onClick={() => unstable_retry()}
          className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
        >
          Réessayer
        </button>
      </body>
    </html>
  );
}
