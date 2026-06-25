<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Performance (toujours)

Chaque changement doit viser le chargement le plus rapide possible.
- **Server-first** : garder les composants en Server Component ; pousser `'use client'` le plus bas possible dans l'arbre pour minimiser le JS envoyé.
- **Images** : toujours `next/image` (jamais `<img>` pour du contenu), avec `width`/`height` ou `fill` + `sizes`, et `priority` UNIQUEMENT sur l'image LCP. Préférer AVIF/WebP.
- **Images distantes** (avatars, storage Supabase, etc.) : ajouter le domaine à `images.remotePatterns` dans `next.config.ts`, sinon `next/image` les rejette à l'exécution.
- **⚠️ Médias trop lourds** : si un média dépasse ~200 Ko (image) ou ~1 Mo (vidéo/asset), ou si une dépendance alourdit nettement le bundle, **le signaler explicitement à l'utilisateur** avec une alternative (compression, format, lazy-load, CDN) — ne pas l'intégrer silencieusement.
- **Découpage** : `next/dynamic` pour le code non critique ; `<Suspense>` + `loading.tsx` pour streamer.
- **Boundaries par route** : prévoir `loading.tsx` (streaming pendant le fetch) et `error.tsx` (⚠️ Client Component, prop `unstable_retry` en Next 16 — pas `reset`). 404 via `not-found.tsx`.
- **Polices** : via `next/font` (déjà en place) — pas de `<link>` Google Fonts manuel.
- Ne jamais sacrifier le SEO pour la perf, ni l'inverse : les deux sont des contraintes simultanées.

# SEO (toujours)

Le référencement est une exigence permanente, pas une option.
- **Chaque page** exporte ses métadonnées via `buildMetadata({ title, description, path, … })` de `lib/seo/metadata.ts` (title, meta description, canonical, Open Graph, Twitter). Les pages privées/auth passent `noIndex: true`.
- **Données structurées schema.org** sur chaque page pertinente via les constructeurs de `lib/seo/json-ld.ts` (`webPageJsonLd`, `breadcrumbJsonLd`, …) rendus avec `<JsonLd>`. `Organization` + `WebSite` sont globaux (root layout).
- **Favicon, OG/Twitter images, sitemap, robots, manifest** : maintenus dans `app/` (`opengraph-image.tsx`, `twitter-image.tsx`, `sitemap.ts`, `robots.ts`, `manifest.ts`). Ajouter toute nouvelle route publique au `sitemap.ts`.
- Source de vérité SEO unique : `lib/seo/config.ts` (nom, URL, description, réseaux). Modifier là pour propager partout.
- Toujours une `<h1>` unique et descriptive par page, `lang` correct sur `<html>`, texte alternatif sur les images.

# Tests & qualité (toujours)

- **Tests unitaires/composants** : Vitest + Testing Library dans `tests/unit/`. **Tests fonctionnels/e2e** : Playwright dans `tests/e2e/`.
- **À CHAQUE modification de comportement**, créer ou mettre à jour les tests correspondants — ne pas laisser de logique non couverte ni de test obsolète.
- Avant de considérer une tâche terminée, lancer `npm run check` (typecheck + lint + tests unitaires). Le code doit passer `tsc --noEmit`, ESLint et Vitest sans erreur.
- Respecter les règles ESLint (config `eslint-config-next`, incl. `react-hooks`) ; corriger la cause, ne pas désactiver une règle sans raison documentée.

@MEMORY.md
