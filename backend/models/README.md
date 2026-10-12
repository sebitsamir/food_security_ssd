# Model artifacts (production)

Put a versioned folder here (this path is `MODELS_DIR` in development; Docker mounts it at `/models`):

```
<version>/
  pipeline.joblib
  sensitivity.joblib
  validation.csv
  metadata.json          # synthetic must be false; include SHA-256 hashes
```

Then from `backend/`:

```bash
python -m scripts.activate_model <version>
python -m scripts.import_observations path/to/observations.csv
python -m scripts.score_forecasts YYYY-MM
```

Do not commit trained weights.
