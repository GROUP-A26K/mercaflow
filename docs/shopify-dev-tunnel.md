# Tunnel de dev Shopify — hostname stable (MER-36)

Pour tester le flow OAuth Shopify en local, l'App Shopify doit pointer vers une URL
publique HTTPS qui atteint ton `localhost:3000`. On utilise un **tunnel Cloudflare nommé**
sur un hostname **stable** :

```
https://shopify-dev.mercaflow.ai  →  http://localhost:3000
```

**Pourquoi pas un quick-tunnel `*.trycloudflare.com` ?** Son URL change à chaque
redémarrage → il faut re-créer + release une **version** de l'App Shopify (App URL +
redirect) à chaque fois. Avec un hostname stable, on configure Shopify **une seule fois**.

> Aucun changement du code OAuth : `app/api/shopify/install/route.ts` dérive le
> `redirect_uri` de `request.nextUrl.origin` → il suit automatiquement le hostname.

## Usage quotidien

Deux process en parallèle :

```bash
# Terminal 1 — dev server (secrets injectés via Infisical)
make dev

# Terminal 2 — tunnel Cloudflare
make tunnel
```

Puis : `https://shopify-dev.mercaflow.ai/dashboard` → carte « Connecter Shopify ».

Vérif rapide que le tunnel est up : `curl -I https://shopify-dev.mercaflow.ai/` → `200`.

## Configuration Shopify (one-time)

Dans le **Dev Dashboard Shopify → App → Versions → Create a version** :

- **App URL** : `https://shopify-dev.mercaflow.ai`
- **Redirect URLs** : `https://shopify-dev.mercaflow.ai/api/shopify/callback`

…puis **Release** la version. À ne refaire que si le hostname change (il ne change plus).

## Détails du tunnel

- Tunnel nommé : **`mercaflow-dev`** (id `0289f897-edae-4e5d-b0ae-7c4f27a5837c`).
- Ingress versionné : [`infra/cloudflared/config.yml`](../infra/cloudflared/config.yml).
- CNAME `shopify-dev.mercaflow.ai` → `<UUID>.cfargotunnel.com` (zone `mercaflow.ai`).
- Credentials de run : `~/.cloudflared/<UUID>.json` — **machine-local, jamais commité**.
  Backup dans **Infisical** (`/cloudflare`, secret `CLOUDFLARE_TUNNEL_CREDENTIALS`, env dev).

## Bootstrap d'une nouvelle machine

Option A — recréer l'auth localement (accès Cloudflare requis) :

```bash
cloudflared tunnel login          # autoriser la zone mercaflow.ai
# le tunnel mercaflow-dev existe déjà côté Cloudflare : récupérer ses credentials
# via le backup Infisical (option B) plutôt que d'en recréer un.
```

Option B — restaurer les credentials depuis Infisical (recommandé) :

```bash
mkdir -p ~/.cloudflared
infisical secrets get CLOUDFLARE_TUNNEL_CREDENTIALS --env=dev --plain \
  > ~/.cloudflared/0289f897-edae-4e5d-b0ae-7c4f27a5837c.json
make tunnel
```

## Dépannage

- **`curl` → 000 / NXDOMAIN** : le tunnel n'est pas lancé (`make tunnel`) ou le CNAME a
  été supprimé. Vérifier `cloudflared tunnel list` et `cloudflared tunnel info mercaflow-dev`.
- **502 via le tunnel** : le dev server local n'écoute pas sur `:3000` (`make dev`).
- **Shopify « redirect_uri mismatch »** : la version active ne porte pas exactement
  `https://shopify-dev.mercaflow.ai/api/shopify/callback` → corriger + release.
