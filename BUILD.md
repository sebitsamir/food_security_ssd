# Professional build guide — South Sudan Food Security Intelligence

Phase-by-phase plan to build this product from an empty folder through a production-ready release.  
Each phase ends with **one or more commit messages** you can use as-is (Conventional Commits, imperative mood, why over what).

**Stack:** FastAPI · PostgreSQL/SQLite · scikit-learn · Next.js 15 · TypeScript · Tailwind v4 · d3-geo  

**Windows note:** Docker is optional. Local and production runs use PowerShell (`dev.ps1`) and a reachable PostgreSQL instance.

---

## Conventions

| Item | Rule |
|------|------|
| Branches | `main` protected; feature work on `feat/<short-name>` |
| Commits | `type(scope): summary` — max ~72 chars on first line; body optional |
| Types | `feat`, `fix`, `docs`, `chore`, `test`, `refactor`, `ci`, `build` |
| Never commit | `.env`, model `.joblib`, secrets, `node_modules`, `.venv`, `dev.db` |

Suggested types for this project:

- `feat` — user-facing capability  
- `fix` — bug fix  
- `chore` — tooling, deps, scaffolding  
- `docs` — README / this guide  
- `test` — tests only  
- `ci` — GitHub Actions  
- `build` — Docker / packaging  

---

## Prerequisites

- **Python 3.12** (3.11+ works; 3.14 may work with Windows `uvloop` skipped)  
- **Node.js 22 LTS** (20+ works)  
- **Git**  
- **PostgreSQL 16** for production (SQLite is fine for local development only)  
- Optional: mapshaper via `npx` if rebuilding boundaries from shapefiles  

---

## Phase 0 — Repository scaffold

**Goal:** Empty product shell, ignore rules, and a clear README stub.

**Do:**

```text
south-sudan-risk-map/
  .gitignore
  README.md          # one-paragraph purpose + stack
  backend/
  frontend/
  scripts/
```

**.gitignore** should exclude: `.venv/`, `node_modules/`, `.env`, `*.db`, `.next/`, `models/**/*.joblib`, `__pycache__/`, `.pytest_cache/`.

**Commit:**

```
chore: scaffold monorepo for food security risk map

Establish backend and frontend roots with ignore rules so secrets,
virtualenvs, and model binaries never enter version control.
```

---

## Phase 1 — Backend foundation

**Goal:** Runnable FastAPI app with settings, logging, DB session, and health checks.

**Do:**

- `backend/requirements.txt` + `requirements-dev.txt`  
- `app/core/config.py` — `ENV`, `DATABASE_URL`, `CORS_ORIGINS`, `MODELS_DIR`  
- `app/core/logging.py`, `middleware.py` (request id + security headers)  
- `app/core/errors.py` — `application/problem+json`  
- `app/db/` — SQLAlchemy models, Alembic `0001_initial`  
- `app/main.py` — factory app, CORS, gzip, lifespan stub  
- `GET /healthz`, `GET /readyz`  
- `backend/.env.example` (SQLite for development)

**Verify:**

```powershell
cd backend
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
Copy-Item .env.example .env
.\.venv\Scripts\python.exe -m alembic upgrade head
.\.venv\Scripts\python.exe -m uvicorn app.main:create_app --factory --reload --port 8000
# GET http://localhost:8000/healthz → {"status":"ok"}
```

**Commits:**

```
feat(backend): add FastAPI factory with config and structured logging

Introduce settings, request-id middleware, and problem+json errors so
every response is operable before domain routes exist.
```

```
feat(backend): add SQLAlchemy models and initial Alembic migration

Persist geographies, observations, forecasts, model versions, and
prediction audits behind a portable schema for SQLite and PostgreSQL.
```

```
feat(api): expose liveness and readiness probes

Separate healthz from readyz so orchestrators can distinguish process
up from database-and-schema readiness.
```

---

## Phase 2 — Geography pipeline

**Goal:** Validated state/county GeoJSON loaded at startup; API serves `/api/v1/geo/*`.

**Do:**

- `backend/data/geo/{states,counties}.geojson` + `meta.json`  
- Dev fixture: `scripts/make_dev_fixture.py` (synthetic, labelled)  
- Real boundaries: `scripts/build_from_geoboundaries.py` and/or `scripts/build_geo.ps1`  
- `app/geo/loader.py` — schema, bbox, parents, winding; refuse synthetic when `ENV=production`  
- `scripts/load_geographies.py`, `scripts/validate_geo.py`  
- Routes: `GET /api/v1/geo/{states|counties}`, `GET /api/v1/geo/meta` (ETag / 304)

