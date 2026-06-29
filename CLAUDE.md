# CLAUDE.md — Contrat d'exécution Mercaflow

Ce fichier définit **comment on travaille** sur Mercaflow (process, qualité, autonomie).
Les règles **produit & techniques** (stack, archi, SEO, perf, tests) sont dans
`AGENTS.md` et `MEMORY.md`, inclus ci-dessous — ils font foi pour le « quoi/comment coder ».

## 1. Gestion du travail (Linear)

- Le suivi se fait dans **Linear** (pas Jira). Toute tâche = une issue Linear.
- États : Todo → In Progress → In Review → Done (+ Blocked si escalade).
- On démarre une issue en la passant **In Progress** avant d'écrire du code.

## 2. Workflow Git (ticket → branche → PR)

- **Jamais de commit direct sur `main`.** Une branche par issue Linear.
- Nommage : `feat|fix|chore|refactor/JB/<LINEAR-ID>-slug` (ex. `feat/JB/MER-12-audit-feed`).
- **Conventional Commits**, avec l'ID Linear dans le corps (lien automatique Linear↔GitHub).
- PR en **draft** tant que le travail n'est pas prêt ; **merge squash uniquement**,
  branche supprimée après merge.
- `<LINEAR-ID>` : le préfixe d'équipe Linear (ex. `MER`) est fixé à la création de l'équipe.

## 3. La porte de qualité : `make check` = CI

- **`make check`** (= `npm run check` = `typecheck + lint + format:check + test`) doit
  être **vert avant tout push**. La CI GitHub exécute exactement le même script — local = CI.
- **Formatage** : Prettier est la source de vérité (`npm run format` pour corriger).
  `eslint-config-prettier` neutralise les règles de format d'ESLint (pas de double emploi).
- **Commits** : `commitlint` (hook `commit-msg`) valide les Conventional Commits ; `lint-staged`
  (hook `pre-commit`) lance `eslint --fix` + `prettier --write` sur les fichiers stagés.
- Une PR sans CI verte n'est pas mergeable : la **protection de branche GitHub** sur `main`
  est active (MER-8) — PR obligatoire, checks `check` + `audit` requis, branche à jour
  (`strict`), résolution des conversations (« Require conversation resolution » — les
  commentaires de revue cubic doivent être résolus avant merge) et historique linéaire.
  Pas de reviewer imposé (0) ni `enforce_admins` : CC/JB peuvent self-merger une PR à CI
  verte, mais les push directs sur `main` sont bloqués.
- **TDD attendu** sur la logique métier : test d'abord (RED), implémentation (GREEN),
  refacto. À chaque changement de comportement : créer/mettre à jour les tests
  (Vitest unit, Playwright e2e — cf. AGENTS.md).

## 4. Rôles d'exécution

- **CC** : exécuté de bout en bout par Claude Code (PR + CI verte → mergeable).
- **CC+H** : Claude s'arrête à « prêt pour validation » (PR + In Review), **pas de
  merge sans JB**.
- **H** : action humaine requise (compte, OAuth, paiement, décision produit/légale).

## 5. Secrets & sécurité

- **Aucun secret en clair** dans le repo. Valeurs réelles via **Infisical** ;
  `.env.example` documente les clés (placeholders uniquement), `.env*` jamais commité.
- Entrées externes validées à la frontière (zod). Erreurs jamais avalées silencieusement.

## 6. Autonomie & escalade

- Avancer seul sur tout ce qui est réversible et cadré par ce contrat.
- **S'arrêter et escalader** (issue Linear → Blocked + message à JB) pour : décision
  produit ambiguë, action humaine (§4 « H »), opération destructrice ou irréversible,
  dépense, ou tout ce qui sort du périmètre de l'issue.
- Rapport de fin d'issue : ce qui est fait, les écarts, la dette éventuelle.

## 7. Périmètre

Mercaflow est une **app Next.js mono-repo** (npm). Ne pas la convertir en monorepo
pnpm/turbo. L'architecture cible et les conventions sont décrites dans `MEMORY.md`.

---

@AGENTS.md
