#!/usr/bin/env bash
# Push des secrets Mercaflow vers Infisical, par environnement.
#
# Garanties anti-fuite :
#   - Les VALEURS ne sont jamais affichées (stdout = noms de clés + statut).
#   - Les valeurs et le token ne passent PAS en argv (donc invisibles dans `ps`) :
#     tout passe par stdin (curl --data @-) ou variables d'env de sous-processus.
#   - Aucune valeur n'entre dans une session Claude : c'est TOI qui lances ce script.
#
# Usage :
#   scripts/infisical-push.sh <dev|staging|prod> [fichier-source]
#
# Le fichier source (défaut .env.local) contient des lignes KEY=VALUE en clair,
# sur TA machine uniquement (jamais commité). Lance une fois par environnement avec
# le fichier correspondant, ex. :
#   scripts/infisical-push.sh dev      .env.local
#   scripts/infisical-push.sh staging  .secrets/staging.env
#   scripts/infisical-push.sh prod     .secrets/prod.env
#
# Pré-requis : bash, curl, python3. Auth via ~/.config/secrets/infisical-mercaflow.env
set -eo pipefail

ENV="${1:-}"
SRC="${2:-.env.local}"
HOST="${INFISICAL_HOST_URL:-https://eu.infisical.com}"
PROJECT_ID="d2b1250e-2062-4830-9529-4da32e822aa5"
AUTH_ENV="$HOME/.config/secrets/infisical-mercaflow.env"

case "$ENV" in
  dev|staging|prod) ;;
  *) echo "Usage: $0 <dev|staging|prod> [fichier-source]" >&2; exit 1 ;;
esac
[ -f "$SRC" ]      || { echo "Fichier source introuvable : $SRC" >&2; exit 1; }
[ -f "$AUTH_ENV" ] || { echo "Auth env introuvable : $AUTH_ENV" >&2; exit 1; }

# --- Auth Universal Auth -> token (jamais affiché ; creds via stdin) ---
# shellcheck disable=SC1090
. "$AUTH_ENV"
export INFISICAL_UNIVERSAL_AUTH_CLIENT_ID INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET
TOKEN=$(
  python3 - <<'PY' | curl -sf -X POST "$HOST/api/v1/auth/universal-auth/login" \
        -H 'Content-Type: application/json' --data @- \
    | python3 -c 'import sys,json; print(json.load(sys.stdin)["accessToken"])'
import os, json
print(json.dumps({
    "clientId":     os.environ["INFISICAL_UNIVERSAL_AUTH_CLIENT_ID"],
    "clientSecret": os.environ["INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET"],
}))
PY
)
[ -n "$TOKEN" ] || { echo "Login Infisical échoué." >&2; exit 1; }

# --- Mapping clé -> dossier (doit refléter la structure Infisical) ---
MAP="NEXT_PUBLIC_SITE_URL /seo
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY /clerk
CLERK_SECRET_KEY /clerk
NEXT_PUBLIC_CLERK_SIGN_IN_URL /clerk
NEXT_PUBLIC_CLERK_SIGN_UP_URL /clerk
NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL /clerk
NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL /clerk
CLERK_WEBHOOK_SIGNING_SECRET /clerk
NEXT_PUBLIC_SUPABASE_URL /supabase
NEXT_PUBLIC_SUPABASE_ANON_KEY /supabase
RESEND_API_KEY /resend
RESEND_FROM_EMAIL /resend"

echo "→ Push env '$ENV' depuis '$SRC' (valeurs jamais affichées)"
FAILED=0
while read -r KEY FOLDER; do
  [ -z "$KEY" ] && continue

  # Lire la valeur depuis le fichier source SANS jamais l'imprimer
  VALUE=$(SRC="$SRC" KEY="$KEY" python3 - <<'PY'
import os, sys
src, key, val = os.environ["SRC"], os.environ["KEY"], ""
with open(src) as f:
    for line in f:
        s = line.strip()
        if not s or s.startswith("#") or "=" not in s:
            continue
        k, v = s.split("=", 1)
        if k.strip() == key:
            v = v.strip()
            if len(v) >= 2 and v[0] == v[-1] and v[0] in "\"'":
                v = v[1:-1]
            val = v
sys.stdout.write(val)
PY
)

  if [ -z "$VALUE" ]; then
    printf '  %-50s %-10s [SKIP absent du fichier]\n' "$KEY" "$FOLDER"; continue
  fi
  if [ "$VALUE" = "REPLACE_ME" ]; then
    printf '  %-50s %-10s [SKIP placeholder]\n' "$KEY" "$FOLDER"; continue
  fi

  # Corps JSON construit côté python (valeur via env, pas argv), envoyé via stdin
  CODE=$(WID="$PROJECT_ID" ENVSLUG="$ENV" SP="$FOLDER" VAL="$VALUE" python3 - <<'PY' \
      | curl -s -o /dev/null -w '%{http_code}' -X PATCH \
            "$HOST/api/v3/secrets/raw/$KEY" \
            -H "Authorization: Bearer $TOKEN" \
            -H 'Content-Type: application/json' --data @-
import os, json
print(json.dumps({
    "workspaceId":  os.environ["WID"],
    "environment":  os.environ["ENVSLUG"],
    "secretPath":   os.environ["SP"],
    "secretValue":  os.environ["VAL"],
    "type":         "shared",
}))
PY
)

  if [ "$CODE" = "200" ]; then
    printf '  %-50s %-10s [OK]\n' "$KEY" "$FOLDER"
  else
    printf '  %-50s %-10s [FAIL http=%s]\n' "$KEY" "$FOLDER" "$CODE"; FAILED=1
  fi
done <<EOF
$MAP
EOF

if [ "$FAILED" = 0 ]; then
  echo "✓ Tous les secrets présents poussés sur '$ENV'."
else
  echo "⚠ Des échecs ci-dessus (voir http=...)." >&2; exit 1
fi
