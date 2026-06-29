#!/usr/bin/env bash
# Mercaflow — tableau de bord des agents & worktrees (anti-tangling, MER-31).
#
# Répond à « qui est sur quoi ? » : liste le checkout principal, chaque worktree
# (branche, propre/sale, avance/retard sur main), les sessions Claude Code en cours
# et OÙ elles travaillent. Signale les deux pièges qui « entremêlent » tout :
#   1. le checkout principal qui a dérivé hors de `main` ;
#   2. plusieurs sessions Claude Code dans le MÊME checkout (1 session = 1 worktree).
#
# Usage : scripts/agents.sh   (ou `make agents`). Lecture seule, ne modifie rien.
#
# Note : une session ouverte via l'outil natif EnterWorktree garde son process à la
# racine du dépôt → elle peut apparaître « dans le principal ». Le compteur reste un
# bon révélateur de collisions, pas une mesure exacte.
#
# Pré-requis : bash, git. `lsof` (présent sur macOS) pour le mapping session→worktree.
# Compatible bash 3.2 (macOS) : pas de tableaux associatifs ni de mapfile.
set -eo pipefail

# --- couleurs (désactivées si pas un terminal) -------------------------------
if [ -t 1 ]; then
  BOLD=$'\033[1m'; DIM=$'\033[2m'; RED=$'\033[31m'; GRN=$'\033[32m'
  YLW=$'\033[33m'; CYN=$'\033[36m'; RST=$'\033[0m'
else
  BOLD=""; DIM=""; RED=""; GRN=""; YLW=""; CYN=""; RST=""
fi

cd "$(git rev-parse --show-toplevel)"

# Branche par défaut (origin/HEAD → main), fallback "main".
DEFAULT_BRANCH="$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null | sed 's@^origin/@@')"
DEFAULT_BRANCH="${DEFAULT_BRANCH:-main}"

# --- 1) worktrees : tableaux parallèles (indice 0 = checkout principal) -------
WT_PATHS=(); WT_BRANCHES=()
cur_path=""; cur_branch=""
while IFS= read -r line; do
  case "$line" in
    worktree\ *) cur_path="${line#worktree }" ;;
    branch\ *)   cur_branch="${line#branch refs/heads/}" ;;
    detached)    cur_branch="(detached HEAD)" ;;
    "")
      if [ -n "$cur_path" ]; then
        WT_PATHS+=("$cur_path"); WT_BRANCHES+=("${cur_branch:-?}")
      fi
      cur_path=""; cur_branch=""
      ;;
  esac
done < <(git worktree list --porcelain; echo)

# --- 2) sessions Claude Code : "pid<TAB>cwd" par process ---------------------
session_lines() {
  local pids pid cwd
  pids="$(pgrep -f 'native-binary/claude' 2>/dev/null || true)"
  [ -z "$pids" ] && return 0
  for pid in $pids; do
    cwd="$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -1)"
    [ -n "$cwd" ] && printf '%s\t%s\n' "$pid" "$cwd"
  done
}
SESSIONS="$(session_lines || true)"
TOTAL_SESSIONS=0
[ -n "$SESSIONS" ] && TOTAL_SESSIONS="$(printf '%s\n' "$SESSIONS" | grep -c . || true)"

