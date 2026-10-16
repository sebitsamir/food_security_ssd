# South Sudan Food Security Intelligence

County-level modeled risk of Crisis-or-worse food insecurity. Next.js 15 + TypeScript + Tailwind v4
on the front, FastAPI + PostgreSQL + scikit-learn behind it.

```
 boundaries (OCHA/HDX)        your inputs (CSV)            your trained pipeline
        |                            |                              |
 scripts/build_geo.sh     import_observations.py          models/<version>/...
        |                            |                              |
 backend/data/geo/*.geojson     observations table   <-- activate_model.py (verifies, then flips active)
        |   validated at startup      |                              |
        |                             +------ score_forecasts.py ----+--> forecasts table
        |                                                            |
        +---------------------------- FastAPI ----------------------+
              /geo  /forecasts  /counties  /model  POST /predictions (rate limited, audited)
                                     |
                      Next.js server components (zod-validated, cached)
                      + same-origin proxy  /api/predict
                                     |
        Overview | Predict | Forecasts | Counties | Model | Methodology
```

## Run it

You need **Python 3.12** (3.11 works) and **Node.js 22 LTS** (20+ works). Nothing else: local development uses
a SQLite file, so no database server and no Docker are required.

### Windows (PowerShell)

Open PowerShell in the project folder (the one containing `dev.ps1`):

```powershell
# If PowerShell says "running scripts is disabled", allow it for this window only:
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass

.\dev.ps1 setup    # Python venv + packages, Node packages, backend\.env   (a few minutes)
.\dev.ps1 db       # create tables, load boundaries, train the SYNTHETIC dev model, seed sample data
.\dev.ps1 dev      # opens two windows: API on :8000, website on :3000
```

Then open http://localhost:3000. Other tasks: `.\dev.ps1 test`, `lint`, `api`, `web`, `e2e`.

If you would rather type the commands yourself, this is exactly what `dev.ps1` does
(run the first block once, then the other two in separate windows):

```powershell
cd backend
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
Copy-Item .env.example .env
.\.venv\Scripts\python.exe -m alembic upgrade head
.\.venv\Scripts\python.exe -m scripts.load_geographies
.\.venv\Scripts\python.exe -m scripts.seed_dev
```
```powershell
# window 1: API
cd backend
.\.venv\Scripts\python.exe -m uvicorn app.main:create_app --factory --reload --port 8000
```
```powershell
# window 2: website
cd frontend
npm ci
npm run dev
```

Use `;` (not `&&`) to chain commands in Windows PowerShell 5.1. Windows PowerShell 7+ accepts `&&`.
Real boundaries on Windows: `.\scripts\build_geo.ps1` (see "Plug in real boundaries").

### macOS / Linux / WSL

```bash
make setup      # venv + npm ci
make db         # migrate, load geographies, train the SYNTHETIC dev model, seed sample data
make api        # http://localhost:8000/docs
make web        # http://localhost:3000
# or all of it in Docker:  make up
```

Out of the box it runs on **synthetic** boundaries and a **synthetic** model so every screen works
immediately. Both are labelled in the UI, and the API refuses to start with either when
`ENV=production`.

## What each screen does

| Screen | Features |
|---|---|
| Overview | Hero with the live state map, state summary card (top counties, link to its forecasts), dataset and validation strip, states ranked by risk, validation chart, period picker |
| Predict | County-prefilled form, instant validation, animated gauge, model comparison (C = 1.0 vs C = 100), input warnings, per-run PDF/CSV export, session history with batch export |
| Forecasts | Search, state filter, band chips, sortable columns, pagination, table/map toggle, PDF/CSV export of exactly the filtered rows. All filter state lives in the URL, so views are shareable |
| Counties | Searchable list and a profile per county at its own URL (`/counties/<pcode>`): risk, rank, scale, inputs, interactive history chart, state peers, "Open in Predict". Phones get list and detail as separate screens |
| Model | Validation summary, ROC-AUC by fold chart and table, sensitivity comparison |
| Methodology | Accordion of the method, from data to limitations |

Everywhere: light/dark theme (no flash), keyboard and screen-reader support, responsive from 320px to
wide monitors.

## Plug in your model

Your training job must produce this folder, and nothing else in the app needs to change:

