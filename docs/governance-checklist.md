# Mercaflow — Checklist de gouvernance / plateforme

Porté depuis la mise en place CAB, adapté au mono-app npm de Mercaflow.
Légende rôle : **CC** = Claude Code · **H** = action humaine (JB) · **CC-MCP** = Claude via MCP une fois connecté.

## ✅ Fait (dans la PR `chore/JB/governance-bootstrap`)

- [x] Contrat de gouvernance `CLAUDE.md` (Linear, workflow, escalade, rôles) — garde `@AGENTS.md`
- [x] CI GitHub Actions : `npm run check` (typecheck + lint + tests) sur PR + main
- [x] `.mcp.json` : github, linear, supabase, context7, infisical (zéro secret en clair)
- [x] `.claude/settings.json` : permissions scopées
- [x] Husky + lint-staged (`eslint --fix` au commit)
- [x] `.env.example` (placeholders) + `.nvmrc` (Node 24.14.0)
- [x] Repo GitHub : merge **squash only** + suppression auto des branches

## ⏳ À faire — plateforme

### Linear (remplace Jira) — **H puis CC**
- [ ] **H** : créer le workspace/équipe Linear Mercaflow, fixer le **préfixe d'équipe** (ex. `MER`)
- [ ] **H** : authentifier le MCP Linear (endpoint `https://mcp.linear.app/mcp` ; fallback `/sse`)
- [ ] **H** : connecter l'intégration Linear ↔ GitHub (liens commits/PR)
- [ ] **CC** : créer les issues (epics + roadmap) une fois l'équipe en place

### GitHub — **H**
- [ ] **H** : protection de branche `main` (PR non mergeable sans CI verte) → nécessite plan **GitHub Team** (repo privé). Config prête, j'applique dès l'upgrade.

### Vercel — **H** ⚠️
- [ ] **H** : le déploiement **échoue actuellement** — vérifier/renseigner les **variables d'env de build** dans les settings du projet (clés Clerk, `NEXT_PUBLIC_SITE_URL`, Supabase, Resend) puis redéployer
- [ ] **H** : confirmer que le projet `mercaflow` est bien sous l'équipe **A26K** (non listé via l'API équipe — possible scope/compte différent)

### Supabase — **H + CC-MCP**
- [ ] **H** : activer **Third-Party Auth Clerk** dans les dashboards Clerk **et** Supabase (sinon requêtes serveur en rôle `anon`)
- [ ] **H** : politique de branching DB (un env par PR) + revue des policies RLS
- [ ] **CC-MCP** : vérifier migrations/advisors une fois le MCP reconnecté

### Infisical — **H puis CC-MCP**
- [ ] **H** : créer le projet Infisical **Mercaflow** (envs dev/staging/prod) + machine identity
- [ ] **H** : exporter `INFISICAL_UNIVERSAL_AUTH_CLIENT_ID/SECRET` en local
- [ ] **CC-MCP** : pousser/structurer les secrets, sync Vercel

### Observabilité & email — **H / CC-MCP**
- [ ] PostHog : projet Mercaflow (timezone Europe/Zurich) — **CC-MCP**
- [ ] Sentry : projet Mercaflow (sourcemaps, releases, alertes) — **CC-MCP**
- [ ] Resend : domaine `mercaflow.ai` vérifié + `RESEND_FROM_EMAIL` — **H**

### Mémoire projet — **H puis CC**
- [ ] **H** : créer le vault Basic Memory `mercaflow-wiki` (connecteur dédié) + `_activity_log`
- [ ] **CC** : tenir le journal d'activité à chaque session

## Notes
- **Prettier** non ajouté volontairement (hors stack actuelle ; éviterait un reformat massif). lint-staged se limite à `eslint --fix`. À discuter.
- Toute l'architecture (Next 16 mono-app, Clerk/Supabase/Resend/shadcn/SEO) reste celle décrite dans `MEMORY.md` — non modifiée.