**Verify:**

```powershell
.\.venv\Scripts\python.exe -m scripts.validate_geo
.\.venv\Scripts\python.exe -m scripts.load_geographies
# GET /api/v1/geo/meta → synthetic true|false, attribution present
```

**Commits:**

```
feat(geo): validate and serve South Sudan admin boundaries

Load FeatureCollections at startup with strict pcode/parent checks so
a bad boundary file fails the deploy instead of breaking the map.
```

```
chore(geo): add synthetic county fixture for local development

Ship labelled placeholder polygons so UI and scoring work before
official OCHA-aligned boundaries are available.
```

```
feat(geo): build real OCHA-aligned boundaries with 79-county roster

Replace Voronoi placeholders with geoBoundaries ADM1/ADM2 shapes while
preserving the product’s county list and DEV* join keys.
```

---

## Phase 3 — Model registry and feature contract

**Goal:** Load scikit-learn pipelines safely; refuse synthetic models in production.

**Do:**

- `app/ml/features.py` — exact column contract  
- `app/ml/registry.py` — SHA-256, sklearn version, `synthetic` flag  
- `scripts/train_dev_model.py`, `scripts/activate_model.py`  
- `backend/models/<version>/` layout (gitignored binaries)  
- `backend/models/README.md` — artifact contract for operators  

**Commits:**

```
feat(ml): enforce model artifact contract and integrity checks

Require hashed joblib pipelines, feature parity, and sklearn version
match so only trusted artifacts can become the active model.
```

```
feat(ml): add synthetic dev trainer and activate_model script

Enable end-to-end local scoring without production weights, while
blocking synthetic activation when ENV=production.
```

---

## Phase 4 — Domain API (forecasts, counties, predictions)

**Goal:** Full read API + rate-limited prediction endpoint with audit trail.

**Do:**

- Observations import: `scripts/import_observations.py`  
- Scoring: `scripts/score_forecasts.py`  
- Dev seed: `scripts/seed_dev.py`  
- Routes under `/api/v1/`: forecasts, counties, model, `POST /predictions`  
- In-process rate limiter + `Retry-After` on 429  

**Verify:**

```powershell
.\.venv\Scripts\python.exe -m scripts.seed_dev
# GET /api/v1/forecasts/periods
# GET /api/v1/counties?period=...
# GET /readyz → model_loaded true (dev)
```

**Commits:**

```
feat(api): serve period forecasts and county risk profiles

Expose ranked county and state aggregates from the active model so the
frontend can render maps and tables from a single contract.
```

```
feat(api): add audited, rate-limited scenario predictions

Accept scenario inputs, score with the active pipeline, and persist an
audit row while throttling clients to protect shared instances.
```

```
feat(scripts): import observations and score forecast periods

Reject bad CSV rows as a unit and write forecasts only after the
active model verifies, keeping the warehouse consistent.
```

---

## Phase 5 — Frontend foundation

**Goal:** Next.js app shell, theme, API client, Zod schemas.

**Do:**

- `frontend/` — Next.js 15, TypeScript, Tailwind v4, Geist  
- `src/lib/api.ts` — server-only fetch, zod validation, cache policy  
- `src/lib/schemas.ts`  
- Layout: TopBar, Footer (attribution), theme script (no flash)  
- `frontend/.env.example` — `API_URL` (never `NEXT_PUBLIC_`)  
- Security headers in `next.config.ts`  

**Verify:**

```powershell
cd frontend
npm ci
npm run dev
# http://localhost:3000 — shell renders even if API is down
```

**Commits:**

```
feat(web): scaffold Next.js app with typed API client

Validate every backend payload with Zod and keep API_URL server-side
so the browser never learns the data-plane address.
```

```
feat(web): add app shell with theme persistence and attribution footer

Ship light/dark without flash and surface boundary provenance on every
page for responsible map use.
```

---

## Phase 6 — Map and core screens

**Goal:** Overview choropleth, forecasts, counties, model, methodology.

**Do:**

- `SouthSudanMap` + `StateExplorer` (d3-geo projection, keyboard nav)  
- Pages: Overview, Forecasts, Counties (+ detail), Model, Methodology  
- Risk bands, PDF/CSV export where specified  
- Responsive layout from 320px upward  

**Commits:**

```
feat(web): render interactive state risk choropleth

Project validated GeoJSON with d3-geo and join on pcode so overview and
forecast views share one accessible map component.
```

