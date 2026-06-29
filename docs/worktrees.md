# Worktrees & multi-agent (anti-tangling)

Plusieurs sessions Claude Code (ou autres agents) qui travaillent **dans le même
checkout** se battent pour l'unique `git HEAD` : la copie principale dérive hors de
`main`, des branches se mélangent, `node_modules` se duplique. Ce guide cadre la
convention pour que ça n'arrive plus.

> Règle d'or : **1 session = 1 worktree isolé. Jamais deux agents dans le même checkout.**

## Convention

- Les worktrees vivent dans **`.claude/worktrees/`** (créé nativement par le harness
  Claude Code, et **gitignoré** — cf. `.gitignore`). On garde **une seule** convention
  pour ne pas re-mélanger ; on ne combat pas le harness avec un second dossier.
- Le **checkout principal** (`~/Code/Mercaflow`) reste **sur `main`**. On n'y code pas
  une feature : on l'utilise pour `git pull`, créer des worktrees, et lancer `make agents`.
- Une branche par issue Linear : `feat|fix|chore|refactor/JB/MER-XX-slug` (cf. `CLAUDE.md`).
- Un worktree est **jeté** une fois la PR mergée (`git worktree remove`), pas conservé.

## Commandes

```bash
make agents                              # tableau de bord : qui-est-sur-quoi + alertes dérive/collision
make wt b=feat/JB/MER-42-audit-feed      # crée un worktree isolé pour la tâche
```

`make agents` (lecture seule) signale les deux pièges :

- **dérive** — le checkout principal n'est pas sur `main` ;
- **collision** — plusieurs sessions dans le même checkout.

`make wt` :

1. branche depuis `origin/main` à jour (jamais d'une dérive) ;
2. déduplique `node_modules` par **clone copy-on-write APFS** (`cp -c`) — blocs partagés,
   donc **~0 octet de disque réel** (pas instantané : ~30 s pour ~100k fichiers, mais sans
   recopier les données), et **isolé** : un `npm install` dans le worktree ne touche pas le
   `node_modules` principal. Fallback symlink hors APFS.

### Dans une session Claude Code

Préfère l'outil natif **EnterWorktree** (le harness gère le dossier et le cycle de vie).
`make wt` est l'équivalent terminal / pour les autres harnesses.

## Workflow type

```bash
# depuis le checkout principal, sur main
git switch main && git pull
make wt b=feat/JB/MER-42-audit-feed
cd .claude/worktrees/feat+JB+MER-42-audit-feed
# → passer MER-42 « In Progress » dans Linear, ouvrir ce dossier dans une
#   nouvelle fenêtre VSCode, y lancer Claude Code, coder, make check, PR.

# après merge de la PR :
git worktree remove .claude/worktrees/feat+JB+MER-42-audit-feed
git branch -d feat/JB/MER-42-audit-feed
```

## Remettre d'équerre un checkout principal qui a dérivé

Si `make agents` montre le principal hors de `main` **sans modif en cours** :

```bash
git switch main          # depuis le checkout principal
```

S'il y a du travail non commité dessus, le déplacer dans son worktree avant
(`git stash` → worktree → `git stash pop`), puis revenir à `main`.

---

## Upgrade optionnel : Crystal (cockpit GUI)

Pour un vrai cockpit visuel multi-agents (au lieu de N fenêtres VSCode à la main) :

**Crystal / Nimbalyst** — `https://github.com/stravu/crystal` — app desktop macOS (MIT)
qui lance plusieurs sessions Claude Code **chacune dans son propre worktree**, avec
diff, comparaison d'approches et registre intégré. C'est le tool qui *possède* le cycle
de vie des worktrees → la dérive disparaît structurellement.

Installation (à faire par JB) :

```bash
brew install --cask crystal     # si dispo sur le cask, sinon télécharger la release GitHub
```

Puis : pointer Crystal sur `~/Code/Mercaflow`, créer une session par issue. Crystal
gère les worktrees ; `node_modules` reste à ta charge (réutiliser le pattern `cp -c`).

### Pourquoi pas claude-squad / dmux ?

Ce sont d'excellents orchestrateurs worktree+tmux (`smtg-ai/claude-squad`,
`standardagents/dmux`), mais **terminal/tmux-first** — incompatibles avec l'usage
actuel via l'extension VSCode. À reconsidérer si on bascule sur un workflow terminal.

### Comparatif (juin 2026)

| Outil | Isolation | Interface | Fit Mercaflow |
| -- | -- | -- | -- |
| **Convention maison (ce repo)** | worktree | CLI (`make agents`/`wt`) | ✅ zéro dépendance, colle à VSCode |
| **Crystal / Nimbalyst** | worktree/session | app macOS | ✅ cockpit visuel, worktree-natif |
| claude-squad | worktree+tmux | TUI | ⚠ tmux (pas VSCode) |
| dmux | worktree+pane | tmux | ⚠ tmux (skill `dmux-workflows` dispo) |
| vibe-kanban | worktree/tâche | web | ⚠ serveur à faire tourner |
| container-use | container | MCP | 🟠 Docker ; règle les collisions de deps/ports |
