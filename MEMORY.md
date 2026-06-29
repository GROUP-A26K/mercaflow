# Mémoire projet — Mercaflow

Contexte durable du projet, lu à chaque session. À éditer librement.

## Objectif
**Mercaflow = couche d'intelligence + activation produit pour le commerce agentique.** On dit aux marques
quels SKU sont recommandés (ou invisibles) dans ChatGPT, Perplexity, Gemini, *pourquoi*, et on **génère les
corrections** qui les rendent recommandables — au **niveau produit (SKU), pas marque**. Différence clé vs les
concurrents (Profound, Peec, Semrush AIO) : on **mesure ET on corrige** (Fix Engine), orienté merchandising/
e-commerce, multi-catalogue (Shopify + Merchant Center + PIM + avis + marketplaces). Stade : pre-seed (juin 2026).
Fondateur : Jean-Baptiste Pavageau (jb@mercaflow.ai).

**Boucle produit** : Audit → Score → Fix → Re-test → Learn (dataset longitudinal).
**Vrai moat = la donnée propriétaire** (Product Intelligence Graph + dataset des corrections), PAS l'UI/dashboard.
**5 modules** : Agentic Product Audit · Product Understanding Score (7 scores/SKU) · Feed & PDP Fix Engine ·
Agent-Readable Feed (`/.well-known/agent-commerce-feed.json`) · Workflow Actions + MCP (push Shopify/Akeneo/Jira).
**GTM** : wedge = audit payant livré en 72h (1,5–12 k€) qui convertit en SaaS (750–10 k€/mois), distribué via agences.
**Vision** : « le Stripe des décisions d'achat agentiques ». Ambition : que l'*Agentic Commerce Readiness Score™*
devienne le « Domain Authority » du commerce agentique.

> Implications produit à garder en tête : tout se raisonne au **niveau SKU** ; la donnée accumulée (graph + boucle
> de correction) prime sur l'interface ; cibles = marques Shopify Plus 500–20k SKU. MCP est une cible (V4) → ce repo
> pourra exposer des outils type `find_best_product()` / `recommendation_score()`.

## Stack (vérifié 2026-06-25)
- **Next.js 16.2.9** (App Router) + **React 19.2.4** — version récente, NE PAS coder de mémoire,
  lire `node_modules/next/dist/docs/` (cf. règle AGENTS.md).
- **Tailwind v4** (via `@tailwindcss/postcss`)
- **shadcn/ui** + Radix UI + `class-variance-authority` + `tailwind-merge` (helper `cn` dans `lib/utils.ts`)
- **Clerk** (`@clerk/nextjs` + `@clerk/ui`) — AUTHENTIFICATION. Setup via `clerk init` (app `app_3FcUOejrj8vsGwnDOOwCb9PPpZ5`).
  Garde dans `proxy.ts` (`clerkMiddleware`), routes `/sign-in` & `/sign-up`, contrôles dans `components/blocks/site-header.tsx`
  (composant `<Show when="signed-in|signed-out">`, pas `SignedIn`/`SignedOut`). Thème shadcn appliqué via `appearance={{theme: shadcn}}`.
