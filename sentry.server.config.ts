/**
 * Sentry — initialisation côté serveur (Node.js).
 * Importé par `instrumentation.ts` quand `NEXT_RUNTIME === "nodejs"`.
 * No-op tant qu'aucun DSN n'est fourni : `enabled` reste faux, donc aucun
 * événement n'est émis. Le DSN serveur peut être fourni séparément
 * (`SENTRY_DSN`) ; à défaut on réutilise le DSN public (non secret).
 */
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  // Attache IP / user / requête aux événements (décision produit MER-18).
  sendDefaultPii: true,
  // 100 % des traces en dev, 10 % en prod (volume/coût).
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1 : 0.1,
  // Capture les variables locales dans les stack traces (debug serveur).
  includeLocalVariables: true,
  // Logs structurés Sentry.
  enableLogs: true,
  debug: false,
});
