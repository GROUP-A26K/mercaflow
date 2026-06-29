#!/usr/bin/env bash
# Mercaflow — crée un worktree isolé pour une tâche (anti-tangling, MER-31).
#
# Convention : 1 issue Linear = 1 branche = 1 worktree. Jamais deux sessions dans
# le même checkout. Les worktrees vivent dans .claude/worktrees/ (gitignoré), au
# même endroit que ceux du harness Claude Code, pour ne pas avoir deux conventions.
#
# node_modules : on évite de réinstaller 1,4 Go par worktree.
#   - macOS/APFS  → clone copy-on-write (`cp -c`) : blocs partagés → ~0 octet de disque
#     réel (pas instantané, ~30 s pour ~100k fichiers, mais sans recopier les données).
#     Isolé : un `npm install` ultérieur dans le worktree ne touche PAS le node_modules
#     principal (contrairement à un symlink).
#   - autres FS   → fallback symlink (⚠ ne PAS `npm install` dans le worktree alors).
#
# Usage :
#   scripts/wt.sh <type/JB/MER-XX-slug>        # ex. feat/JB/MER-42-audit-feed
#   scripts/wt.sh <type> <MER-XX> <slug>       # ex. feat MER-42 audit-feed
#
# Affiche ensuite le `cd` à faire et le rappel de passer l'issue In Progress.
# Pré-requis : bash, git. (Dans une session Claude Code, préfère l'outil natif
# EnterWorktree — ce script est pour le terminal / les autres harnesses.)
set -eo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

# --- résolution du nom de branche --------------------------------------------
if [ "$#" -eq 1 ]; then
  BRANCH="$1"
elif [ "$#" -eq 3 ]; then
  BRANCH="$1/JB/$2-$3"
else
  echo "Usage : scripts/wt.sh <type/JB/MER-XX-slug>" >&2
  echo "   ou : scripts/wt.sh <type> <MER-XX> <slug>" >&2
  exit 2
fi

# Garde-fou : la branche doit ressembler à type/JB/MER-XX-slug.
if ! printf '%s' "$BRANCH" | grep -qE '^(feat|fix|chore|refactor|docs|test|perf|ci)/JB/[A-Z]+-[0-9]+-[a-z0-9._-]+$'; then
  echo "✗ Nom de branche non conforme : '$BRANCH'" >&2
  echo "  Attendu : <feat|fix|chore|refactor|docs|test|perf|ci>/JB/MER-XX-slug" >&2
  exit 2
fi

# Dossier du worktree : '/' → '+' (même schéma que le harness Claude Code).
WT_DIR=".claude/worktrees/${BRANCH//\//+}"
if [ -e "$WT_DIR" ]; then
  echo "✗ Le worktree existe déjà : $WT_DIR" >&2
  exit 1
fi

# Base = origin/<défaut> à jour (worktree propre, jamais hérité d'une dérive).
DEFAULT_BRANCH="$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null | sed 's@^origin/@@')"
DEFAULT_BRANCH="${DEFAULT_BRANCH:-main}"
echo "→ Mise à jour de origin/${DEFAULT_BRANCH}…"
git fetch --quiet origin "$DEFAULT_BRANCH"

echo "→ Création du worktree '$BRANCH' (base origin/${DEFAULT_BRANCH})…"
git worktree add -b "$BRANCH" "$WT_DIR" "origin/${DEFAULT_BRANCH}"

# --- node_modules : dedup ----------------------------------------------------
if [ -d "$ROOT/node_modules" ]; then
  echo "→ node_modules : tentative de clone copy-on-write (APFS)…"
  if cp -c -R "$ROOT/node_modules" "$WT_DIR/node_modules" 2>/dev/null; then
    echo "  ✓ clone CoW (isolé, ~0 octet tant que rien ne change)."
  else
    ln -s "$ROOT/node_modules" "$WT_DIR/node_modules"
    echo "  ✓ symlink (FS sans CoW). ⚠ NE PAS 'npm install' ici : ça écrirait dans le node_modules principal."
  fi
else
  echo "  (pas de node_modules à la racine — lance 'npm install' dans le worktree.)"
fi

# --- prochaines étapes -------------------------------------------------------
ISSUE="$(printf '%s' "$BRANCH" | grep -oE '[A-Z]+-[0-9]+' | head -1)"
cat <<EOF

✓ Worktree prêt : $WT_DIR
  Branche : $BRANCH

Prochaines étapes :
  cd "$WT_DIR"
  # passe ${ISSUE:-l'issue} en « In Progress » dans Linear
  # ouvre ce dossier dans une NOUVELLE fenêtre VSCode pour y lancer Claude Code
EOF