# worktree_of <cwd> : le worktree au plus long préfixe (évite que les worktrees,
# situés SOUS la racine, soient comptés dans le principal).
worktree_of() {
  local cwd="$1" wp best=""
  for wp in "${WT_PATHS[@]}"; do
    case "$cwd" in
      "$wp"|"$wp"/*) [ "${#wp}" -gt "${#best}" ] && best="$wp" ;;
    esac
  done
  printf '%s' "$best"
}

# Nombre de sessions rattachées EXACTEMENT à un worktree donné.
sessions_in() {
  local target="$1" pid cwd count=0
  [ -z "$SESSIONS" ] && { echo 0; return; }
  while IFS=$'\t' read -r pid cwd; do
    [ -z "$cwd" ] && continue
    [ "$(worktree_of "$cwd")" = "$target" ] && count=$((count+1))
  done <<EOF
$SESSIONS
EOF
  echo "$count"
}

# --- en-tête ------------------------------------------------------------------
printf '%s\n' "${BOLD}Mercaflow — agents & worktrees${RST}"
printf '%s\n' "${DIM}$(date '+%Y-%m-%d %H:%M')  ·  branche par défaut : ${DEFAULT_BRANCH}${RST}"
echo

# --- 3) affichage des worktrees ----------------------------------------------
MAIN_ROOT="${WT_PATHS[0]}"
WARNINGS=()

i=0
while [ "$i" -lt "${#WT_PATHS[@]}" ]; do
  WT_PATH="${WT_PATHS[$i]}"; branch="${WT_BRANCHES[$i]}"

  if [ -n "$(git -C "$WT_PATH" status --porcelain 2>/dev/null)" ]; then
    state="${YLW}sale${RST}"
  else
    state="${GRN}propre${RST}"
  fi

  ahead_behind=""
  if counts="$(git -C "$WT_PATH" rev-list --left-right --count "origin/${DEFAULT_BRANCH}...HEAD" 2>/dev/null)"; then
    behind="$(echo "$counts" | awk '{print $1}')"; ahead="$(echo "$counts" | awk '{print $2}')"
    [ "${ahead:-0}" -gt 0 ] && ahead_behind="${ahead_behind}${GRN}↑${ahead}${RST} "
    [ "${behind:-0}" -gt 0 ] && ahead_behind="${ahead_behind}${RED}↓${behind}${RST} "
  fi

  nsess="$(sessions_in "$WT_PATH")"
  sess_badge=""
  [ "$nsess" -gt 0 ] && sess_badge="${CYN}● ${nsess} session(s)${RST}"

  if [ "$i" -eq 0 ]; then
    if [ "$branch" = "$DEFAULT_BRANCH" ]; then
      drift="${GRN}✓${RST}"
    else
      drift="${RED}⚠ dérive (devrait être ${DEFAULT_BRANCH})${RST}"
      WARNINGS+=("Le checkout principal est sur '${branch}' au lieu de '${DEFAULT_BRANCH}'.")
    fi
    printf '%s %s  %b\n' "${BOLD}principal${RST}" "$branch" "$drift"
    printf '  %s  %b%b\n' "${DIM}${WT_PATH}${RST}" "$state" "${sess_badge:+  $sess_badge}"
    if [ "$nsess" -gt 1 ]; then
      WARNINGS+=("${nsess} sessions dans le checkout principal — 1 session = 1 worktree.")
    fi
  else
    printf '%s  %b %b%b\n' "${BOLD}$(basename "$WT_PATH")${RST}" "$state" "$ahead_behind" "${sess_badge:+ $sess_badge}"
    printf '  %s\n' "${DIM}${branch}  ·  ${WT_PATH}${RST}"
  fi
  echo
  i=$((i+1))
done

# --- 4) sessions (détail) -----------------------------------------------------
printf '%s %s\n' "${BOLD}Sessions Claude Code :${RST}" "${TOTAL_SESSIONS}"
if [ "$TOTAL_SESSIONS" -gt 0 ] && [ -n "$SESSIONS" ]; then
  printf '%s\n' "$SESSIONS" | while IFS=$'\t' read -r pid cwd; do
    [ -z "$cwd" ] && continue
    short="${cwd/#$MAIN_ROOT/.}"
    printf '  %s pid %-7s %s\n' "${DIM}·${RST}" "$pid" "${DIM}${short}${RST}"
  done
fi
echo

# --- 5) avertissements --------------------------------------------------------
if [ "${#WARNINGS[@]}" -gt 0 ]; then
  printf '%s\n' "${RED}${BOLD}⚠ À corriger${RST}"
  for w in "${WARNINGS[@]}"; do printf '  %b%s\n' "${RED}•${RST} " "$w"; done
  echo
  printf '%s\n' "${DIM}Astuce : ouvre chaque tâche dans son worktree → 'make wt b=<type/JB/MER-XX-slug>'.${RST}"
else
  printf '%s\n' "${GRN}✓ Rien à signaler — pas de dérive, pas de collision de session.${RST}"
fi