```
feat(web): add forecasts, counties, model, and methodology screens

Deliver filterable forecast tables, county profiles, validation charts,
and method docs so operators can explore risk end to end.
```

---

## Phase 7 — Predict flow

**Goal:** Scenario form, gauge, exports, session history; same-origin proxy.

**Do:**

- Predict page + form validation  
- `app/api/predict/route.ts` — proxy to backend, forward client IP  
- Session history (memory) + PDF/CSV export  

**Commits:**

```
feat(web): add scenario predict flow with same-origin API proxy

Re-validate inputs on the server and forward client IP so rate limits
apply per user without exposing the FastAPI origin to the browser.
```

---

## Phase 8 — Quality gates (tests, lint, CI)

**Goal:** Automated confidence before every merge.

**Do:**

- Backend: pytest, ruff, mypy  
- Frontend: vitest, eslint, `tsc`  
- `scripts/e2e_smoke.py` (Playwright)  
- `.github/workflows/ci.yml`  
- `dev.ps1` / `Makefile` targets: `test`, `lint`, `e2e`  

**Verify:**

```powershell
.\dev.ps1 test
.\dev.ps1 lint
```

**Commits:**

```
test: cover API contracts, geo validation, and model registry guards

Lock production refusals for synthetic artifacts and problem+json
shapes so regressions fail in CI before deploy.
```

```
test(web): add component and schema tests for risk UI

Keep map joins, band formatting, and Zod parsers honest as screens
evolve.
```

```
ci: run backend, frontend, e2e, and image builds on pull requests

Block merges when lint, types, unit tests, or the browser walkthrough
fail against a seeded stack.
```

---

## Phase 9 — Local DX (Windows-first)

**Goal:** One script to set up and run without Docker.

**Do:**

- `dev.ps1` — `setup`, `db`, `dev`, `api`, `web`, `test`, `lint`, `e2e`  
- Prefer `python` on PATH; skip `uvloop` on Windows in requirements  
- README “Run it” section for PowerShell  

**Commits:**

```
chore(windows): add PowerShell task runner for setup and local stack

Mirror Makefile targets so contributors can install, seed, and run API
plus web without Docker or Make.
```

```
fix(deps): mark uvloop optional on Windows

Avoid wheel build failures on Win32 while keeping uvloop for Linux
production images.
```

---

## Phase 10 — Production readiness (no Docker required)

**Goal:** Hardened config, fail-fast startup, native production runbook.

**Do:**

- `Settings` guards: refuse SQLite, `CORS=*`, synthetic geo/model when `ENV=production`  
- Require active non-synthetic model before serving  
- `backend/.env.production.example`, `frontend/.env.production.example`  
- `scripts/bootstrap_production.py` (migrate + load geographies only)  
- `dev.ps1` — `prod-env`, `prod-bootstrap`, `prod-api`, `prod-web`, `prod`  
- Optional: `docker-compose.prod.yml` for environments that use containers  
- README **Deploy (production) — no Docker required**  

**Verify (after real Postgres + real model):**

```powershell
.\dev.ps1 prod-env
# edit backend\.env → ENV=production, DATABASE_URL=postgresql+psycopg://...
# place backend\models\<version>\ artifacts (synthetic: false)
.\dev.ps1 prod-bootstrap
cd backend
.\.venv\Scripts\python.exe -m scripts.activate_model <version>
.\.venv\Scripts\python.exe -m scripts.import_observations path\to\observations.csv
.\.venv\Scripts\python.exe -m scripts.score_forecasts YYYY-MM
cd ..
.\dev.ps1 prod
# GET http://localhost:8000/readyz → model_loaded true, synthetic_geo false
```

**Commits:**

```
feat(config): refuse unsafe production database and CORS settings

Fail closed on SQLite and wildcard origins when ENV=production so
misconfigured deploys never reach users.
```

```
feat(ops): add native production bootstrap and Windows prod tasks

Migrate and load geographies without synthetic seeding, and start
uvicorn plus a Next production build without Docker.
```

```
docs: document phase-free production deploy on Windows and Linux

Describe model activation, observation import, and readiness checks
operators must pass before exposing the API.
```

```
chore(compose): add optional production Compose stack

Keep Docker as an opt-in path for teams that already run Postgres and
API/web images in an orchestrator.
```

---

## Phase 11 — Release commit

**Goal:** Tag a known-good baseline after CI is green and `/readyz` is honest.

**Do:**

- Confirm geo attribution footer is correct  
- Confirm probabilities are never labelled “confidence”  
- Tag: `v1.0.0`  

**Commit / tag:**

