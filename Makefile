# Enem Macetado — atalhos de desenvolvimento e operação.
#
#   make          → lista os comandos
#   make up       → sobe a stack em http://localhost:8099
#
# Requisitos: docker compose v2, Go 1.22 e pnpm 12 (apenas para dev/test).

SHELL := /bin/bash
.DEFAULT_GOAL := help
COMPOSE ?= docker compose

.PHONY: help up down logs ps rebuild api-logs db-shell backup restore test dev-api dev-web clean

help: ## Lista os comandos disponíveis
	@echo ""
	@echo "Enem Macetado — comandos"
	@echo ""
	@grep -hE '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'
	@echo ""

up: ## Sobe db, api e web (com build)
	$(COMPOSE) up -d --build
	@echo "→ http://localhost:8099"

down: ## Derruba os containers (mantém o volume do banco)
	$(COMPOSE) down --remove-orphans

logs: ## Acompanha os logs de todos os serviços
	$(COMPOSE) logs -f --tail=100

ps: ## Mostra o estado e a saúde dos serviços
	$(COMPOSE) ps

rebuild: ## Recria as imagens sem cache e reinicia a stack
	$(COMPOSE) build --no-cache
	$(COMPOSE) up -d --force-recreate

api-logs: ## Acompanha apenas os logs da API
	$(COMPOSE) logs -f --tail=200 api

db-shell: ## Abre o psql no banco da stack
	$(COMPOSE) exec db sh -c 'psql -U "$$POSTGRES_USER" -d "$$POSTGRES_DB"'

backup: ## Gera um dump em backups/ (ver deploy/backup.sh)
	./deploy/backup.sh

restore: ## Mostra como restaurar um dump (não executa)
	@echo "Restaurar um dump (substitui o conteúdo do banco):"
	@echo "  1) make down"
	@echo "  2) $(COMPOSE) up -d db"
	@echo "  3) $(COMPOSE) exec -T db pg_restore -U \"\$$POSTGRES_USER\" -d \"\$$POSTGRES_DB\" --clean --if-exists --no-owner < backups/enem-AAAAMMDD-HHMMSS.dump"
	@echo "  4) make up"
	@echo "Obs.: mantenha a API parada durante o restore; o dump precisa existir no host."

test: ## Roda os testes do backend e o build do frontend
	cd backend && go test ./...
	cd frontend && pnpm install --frozen-lockfile && pnpm build

dev-api: ## Roda a API fora do Docker (usa o Postgres do compose)
	cd backend && \
		DATABASE_URL="$${DATABASE_URL:-postgres://enem:enem_dev_password@127.0.0.1:55432/enem?sslmode=disable}" \
		SEED_QUESTIONS_PATH="$${SEED_QUESTIONS_PATH:-../content/questions.json}" \
		APP_TIMEZONE="$${APP_TIMEZONE:-America/Sao_Paulo}" \
		go run ./cmd/api

dev-web: ## Roda o Vite em http://localhost:5173 (proxy para a API)
	cd frontend && pnpm dev

clean: ## Derruba tudo e APAGA o volume do banco
	$(COMPOSE) down --volumes --remove-orphans
