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
  // Silencieux en local, verbeux uniquement en CI.
  silent: !process.env.CI,
});
