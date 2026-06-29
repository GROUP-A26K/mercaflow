# Mercaflow — raccourcis de commandes.
# Usage : `make <cible>` (ex. `make dev`). `make` seul affiche cette aide.

.DEFAULT_GOAL := help
.PHONY: help install dev build start lint typecheck test test-watch test-e2e check clean reset agents wt cloud

help: ## Affiche les cibles disponibles
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

install: ## Installe les dépendances
	npm install

dev: ## Lance le serveur de dev (http://localhost:3000)
	npm run dev

build: ## Build de production
	npm run build

start: ## Démarre le build de production
	npm run start

lint: ## Lint ESLint
	npm run lint

typecheck: ## Vérifie les types (tsc --noEmit)
	npm run typecheck

test: ## Tests unitaires (Vitest)
	npm run test

test-watch: ## Tests unitaires en watch
	npm run test:watch

test-e2e: ## Tests end-to-end (Playwright)
	npm run test:e2e

check: ## typecheck + lint + tests (à lancer avant de commit)
	npm run check

agents: ## Tableau de bord des agents & worktrees (qui-est-sur-quoi)
	@scripts/agents.sh

wt: ## Crée un worktree isolé : make wt b=feat/JB/MER-XX-slug
	@test -n "$(b)" || { echo "Usage : make wt b=feat/JB/MER-XX-slug"; exit 2; }
	@scripts/wt.sh "$(b)"

cloud: ## Flotte Cursor Cloud Agents : make cloud a='--check' (cf. docs/cloud-agents.md)
	@infisical run --env=dev -- node scripts/cloud-agents.mjs $(a)

clean: ## Supprime le cache de build Next
	rm -rf .next

reset: ## Nettoyage complet (cache + node_modules) puis réinstall
	rm -rf .next node_modules
	npm install