```
backend/models/<version>/
  pipeline.joblib        scikit-learn Pipeline (preprocessing + classifier), production setting
  sensitivity.joblib     the same pipeline with C = 100 (robustness check)
  validation.csv         fold,test_period,roc_auc,roc_auc_sensitivity
  metadata.json          see backend/scripts/train_dev_model.py for a complete example
```

Rules the loader enforces (`backend/app/ml/registry.py`):

- **Feature contract.** The pipeline receives a DataFrame with exactly the columns in
  `app/ml/features.py` (`state, county, prior_period_ipc_phase, population, start_year, start_month,
  prior_period_phase3plus_pct, prior_year_cereal_production_tonnes, prior_year_cereal_gap_tonnes,
  prior_ipc_severity`). `metadata.json` must list the same names.
- **Integrity.** `metadata.json` carries the SHA-256 of each `.joblib` file. A mismatch refuses to load.
  (Pickles can execute code; only ever load files you produced.)
- **Compatibility.** The scikit-learn major.minor version must match the one used to train.
- **Honesty.** `synthetic` must be `false` for production. Include `training_ranges`
  (population, start_year) so out-of-range inputs raise warnings.

Then:

```bash
python -m scripts.import_observations data/observations.csv   # inputs per county and period
python -m scripts.activate_model 1.0.0                         # verifies, registers, makes it the only active model
python -m scripts.score_forecasts 2026-10                      # writes forecasts for that period
# restart/redeploy the API so it loads the new model
```

`import_observations` rejects the whole file on any bad row and tells you which line.
`activate_model` loads the model exactly as the API will before touching the database.

## Plug in real boundaries

1. Download the admin-2 (county) boundaries for South Sudan from the Humanitarian Data Exchange (OCHA).
   Read the dataset page for its licence and attribution wording.
2. Inspect field names: `npx mapshaper path/to/admin2.shp -info`
3. Build (provenance values are required on purpose).
   Windows: `.\scripts\build_geo.ps1 -Path C:\data\admin2.shp -GeoSource "..." -Attribution "..." -License "..."`
   (add `-Pcode2 ... -Name2 ... -Pcode1 ... -Name1 ...` if your field names differ). macOS/Linux:
   ```bash
   GEO_SOURCE="OCHA COD-AB South Sudan, <release>" GEO_ATTRIBUTION="Boundaries: OCHA via HDX" \
   GEO_LICENSE="<licence>" PCODE2=ADM2_PCODE NAME2=ADM2_EN PCODE1=ADM1_PCODE NAME1=ADM1_EN \
   ./scripts/build_geo.sh path/to/admin2.shp
   ```
   Check the "intersections could not be repaired" line. If non-zero on real data, lower `SIMPLIFY`.
4. `cd backend && python -m scripts.load_geographies` (syncs the DB from the same files).

Startup fails on duplicate or orphaned codes, coordinates outside South Sudan, unclosed rings, or
counties without a parent. Winding order is normalised on both sides (d3 draws the "wrong" winding
as inverted shapes), and tested.

## API

| Endpoint | Notes |
|---|---|
| `GET /api/v1/geo/{states\|counties}` | GeoJSON, strong `ETag`, `304`, cache headers |
| `GET /api/v1/geo/meta` | source, attribution, licence, `synthetic` |
| `GET /api/v1/forecasts/periods` | periods of the active model, latest first |
| `GET /api/v1/forecasts/{states\|counties}?period=` | `{pcode, probability}`; state = mean of its counties |
| `GET /api/v1/counties?period=` | all counties ranked, with latest inputs |
| `GET /api/v1/counties/{pcode}?period=` | one county, state rank, last 10 periods of history |
| `GET /api/v1/model` | metadata, folds, summary statistics |
| `POST /api/v1/predictions` | scenario scoring; 30 requests/min per client, audited, `Retry-After` on 429 |
| `GET /healthz`, `/readyz` | liveness / readiness (DB reachable and migrated, model loaded) |

Errors are `application/problem+json` carrying a `request_id` that matches the server log line.

## Deploy (production) — no Docker required

Production refuses SQLite, synthetic boundaries, and synthetic models. Boundaries in this repo are already non-synthetic. You supply **PostgreSQL** (any install you can reach) and the **real model**. Docker is optional and not needed on Windows.

### Windows (PowerShell)

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass

# One-time: venv + npm (skip if you already ran setup)
.\dev.ps1 setup

# 1) Production env file — then edit backend\.env:
#    ENV=production
#    DATABASE_URL=postgresql+psycopg://USER:PASSWORD@localhost:5432/risk
#    CORS_ORIGINS=http://localhost:3000   (or your real site origin)
.\dev.ps1 prod-env

