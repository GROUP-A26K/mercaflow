/**
 * Sentry — initialisation côté serveur (Node.js).
 * Importé par `instrumentation.ts` quand `NEXT_RUNTIME === "nodejs"`.
 * No-op tant que `NEXT_PUBLIC_SENTRY_DSN` est absent (dev / DSN non fourni) :
 * `enabled` reste faux, donc aucun événement n'est émis.
 */
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  // Échantillonnage des traces de performance — à ajuster selon le volume/coût.
  tracesSampleRate: 1,
  // Logs Sentry uniquement hors CI pour ne pas polluer les builds.
  debug: false,
});
