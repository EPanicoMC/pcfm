.PHONY: install build start start-prod start-api start-web test lint format migrate backup seed help

PYTHON := python3
PIP := $(PYTHON) -m pip
VENV := .venv
VENV_BIN := $(VENV)/bin

API_PORT := 8000
WEB_PORT := 5173

help:
	@echo "PCFM — comandi disponibili:"
	@echo "  make install      Installa dipendenze Python e Node"
	@echo "  make build        Build React (apps/web/dist)"
	@echo "  make start        Avvia API + Web (dev) e apre il browser"
	@echo "  make start-prod   Avvia solo FastAPI in produzione su :$(API_PORT)"
	@echo "  make start-api    Solo FastAPI (dev) su :$(API_PORT)"
	@echo "  make start-web    Solo Vite su :$(WEB_PORT)"
	@echo "  make test         Esegui tutti i test (pytest + vitest)"
	@echo "  make test-api     Solo pytest"
	@echo "  make test-web     Solo vitest"
	@echo "  make lint         Linting (ruff + eslint)"
	@echo "  make format       Auto-format (ruff + prettier)"
	@echo "  make migrate      Applica migrazioni Alembic"
	@echo "  make backup       Backup manuale del DB"
	@echo "  make seed         Popola DB con fixture di sviluppo"

install:
	$(PYTHON) -m venv $(VENV)
	$(VENV_BIN)/pip install --upgrade pip
	$(VENV_BIN)/pip install -e "packages/domain[dev]"
	$(VENV_BIN)/pip install -e "apps/api[dev]"
	cd apps/web && npm install

build:
	cd apps/web && npm run build
	@echo "✅ Build completata → apps/web/dist/"

start: migrate
	@echo "Avvio PCFM (dev)..."
	@PYTHONPATH=packages/domain:. $(VENV_BIN)/uvicorn apps.api.app.main:app --host 0.0.0.0 --port $(API_PORT) --reload &
	@sleep 2
	@cd apps/web && npm run dev &
	@sleep 2
	@open http://localhost:$(WEB_PORT) || xdg-open http://localhost:$(WEB_PORT) || true
	@wait

start-prod: migrate build
	@echo "Avvio PCFM (produzione) su http://localhost:$(API_PORT)"
	@sleep 1
	@open http://localhost:$(API_PORT) || true
	PYTHONPATH=packages/domain:. $(VENV_BIN)/uvicorn apps.api.app.main:app \
		--host 0.0.0.0 --port $(API_PORT) --log-level info

start-api: migrate
	PYTHONPATH=packages/domain:. $(VENV_BIN)/uvicorn apps.api.app.main:app --host 0.0.0.0 --port $(API_PORT) --reload

start-web:
	cd apps/web && npm run dev

test: test-api test-web

test-api:
	PYTHONPATH=packages/domain:. $(VENV_BIN)/pytest tests/ -v

test-web:
	cd apps/web && npm run test

lint:
	$(VENV_BIN)/ruff check apps/api packages/domain tests
	cd apps/web && npm run lint

format:
	$(VENV_BIN)/ruff format apps/api packages/domain tests
	cd apps/web && npm run format

migrate:
	@mkdir -p data/backups data/imports data/exports
	$(VENV_BIN)/alembic upgrade head
	PYTHONPATH=packages/domain:. $(VENV_BIN)/python scripts/seed.py

backup:
	PYTHONPATH=packages/domain:. $(VENV_BIN)/python scripts/backup_now.py

seed:
	PYTHONPATH=packages/domain:. $(VENV_BIN)/python scripts/seed.py
