import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  /* config options here */
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
