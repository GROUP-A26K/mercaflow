import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/pricing(.*)",
  "/contact(.*)",
  "/sign-in(.*)",
  "/sign-up(.*)",
  // Routes Shopify machine-à-machine : authentifiées par HMAC Shopify, pas par Clerk
  // (le callback est une redirection sans session ; les webhooks n'en ont jamais).
  // L'install reste protégé — il a besoin de l'org active via `auth()`.
  "/api/shopify/callback",
  "/api/shopify/webhooks(.*)",
  // Worker cron de l'audit durable (MER-58) : déclenché par Vercel Cron, authentifié par
  // `CRON_SECRET` (pas de session Clerk).
  "/api/shopify/jobs(.*)",
]);

export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/:path*",
  ],
};
