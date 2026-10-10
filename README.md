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
