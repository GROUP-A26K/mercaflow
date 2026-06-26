/**
 * Sentry — initialisation côté navigateur (chargée par Next 16 au boot client).
 * No-op tant que `NEXT_PUBLIC_SENTRY_DSN` est absent : `enabled` reste faux.
 * Les Web Vitals et le tracing de navigation sont captés par l'intégration
 * browser-tracing par défaut quand le DSN est fourni.
 */
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  tracesSampleRate: 1,
  debug: false,
});

// Instrumente les transitions de route de l'App Router.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
