/**
 * Next.js instrumentation — enregistre Sentry côté serveur.
 * Next 16 ne fournit que le runtime Node.js (l'edge runtime est supprimé,
 * cf. MEMORY.md), donc on n'enregistre que la config serveur.
 */
import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
}

// Capture les erreurs des Server Components, du proxy (middleware) et des handlers.
export const onRequestError = Sentry.captureRequestError;
