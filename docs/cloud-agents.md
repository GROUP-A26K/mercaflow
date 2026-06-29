# Cursor Cloud Agents — flotte d'agents en parallèle

Lancer plusieurs agents de code **en parallèle dans le cloud** (1 VM par agent → branche/PR),
piloté depuis nos sessions par script. Pattern « chef d'orchestre » : Claude Code orchestre
et fait l'interactif ; les Cloud Agents abattent les tâches async. Avantage : **rien ne tourne
en local** → plus de tangling de worktrees, ça scale jusqu'aux rate limits.

## 1. Le secret `CURSOR_API_KEY`

### Où le mettre

| Emplacement | Quoi | Qui |
| -- | -- | -- |
| **Infisical** (env `dev`) | la **vraie** valeur de la clé | JB (jamais partagée en session) |
| `.env.example` | un **placeholder** `CURSOR_API_KEY=` (doc des clés) | JB (`.env*` read-denied côté CC) |
| `process.env` à l'exécution | injecté par `infisical run` | automatique |

> Source de vérité = Infisical. `.env.example` ne contient qu'un placeholder. La clé n'entre
> **jamais** en clair dans le repo ni dans une session Claude.

### Générer la clé (dashboard Cursor)

Dashboard Cursor → **API Keys** → *Create API key* → copie la clé (format `key_…`).

### La pousser dans Infisical

**Option A — CLI Infisical (recommandé, la valeur reste sur ta machine) :**

```bash
infisical secrets set CURSOR_API_KEY="<colle-la-clé-ici>" \
  --projectId=d2b1250e-2062-4830-9529-4da32e822aa5 \
  --env=dev \
  --domain=https://eu.infisical.com
```

(Répète avec `--env=staging` / `--env=prod` le jour où la CI/prod en aura besoin.)

**Option B — Dashboard Infisical :** projet Mercaflow → environnement **Development** →
*Add Secret* → clé `CURSOR_API_KEY`, valeur = ta clé.

**Option C — script repo existant :** ajoute `CURSOR_API_KEY=<clé>` à ton `.env.local` (local,
jamais commité) puis `scripts/infisical-push.sh dev .env.local` (⚠ pousse toutes les clés du
fichier, pas seulement celle-ci).

### Ajouter le placeholder à `.env.example` (action JB)

Ajoute cette ligne dans la section appropriée de `.env.example` :

```bash
# Cursor Cloud Agents (runner scripts/cloud-agents.mjs) — clé API du dashboard Cursor
CURSOR_API_KEY=
```

## 2. Vérifier que la clé marche

```bash
infisical run --env=dev -- node scripts/cloud-agents.mjs --check
```

- `✓ Clé valide` → tu peux lancer une flotte.
- `403` → l'API Cloud Agents exige probablement un **siège Team** (le plan Pro ne l'expose
  peut-être pas). Repli : lance les agents depuis le **web/Slack** et CC bosse sur leurs PRs.

## 3. Lancer une flotte

```bash
# liste les agents récents + statut
infisical run --env=dev -- node scripts/cloud-agents.mjs --list

# voir ce qui serait lancé (sans rien créer)
infisical run --env=dev -- node scripts/cloud-agents.mjs --dry-run "MER-42: audit du feed"

# lancer 2 agents EN PARALLÈLE (chacun ouvre une PR)
infisical run --env=dev -- node scripts/cloud-agents.mjs \
  "MER-42: audit du feed produit" "MER-43: corriger la PDP variantes"

# lancer puis attendre la fin + afficher les PRs
infisical run --env=dev -- node scripts/cloud-agents.mjs --wait "MER-42: audit du feed"
```

Ou via Make : `make cloud a='--check'` / `make cloud a='"MER-42: audit du feed"'`.

Options : `--repo <url>` `--ref <branche>` `--model <id>` (défauts : `GROUP-A26K/mercaflow`,
`main`, `claude-4.6-sonnet-thinking` — surchargables via `CURSOR_REPO` / `CURSOR_MODEL`).

## 4. Environnement des agents — `.cursor/environment.json`

Committé à la racine : les Cloud Agents l'utilisent pour préparer la VM (ici `npm ci`) afin de
pouvoir builder/tester (`make check`). On pourra y ajouter un `Dockerfile`/`build`/snapshot plus
tard (cf. doc Cursor « Cloud Agent setup »).

## 5. Division du travail (workflow cible)

- **Claude Code (VSCode)** = chef d'orchestre + travail interactif rapproché.
- **Cursor Cloud Agents** = tâches indépendantes lancées en parallèle → PRs.
- On review/itère leurs PRs en local (`gh pr checkout <n>`), CI = même `make check`.
- Convention de branches : les Cloud Agents préfixent `cursor/…` (réglé dans les Defaults du
  dashboard) — mettre l'**ID Linear `MER-XX` dans le prompt** pour garder le lien Linear↔PR.