# 2) Put the model here:  backend\models\<version>\
#      pipeline.joblib  sensitivity.joblib  validation.csv  metadata.json
#    (synthetic must be false — see "Plug in your model")

# 3) Migrate Postgres + load boundaries (no synthetic seed)
.\dev.ps1 prod-bootstrap

# 4) Activate model, import inputs, score (from backend\)
cd backend
.\.venv\Scripts\python.exe -m scripts.activate_model 1.0.0
.\.venv\Scripts\python.exe -m scripts.import_observations path\to\observations.csv
.\.venv\Scripts\python.exe -m scripts.score_forecasts 2026-10
cd ..

# 5) Run API + website (two windows)
.\dev.ps1 prod
```

Verify: http://localhost:8000/readyz → `model_loaded: true`, `synthetic_geo: false`.  
Website: http://localhost:3000. Docs (`/docs`) stay off when `ENV=production`.

County `pcode` values in your observations CSV must match `backend/data/geo/counties.geojson` (currently `DEV01`… style codes from the real-boundary build).

### Linux / macOS (same idea, no Docker)

```bash
cp backend/.env.production.example backend/.env   # edit DATABASE_URL, CORS_ORIGINS
# place model under backend/models/<version>/
cd backend && .venv/bin/python -m scripts.bootstrap_production
.venv/bin/python -m scripts.activate_model 1.0.0
.venv/bin/python -m scripts.import_observations path/to/observations.csv
.venv/bin/python -m scripts.score_forecasts 2026-10
.venv/bin/uvicorn app.main:create_app --factory --host 0.0.0.0 --port 8000 --proxy-headers
# other terminal:
cd frontend && npm run build && npm start
```

### Optional: Docker

Only if you use Docker elsewhere: `docker-compose.prod.yml` and `make up-prod`. Not required for local or Windows deploys.

## Operating it

- **Config:** `backend/.env.example` (dev), `backend/.env.production.example` (prod), `frontend/.env.example`. `API_URL` is server-side only and is never sent to the browser.
- **Migrations** run as a separate step (`alembic upgrade head` / `bootstrap_production`), not at app start.
- **Behind a load balancer** set `FORWARDED_ALLOW_IPS` to its address so per-user rate limits see real client IPs. The in-process limiter protects a single instance; enforce the real limit at your gateway for multiple replicas.
- **Logs** are JSON, one line per request with a request id. Security headers are set by both servers; docs are disabled in production.
- **Containers** (optional) run as non-root with health checks. Model artifacts live on disk under `backend/models/` (or `MODELS_DIR`).

## Verification

| Check | Result when this was built |
|---|---|
| Backend | 106 tests, ruff, ruff format, strict mypy |
| Frontend | 118 tests, eslint, strict TypeScript, production `next build` |
| Browser walkthrough (`scripts/e2e_smoke.py`) | 89 checks against the running stack: every screen and feature, real PDF/CSV downloads, no console errors, no horizontal overflow at 8 widths from 320 to 1920px, theme persistence, phone list/detail flow |

Run them: `make test lint`, then with the stack running, `make e2e`.

## Known limits (read before launch)

- **Not verified on Windows:** everything was built and tested on Linux. `dev.ps1` and `build_geo.ps1` were reviewed carefully but never run on a Windows machine. If a step fails, the manual commands above are the fallback, and the Python and Node code itself avoids OS-specific behaviour (UTF-8 is explicit everywhere, BOM-prefixed files load).
- **Not verified here:** Docker builds, the GitHub Actions workflow, and PostgreSQL itself (all tests and the browser run used SQLite). SQLAlchemy and Alembic are portable and the migrations use standard types, but run `make up` and the CI once before relying on them.
- **Authentication, a CDN and a Content-Security-Policy are not included.** Add a CSP once you decide how to handle the inline theme script (nonce or hash). Put the API behind your gateway.
- **Boundaries are sensitive and some are disputed.** Keep the attribution footer and consider a visible "boundaries are indicative" note.
- A streamed Next.js error screen returns HTTP 200. Monitor the API directly and add a synthetic check for the page.
- Probabilities are not validated as calibrated. The UI calls them probabilities, never confidence, and says so everywhere. Keep it that way.
- Session history on Predict lives in memory and clears on refresh; the server-side audit table records every prediction.
