/**
 * Sentry — initialisation côté navigateur (chargée par Next 16 au boot client).
 * No-op tant que `NEXT_PUBLIC_SENTRY_DSN` est absent : `enabled` reste faux.
 * Les Web Vitals et le tracing de navigation sont captés par l'intégration
 * browser-tracing par défaut quand le DSN est fourni.
 * Session Replay volontairement NON activé (priorité bundle/perf — cf. MER-18).
 */
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  // Attache IP / user / requête aux événements (décision produit MER-18 ;
  // à couvrir côté politique de confidentialité / DPA Sentry).
  sendDefaultPii: true,
  // 100 % des traces en dev, 10 % en prod (volume/coût).
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1 : 0.1,
  // Logs structurés Sentry.
  enableLogs: true,
  debug: false,
});

// Instrumente les transitions de route de l'App Router.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
