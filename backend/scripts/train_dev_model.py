"""Trains the SYNTHETIC development model so the whole product runs end to end.

This is the reference for the artifact layout your real training job must produce:

    models/<version>/pipeline.joblib      production pipeline (C = 1.0)
    models/<version>/sensitivity.joblib   robustness pipeline (C = 100)
    models/<version>/metadata.json        name, version, params, ranges, sha256 of each artifact
    models/<version>/validation.csv       fold,test_period,roc_auc,roc_auc_sensitivity

Usage: python -m scripts.train_dev_model
"""

import csv
import json
from collections.abc import Sequence
from datetime import UTC, datetime
from pathlib import Path

import joblib
import numpy as np
import sklearn
from sklearn.compose import ColumnTransformer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

from app.ml.dev_data import DEV_VERSION, TRAIN_PERIODS, generate, obs_to_row
from app.ml.features import CATEGORICAL, FEATURES, NUMERIC, build_frame
from app.ml.registry import sha256_file


def make_pipeline(c: float) -> Pipeline:
    pre = ColumnTransformer([
        ("cat", OneHotEncoder(handle_unknown="ignore"), CATEGORICAL),
        ("num", StandardScaler(), NUMERIC),
    ])  # fmt: skip
    clf = LogisticRegression(C=c, class_weight="balanced", max_iter=2000)
    return Pipeline([("pre", pre), ("clf", clf)])


def train(
    models_dir: Path, counties: Sequence[tuple[str, str]], version: str = DEV_VERSION
) -> Path:
    obs = [o for o in generate(counties) if o.label is not None]
    frame = build_frame(obs_to_row(o) for o in obs)
    y = np.array([o.label for o in obs])
    period = np.array([o.period for o in obs])

    folds: list[tuple[int, str, float, float]] = []
    for k in range(3, len(TRAIN_PERIODS)):  # expanding window: train on the past, test on the next
        tr, te = np.isin(period, TRAIN_PERIODS[:k]), period == TRAIN_PERIODS[k]
        if len(set(y[tr])) < 2 or len(set(y[te])) < 2:
            continue  # AUC is undefined without both classes
        aucs = []
        for c in (1.0, 100.0):
            model = make_pipeline(c).fit(frame[tr], y[tr])
            aucs.append(float(roc_auc_score(y[te], model.predict_proba(frame[te])[:, 1])))
        folds.append((len(folds) + 1, TRAIN_PERIODS[k], aucs[0], aucs[1]))
    if not folds:
        raise RuntimeError("no valid validation folds; dataset too small")

    root = models_dir / version
    root.mkdir(parents=True, exist_ok=True)
    joblib.dump(make_pipeline(1.0).fit(frame, y), root / "pipeline.joblib")
    joblib.dump(make_pipeline(100.0).fit(frame, y), root / "sensitivity.joblib")

    with (root / "validation.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["fold", "test_period", "roc_auc", "roc_auc_sensitivity"])
        w.writerows([(n, p, round(a, 4), round(b, 4)) for n, p, a, b in folds])

    pops = frame["population"].astype(float)
    years = frame["start_year"].astype(float)
    meta = {
        "name": "South Sudan Food Security Risk Model",
        "version": version,
        "algorithm": "LogisticRegression",
        "parameters": {"C": 1.0, "class_weight": "balanced"},
        "sensitivity_parameters": {"C": 100.0},
        "metric": "roc_auc",
        "validation_strategy": "expanding_window",
        "synthetic": True,
        "trained_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "sklearn_version": sklearn.__version__,
        "features": FEATURES,
        "training_periods": len(TRAIN_PERIODS),
        "training_counties": len({o.county for o in obs}),
        "training_ranges": {
            "population": [float(pops.min()), float(pops.max())],
            "start_year": [float(years.min()), float(years.max())],
        },
        "artifacts": {
            "pipeline": {
                "file": "pipeline.joblib",
                "sha256": sha256_file(root / "pipeline.joblib"),
            },
            "sensitivity": {
                "file": "sensitivity.joblib",
                "sha256": sha256_file(root / "sensitivity.joblib"),
            },  # fmt: skip
        },
    }
    (root / "metadata.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    return root


def counties_from_geojson(path: Path) -> list[tuple[str, str]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    return [(f["properties"]["pcode"], f["properties"]["parent"]) for f in data["features"]]


if __name__ == "__main__":
    from app.core.config import get_settings

    s = get_settings()
    if s.is_production:
        raise SystemExit("Refusing to train the synthetic dev model in production.")
    out = train(s.models_dir, counties_from_geojson(s.geo_dir / "counties.geojson"))
    print(f"trained {out}")
