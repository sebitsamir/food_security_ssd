.PHONY: setup fixture db api web test lint e2e up up-prod bootstrap-prod
setup:            ## install dependencies
	cd backend && python -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
	cd frontend && npm ci
fixture:          ## regenerate SYNTHETIC dev boundaries (never for production)
	cd backend && .venv/bin/python -m scripts.make_dev_fixture
db:               ## migrate, sync geographies, train the SYNTHETIC dev model and seed sample data
	cd backend && .venv/bin/alembic upgrade head && .venv/bin/python -m scripts.load_geographies && .venv/bin/python -m scripts.seed_dev
api:
	cd backend && .venv/bin/uvicorn app.main:create_app --factory --reload --port 8000
web:
	cd frontend && npm run dev
test:
	cd backend && .venv/bin/pytest -q
	cd frontend && npm test
lint:
	cd backend && .venv/bin/ruff check . && .venv/bin/ruff format --check . && .venv/bin/mypy app scripts
	cd frontend && npm run lint && npm run typecheck
e2e:              ## browser walkthrough; needs `make api` and a built `npm start` running
	python scripts/e2e_smoke.py
bootstrap-prod:   ## migrate + load geographies only (ENV=production, no synthetic seed; no Docker)
	cd backend && .venv/bin/python -m scripts.bootstrap_production
up:               ## optional Docker stack (synthetic seed — development only)
	docker compose up --build
up-prod:          ## optional Docker production stack
	docker compose -f docker-compose.prod.yml up --build
