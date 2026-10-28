# South Sudan Food Security Risk Model — 1.0.0

## Model artifacts
- `pipeline.joblib`: primary balanced Logistic Regression (`C=1.0`).
- `sensitivity.joblib`: sensitivity analysis model (`C=100.0`).
- `validation.csv`: last 12 chronological temporal folds.
- `metadata.json`: feature contract, training provenance, runtime compatibility, SHA-256 integrity checks.
- `official_test_predictions.csv`: probabilities for official competition test rows only; these are not official IPC classifications.

## Training record
- Dataset: official IndabaX South Sudan 2026 `Train__4_.csv`.
- Training rows: 3,099
- Unique county names: 79
- Historical assessment periods: 39
- scikit-learn: 1.8.0
- Validation strategy: expanding-window temporal validation on the final 12 distinct assessment periods.
- Mean primary ROC-AUC: 0.988438
- Worst primary fold ROC-AUC: 0.969643
- Latest primary fold ROC-AUC: 0.993243
- Mean sensitivity ROC-AUC: 0.987561

## Important
The model estimates the target as defined by the competition. Its output is a model probability, not an official IPC phase, humanitarian assessment, or calibrated probability. Keep it labelled as a model estimate. The production application must pass state and county **names** to match the categorical values seen during training, while using boundary pcodes only for geographic joins.
