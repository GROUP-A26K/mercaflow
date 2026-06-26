"use client"; // Les error boundaries doivent être des Client Components.

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";

// Boundary d'erreur scopée à la zone authentifiée (app). Prop Next 16 : `unstable_retry`.
export default function AppError({
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
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-20 text-center">
      <h2 className="font-heading text-xl font-semibold tracking-tight">
        Impossible d&apos;afficher cette page
      </h2>
      <Button variant="outline" onClick={() => unstable_retry()}>
        Réessayer
      </Button>
    </div>
  );
}