```
chore(release): mark v1.0.0 production baseline

Ship validated boundaries, model activation path, and native Windows
production runbook for operator-supplied Postgres and weights.
```

```bash
git tag -a v1.0.0 -m "v1.0.0 — production baseline"
```

---

## Suggested commit sequence (checklist)

Use this list when rebuilding or when turning an existing tree into a clean history (interactive rebase / orphan branch only if you intend to rewrite).

| # | Phase | Commit message (subject) |
|---|-------|--------------------------|
| 1 | Phase 0 | `chore: scaffold monorepo for food security risk map` |
| 2 | Phase 1.1 | `feat(backend): add FastAPI factory with config and structured logging` |
| 3 | Phase 1.2 | `feat(backend): add SQLAlchemy models and initial Alembic migration` |
| 4 | Phase 1.3 | `feat(api): expose liveness and readiness probes` |
| 5 | Phase 2.1 | `feat(geo): validate and serve South Sudan admin boundaries` |
| 6 | Phase 2.2 | `chore(geo): add synthetic county fixture for local development` |
| 7 | Phase 3.1 | `feat(ml): enforce model artifact contract and integrity checks` |
| 8 | Phase 3.2 | `feat(ml): add synthetic dev trainer and activate_model script` |
| 9 | Phase 4.1 | `feat(api): serve period forecasts and county risk profiles` |
| 10 | Phase 4.2 | `feat(api): add audited, rate-limited scenario predictions` |
| 11 | Phase 4.3 | `feat(scripts): import observations and score forecast periods` |
| 12 | Phase 5.1 | `feat(web): scaffold Next.js app with typed API client` |
| 13 | Phase 5.2 | `feat(web): add app shell with theme persistence and attribution footer` |
| 14 | Phase 6.1 | `feat(web): render interactive state risk choropleth` |
| 15 | Phase 6.2 | `feat(web): add forecasts, counties, model, and methodology screens` |
| 16 | Phase 7 | `feat(web): add scenario predict flow with same-origin API proxy` |
| 17 | Phase 8.1 | `test: cover API contracts, geo validation, and model registry guards` |
| 18 | Phase 8.2 | `test(web): add component and schema tests for risk UI` |
| 19 | Phase 8.3 | `ci: run backend, frontend, e2e, and image builds on pull requests` |
| 20 | Phase 9.1 | `chore(windows): add PowerShell task runner for setup and local stack` |
| 21 | Phase 9.2 | `fix(deps): mark uvloop optional on Windows` |
| 22 | Phase 10.1 | `feat(geo): build real OCHA-aligned boundaries with 79-county roster` |
| 23 | Phase 10.2 | `feat(config): refuse unsafe production database and CORS settings` |
| 24 | Phase 10.3 | `feat(ops): add native production bootstrap and Windows prod tasks` |
| 25 | Phase 10.4 | `docs: document phase-free production deploy on Windows and Linux` |
| 26 | Phase 11 | `chore(release): mark v1.0.0 production baseline` |

---

## Day-to-day after the build

| Task | Command |
|------|---------|
| Local demo (synthetic model OK) | `.\dev.ps1 setup` → `.\dev.ps1 db` → `.\dev.ps1 dev` |
| Production (your DB + model) | `.\dev.ps1 prod-env` → edit `.env` → model files → `.\dev.ps1 prod-bootstrap` → activate / import / score → `.\dev.ps1 prod` |
| Tests | `.\dev.ps1 test` · `.\dev.ps1 lint` |

Model folder contract (unchanged for the life of the app):

```text
backend/models/<version>/
  pipeline.joblib
  sensitivity.joblib
  validation.csv
  metadata.json          # synthetic: false in production
```

---

## Out of scope for v1.0 (track separately)

These are intentional non-goals of the current baseline; open follow-up issues rather than stuffing them into the release commit:

- End-user authentication / authorization  
- Content-Security-Policy tuned for the inline theme script (nonce or hash)  
- CDN and multi-replica rate limiting at the gateway  
- Official COD-AB pcode migration away from `DEV*` join keys (if you standardize on OCHA codes)  

Suggested follow-up commits when you take them on:

```
feat(auth): put predictions and admin scripts behind gateway identity
```

```
feat(security): add CSP with hashed theme bootstrap script
```

```
refactor(geo): align county pcodes with OCHA COD-AB identifiers
```

---

## Related docs

- [README.md](./README.md) — runbook, API table, plug-in model / boundaries  
- [backend/models/README.md](./backend/models/README.md) — artifact layout  
- [backend/.env.production.example](./backend/.env.production.example) — production env keys  