- **Supabase** (`@supabase/supabase-js`) — DB UNIQUEMENT (pas d'auth). Identité via **JWT Clerk passé en `accessToken`** (Third-Party Auth), PAS via cookies. `server.ts` (serveur, token via `auth().getToken()`) ; `client.ts` expose `useSupabaseClient()` (token via session Clerk).
  Clé au nouveau format `sb_publishable_…` : OK pour requêtes de tables, mais PAS pour l'endpoint racine `/rest/v1/` (exige clé secrète).
- **Resend** (`resend`) — email transactionnel, CÂBLÉ dans `lib/mail/` : `client.ts` (getResend lazy, server-only), `send.ts` (`sendEmail`), `templates.ts` (gabarits HTML purs). Déclencheurs : webhook Clerk `app/api/webhooks/clerk/route.ts` (email de bienvenue sur `user.created`) + page `/settings` (bouton email de test). Envoi serveur uniquement.
- **Sentry** (`@sentry/nextjs`) — observabilité (erreurs serveur+client + Web Vitals). CÂBLÉ : `instrumentation.ts` (register Node), `sentry.server.config.ts`, `instrumentation-client.ts`, `withSentryConfig` dans `next.config.ts`. **No-op tant que `NEXT_PUBLIC_SENTRY_DSN` est absent** (`enabled: Boolean(dsn)`) → activation = ajout du DSN. Pas d'edge config (Next 16 = Node only).
- Icônes : `@tabler/icons-react`
- Polices : Geist Sans, Geist Mono, Manrope (heading) via `next/font/google`

## Variables d'environnement
Modèle complet dans `.env.example` (à copier en `.env.local`, jamais commité).
- **SEO** : `NEXT_PUBLIC_SITE_URL` ⚠️ REQUIS — actuellement ABSENTE de `.env.local`, donc le SEO retombe sur `localhost:3000` (canonical/OG/sitemap cassés en prod).
- **Clerk** : `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_SIGN_IN_URL`/`SIGN_UP_URL` (`/sign-in`, `/sign-up`) + `*_FALLBACK_REDIRECT_URL` (`/dashboard`).
- **Supabase** : `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- **Resend** : `RESEND_API_KEY` (présent), `RESEND_FROM_EMAIL` (domaine vérifié ; sinon fallback `onboarding@resend.dev` qui n'envoie qu'à l'email du compte Resend).
- **Webhook Clerk** : `CLERK_WEBHOOK_SIGNING_SECRET` (Clerk Dashboard → Webhooks) — requis pour l'email de bienvenue.
- **Sentry** : `NEXT_PUBLIC_SENTRY_DSN` (active l'envoi d'événements ; absent = no-op) + pour l'upload des source maps en CI/prod : `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`. À créer côté Sentry (action JB) + ajouter à `.env.example`/Infisical.

## Règles Next 16 (à respecter absolument)
- **Server-first** : tout est Server Component par défaut. `'use client'` UNIQUEMENT si state /
  hooks / event handlers / browser APIs — et poussé le PLUS BAS possible dans l'arbre.
- **Async breaking changes** : `cookies()`, `headers()`, `params`, `searchParams` sont des
  `Promise` → toujours `await` (voir `lib/supabase/server.ts`).
- **Routing file-system** : un dossier = une route seulement avec `page.tsx` ou `route.ts`.
  Fichiers spéciaux : `layout`, `page`, `loading`, `error`, `route`, `not-found`, `template`.
- **Middleware renommé `proxy.ts`** : présent, géré par Clerk (`clerkMiddleware`). Matcher inclut `'/__clerk/:path*'`.
- **Edge runtime supprimé** → Node.js uniquement.
- **Cache Components / PPR** (`'use cache'`, `cacheLife()`) : NON activé (`next.config.ts` vide).
  Décision à prendre si on veut `cacheComponents: true`.

## Architecture cible (feature-oriented, réutilisable)
Pas de DDD strict : Next structure le ROUTING, pas le domaine. On colocalise par route, le
partagé remonte dans `lib/` et `components/blocks/`.

```
app/                     # routing + UI (Server Components par défaut)
  (marketing)/           # groupe : pages publiques
  (auth)/                # groupe : Clerk sign-in / sign-up (catch-all)
  (app)/                 # groupe : zone authentifiée (garde d'auth dans son layout)
    <route>/
      page.tsx           #   Server Component : orchestre + fetch via lib/data
      loading.tsx        #   UI de chargement (Suspense)        ┐ boundaries
      error.tsx          #   error boundary ('use client', unstable_retry)  ┘ par route
      _components/       #   composants PRIVÉS à la route (préfixe _ = hors routing)
      _actions.ts        #   Server Actions ('use server')
  api/                   # Route Handlers (route.ts) si API nécessaire
components/
  ui/                    # primitives shadcn (atomes) — générées CLI, peu éditées à la main
  blocks/                # sections composées réutilisables (header, data-table…) — server
  providers/             # client providers ('use client') : theme, etc.
hooks/                   # hooks réutilisables ('use client') — alias @/hooks déjà configuré
lib/
  supabase/              # client.ts / server.ts
  data/                  # DATA ACCESS LAYER — 'server-only', TOUTES les requêtes Supabase
  validations/           # schémas (zod conseillé)
  utils.ts               # cn + helpers
  types.ts               # types partagés
```

## Conventions de composants
- **Hiérarchie** : `ui/` (primitives) → `blocks/` (sections réutilisables) → `_components/`
  (spécifiques à une route). Promotion : un `_components` réutilisé ailleurs MONTE dans `blocks/`.
- **Pattern shadcn** (reproduire partout) : attribut `data-slot`, `cva` pour les variants,
  helper `cn()`, `asChild` via `Slot` de radix-ui. Voir `components/ui/button.tsx`.
- **Génération** : ajouter une primitive via la CLI shadcn (config: style `radix-vega`,
  baseColor `mauve`, icônes Tabler, cssVariables) — ne pas réécrire les `ui/` à la main.
- **Naming** : fichiers kebab-case (`user-card.tsx`), composants PascalCase.
- **Props** : typer avec `React.ComponentProps<'x'> & VariantProps<typeof xVariants>`.

## Data Access Layer (sécurité + réutilisabilité)
- Toute lecture/écriture DB passe par `lib/data/*.ts` marqués `import 'server-only'`.
- Jamais d'accès Supabase dans un composant client. Lectures via Server Components,
  mutations via Server Actions (`'use server'`).
- `lib/data/auth.ts` = pont vers Clerk (`auth()`, `currentUser()`), PAS Supabase. `getCurrentUser()`
  renvoie `{id, email}|null` ; `requireUser()` redirige vers `/sign-in`. Déconnexion via `<SignOutButton>` Clerk.
- `lib/supabase/server.ts` (serveur, token Clerk via `accessToken`) ; `client.ts` → `useSupabaseClient()` ('use client', token via session Clerk).

## SEO (exigence permanente — détails dans AGENTS.md)
- Source de vérité : `lib/seo/config.ts` (nom, URL via `NEXT_PUBLIC_SITE_URL`, description, réseaux). Description renseignée ; liens sociaux à compléter quand dispo.
- `lib/seo/metadata.ts` : `rootMetadata` (défauts globaux, metadataBase, OG/Twitter, robots) + `buildMetadata({title, description, path, image, noIndex})` à exporter depuis CHAQUE `page.tsx`.
- `lib/seo/json-ld.ts` + `components/seo/json-ld.tsx` : données structurées schema.org. `Organization`+`WebSite` globaux (root layout) ; `webPageJsonLd`/`breadcrumbJsonLd` par page.
- Fichiers `app/` : `opengraph-image.tsx` & `twitter-image.tsx` (générés via `next/og`, rendu partagé `lib/seo/og-image.tsx`), `sitemap.ts`, `robots.ts`, `manifest.ts`. **Ajouter chaque nouvelle route publique au `sitemap.ts`.**
- Pages privées/auth (`/dashboard`, `/sign-in`, `/sign-up`) → `noIndex: true` + bloquées dans `robots.ts`. `<html lang="fr">`.

## Performance (exigence permanente — détails dans AGENTS.md)
- Server-first, `'use client'` au plus bas. `next/image` obligatoire (pas de `<img>` de contenu), `priority` sur le seul LCP.
- ⚠️ Signaler tout média trop lourd (~>200 Ko image / ~>1 Mo vidéo) au lieu de l'intégrer silencieusement.
- `next/dynamic` + `<Suspense>`/`loading.tsx` pour le non-critique.

## Tests & qualité (exigence permanente)
- Unitaires/composants : **Vitest + Testing Library** → `tests/unit/` (config `vitest.config.mts`, setup `vitest.setup.ts` avec cleanup + jest-dom).
- Fonctionnels/e2e : **Playwright** → `tests/e2e/` (config `playwright.config.ts`, démarre `next dev` via webServer). Browsers à installer une fois : `npx playwright install`.
- ⚠️ Vitest utilise `@vitejs/plugin-react-swc` (PAS `@vitejs/plugin-react`, qui entre en conflit Babel 7/8 avec `shadcn`).
- Scripts : `npm run test` (unit), `test:e2e`, `typecheck`, `lint`, et `npm run check` (typecheck+lint+test) à lancer avant de clore une tâche.
- **À chaque changement de comportement : créer/mettre à jour les tests.**

## Structure actuelle (réel)
- `app/` : root `layout.tsx` (ClerkProvider + thème shadcn + métadonnées SEO + JSON-LD), groupes `(marketing)` (accueil), `(auth)` (`sign-in`/`sign-up` catch-all Clerk), `(app)` (`layout` garde d'auth + `dashboard`). Fichiers SEO (sitemap/robots/manifest/og/twitter).
- `components/` : `ui/button.tsx`, `blocks/site-header.tsx`, `providers/index.tsx`, `seo/json-ld.tsx`.
- `hooks/use-mounted.ts` (via `useSyncExternalStore`). `lib/` : `utils`, `types`, `supabase/`, `data/auth.ts`, `seo/`, `mail/` (Resend), `validations/` (README, zod à installer au 1er schéma).
- Boundaries : `app/{loading,error,not-found}.tsx` + `app/(app)/{loading,error}.tsx`.
- Démo Clerk→Supabase : `app/(app)/notes/` (page + form + action), `lib/data/notes.ts`, `lib/validations/notes.ts`, migration `supabase/migrations/0001_notes_demo.sql`. Sert à valider la RLS ; supprimable une fois la vraie data en place.
- `proxy.ts` (Clerk middleware). Tests dans `tests/unit` + `tests/e2e`. `.env.example` documente les variables requises.

## État d'avancement / TODO
- Scaffold de base remplacé : auth Clerk + DAL + SEO complet + tooling tests/lint en place. Typecheck/lint/tests au vert.
- À faire : remplir `## Objectif` + la vraie description SEO (`lib/seo/config.ts`), implémenter le vrai formulaire/landing, ajouter `lib/data/*` métier au fur et à mesure, `npx playwright install` avant le 1er run e2e.

## Pièges connus
- Oublier `await` sur `cookies()`/`params`/`searchParams` → erreur Next 16.
- Sans `proxy.ts` (clerkMiddleware), `auth()`/`currentUser()` lèvent une erreur.
- **RLS Supabase sous Clerk** : exige d'activer "Third-Party Auth" Clerk dans les dashboards Clerk ET Supabase, sinon les requêtes serveur tombent en rôle `anon`. Policies sur `auth.jwt()->>'sub'` (= user id Clerk).
- **Pages auth-gated = dynamiques** : une page qui lit le token Clerk (via Supabase `accessToken`/`headers()`) ne peut PAS être prérendue statiquement → le build plante. Fix : `export const dynamic = "force-dynamic"` (posé sur `app/(app)/layout.tsx`, hérité par tout le segment).
- `NEXT_PUBLIC_SITE_URL` absente → canonical/OG/sitemap pointent vers localhost en prod.
- `next/image` refuse les domaines distants sans `images.remotePatterns` dans `next.config.ts`.
- `error.tsx`/`global-error.tsx` : Next 16 nomme la prop de relance `unstable_retry` (PAS `reset`).
- Vitest : utiliser le plugin **SWC** (conflit Babel avec shadcn sinon). Testing Library : cleanup requis entre tests.
- ESLint Next 16 strict (`react-hooks`) : pas de `setState` synchrone dans un effet.
- **ESLint reste en v9** (MER-30) : ESLint 10 supprime l'API `context.getFilename()`, encore utilisée par `eslint-plugin-react@7.37.5` (embarqué par `eslint-config-next@16.2.9`) → `npm run lint` plante (`TypeError: contextOrFilename.getFilename is not a function`). Aucune version d'`eslint-plugin-react` ne supporte encore v10 : blocage upstream. Le bump majeur d'`eslint` est ignoré dans `.github/dependabot.yml` ; à rouvrir quand `eslint-config-next` déclarera le support `eslint ^10`.
- Toujours vérifier la doc embarquée avant d'utiliser une API Next (breaking changes).