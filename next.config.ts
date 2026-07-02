import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // Autorise les ressources de dev (HMR, chunks `/_next/*`) servies via le tunnel de
  // dev Shopify `shopify-dev.mercaflow.ai` (MER-36, cf. docs/shopify-dev-tunnel.md).
  // Uniquement pris en compte par `next dev` — aucun effet sur le build de prod.
  allowedDevOrigins: ["shopify-dev.mercaflow.ai"],
};

// Sentry — câblage build-time. L'upload des source maps n'a lieu que si
// SENTRY_AUTH_TOKEN / org / project sont fournis (CI/prod) ; sinon no-op.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  // Élargit l'upload des source maps aux fichiers serveur (stack traces lisibles).
  widenClientFileUpload: true,
  // Proxifie les events Sentry via /monitoring pour contourner les bloqueurs de pub.
  tunnelRoute: "/monitoring",
  // Silencieux en local, verbeux uniquement en CI.
  silent: !process.env.CI,
});
