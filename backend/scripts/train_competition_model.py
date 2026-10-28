"""Train and export the real IndabaX competition model.

Run from backend/:
  python -m scripts.train_competition_model --train-csv ../data/Train__4_.csv \
      --test-csv ../data/Test__1_.csv --output-dir models/1.0.0

Only official competition data is used. This script never trains on synthetic data.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
import sklearn
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

from app.ml.features import CATEGORICAL, FEATURES, NUMERIC, PHASE_NAMES

TARGET = "food_insecurity_risk"
ID_COLUMN = "ID"
PHASE_TO_SEVERITY = {name: number for number, name in PHASE_NAMES.items()}
REQUIRED_RAW = {
    "ID",
    "state",
    "county",
    "population",
    "start_year",
    "start_month",
    "prior_period_ipc_phase",
    "prior_period_phase3plus_pct",
    "prior_year_cereal_production_tonnes",
    "prior_year_cereal_gap_tonnes",
}


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def prepare_frame(data: pd.DataFrame) -> pd.DataFrame:
    missing = sorted(REQUIRED_RAW - set(data.columns))
    if missing:
        raise ValueError(f"Input data is missing required columns: {', '.join(missing)}")
    unknown = sorted(set(data["prior_period_ipc_phase"].dropna()) - set(PHASE_TO_SEVERITY))
    if unknown:
        raise ValueError(f"Unknown prior_period_ipc_phase values: {unknown}")
    frame = data.copy()
    frame["prior_ipc_severity"] = frame["prior_period_ipc_phase"].map(PHASE_TO_SEVERITY)
    return frame.loc[:, FEATURES]


def make_pipeline(c_value: float) -> Pipeline:
    numeric_pipeline = Pipeline(
        [
            ("imputer", SimpleImputer(strategy="median")),
            ("scaler", StandardScaler()),
        ]
    )
    categorical_pipeline = Pipeline(
        [
            ("imputer", SimpleImputer(strategy="most_frequent")),
            ("onehot", OneHotEncoder(handle_unknown="ignore")),
        ]
    )
    preprocessing = ColumnTransformer(
        [
            ("numeric", numeric_pipeline, NUMERIC),
            ("categorical", categorical_pipeline, CATEGORICAL),
        ]
    )
    classifier = LogisticRegression(
        C=c_value,
        class_weight="balanced",
        max_iter=5000,
        solver="liblinear",
        random_state=42,
    )
    return Pipeline([("preprocessing", preprocessing), ("classifier", classifier)])


def temporal_validation(
    raw: pd.DataFrame, frame: pd.DataFrame, validation_periods: int
) -> pd.DataFrame:
    periods = (
        raw[["start_year", "start_month"]]
        .drop_duplicates()
        .sort_values(["start_year", "start_month"])
        .itertuples(index=False, name=None)
    )
    all_periods = [(int(year), int(month)) for year, month in periods]
    rows: list[dict[str, Any]] = []
    for year, month in all_periods[-validation_periods:]:
        train_mask = (raw["start_year"] < year) | (
            (raw["start_year"] == year) & (raw["start_month"] < month)
        )
        valid_mask = (raw["start_year"] == year) & (raw["start_month"] == month)
        y_train = raw.loc[train_mask, TARGET]
        y_valid = raw.loc[valid_mask, TARGET]
        if y_train.nunique() < 2 or y_valid.nunique() < 2:
            continue
        scores: dict[float, float] = {}
        for c_value in (1.0, 100.0):
            model = make_pipeline(c_value).fit(frame.loc[train_mask], y_train)
            probabilities = model.predict_proba(frame.loc[valid_mask])[:, 1]
            scores[c_value] = float(roc_auc_score(y_valid, probabilities))
        rows.append(
            {
                "fold": len(rows) + 1,
                "test_period": f"{year}-{month:02d}",
                "roc_auc": scores[1.0],
                "roc_auc_sensitivity": scores[100.0],
            }
        )
    if not rows:
        raise ValueError("No valid temporal folds; check the training periods and target labels.")
    return pd.DataFrame(rows)


def export_model(
    train_path: Path,
    output_dir: Path,
    test_path: Path | None = None,
    validation_periods: int = 12,
    version: str = "1.0.0",
) -> Path:
    raw = pd.read_csv(train_path)
    if TARGET not in raw.columns:
        raise ValueError(f"Training CSV must include target column {TARGET!r}")
    if raw[ID_COLUMN].isna().any() or raw[ID_COLUMN].duplicated().any():
        raise ValueError("Training IDs must be present and unique.")
    if not raw[TARGET].isin([0, 1]).all() or raw[TARGET].nunique() != 2:
        raise ValueError("Target must contain both binary classes 0 and 1.")
    frame = prepare_frame(raw)
    validation = temporal_validation(raw, frame, validation_periods)

    output_dir.mkdir(parents=True, exist_ok=True)
    primary = make_pipeline(1.0).fit(frame, raw[TARGET])
    sensitivity = make_pipeline(100.0).fit(frame, raw[TARGET])
    joblib.dump(primary, output_dir / "pipeline.joblib", compress=3)
    joblib.dump(sensitivity, output_dir / "sensitivity.joblib", compress=3)
    validation.to_csv(
        output_dir / "validation.csv",
        index=False,
        float_format="%.8f",
        lineterminator="\n",
    )

    metadata = {
        "name": "South Sudan Food Security Risk Model",
        "version": version,
        "algorithm": "LogisticRegression",
        "parameters": {
            "C": 1.0,
            "class_weight": "balanced",
            "max_iter": 5000,
            "solver": "liblinear",
            "random_state": 42,
        },
        "sensitivity_parameters": {
            "C": 100.0,
            "class_weight": "balanced",
            "max_iter": 5000,
            "solver": "liblinear",
            "random_state": 42,
        },
        "metric": "roc_auc",
        "validation_strategy": (
            f"expanding_window_temporal_validation_last_{validation_periods}_periods"
        ),
        "synthetic": False,
        "trained_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "sklearn_version": sklearn.__version__,
        "features": FEATURES,
        "training_periods": int(raw[["start_year", "start_month"]].drop_duplicates().shape[0]),
        "training_counties": int(raw["county"].nunique()),
        "training_rows": int(len(raw)),
        "training_ranges": {
            "population": [
                float(raw["population"].min()),
                float(raw["population"].max()),
            ],
            "start_year": [
                float(raw["start_year"].min()),
                float(raw["start_year"].max()),
            ],
        },
        "data_source": "Official IndabaX South Sudan 2026 competition training data",
        "target": TARGET,
        "target_definition": "1 = IPC Phase 3+ (Crisis-or-worse); 0 = below Crisis",
        "limitations": [
            "Model output is not an official IPC classification.",
            "Probability calibration has not been established.",
            "Only official competition features were used; no external data or AutoML.",
        ],
        "artifacts": {
            "pipeline": {
                "file": "pipeline.joblib",
                "sha256": sha256_file(output_dir / "pipeline.joblib"),
            },
            "sensitivity": {
                "file": "sensitivity.joblib",
                "sha256": sha256_file(output_dir / "sensitivity.joblib"),
            },
        },
    }
    (output_dir / "metadata.json").write_text(
        json.dumps(metadata, indent=2) + "\n", encoding="utf-8"
    )

    if test_path is not None:
        test = pd.read_csv(test_path)
        if ID_COLUMN not in test.columns or test[ID_COLUMN].isna().any():
            raise ValueError("Test CSV must contain non-empty IDs.")
        test_frame = prepare_frame(test)
        if test[ID_COLUMN].duplicated().any():
            raise ValueError("Test IDs must be unique.")
        primary_prob = primary.predict_proba(test_frame)[:, 1]
        sensitivity_prob = sensitivity.predict_proba(test_frame)[:, 1]
        predictions = test[[ID_COLUMN, "state", "county", "start_year", "start_month"]].copy()
        predictions["risk_probability"] = primary_prob
        predictions["sensitivity_probability"] = sensitivity_prob
        predictions["model_spread"] = np.abs(primary_prob - sensitivity_prob)
        predictions.to_csv(
            output_dir / "official_test_predictions.csv",
            index=False,
            float_format="%.8f",
            lineterminator="\n",
        )

    return output_dir


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--train-csv", type=Path, required=True)
    parser.add_argument("--test-csv", type=Path)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--validation-periods", type=int, default=12)
    parser.add_argument("--version", default="1.0.0")
    args = parser.parse_args()
    if args.validation_periods < 1:
        parser.error("--validation-periods must be positive")
    output = export_model(
        args.train_csv,
        args.output_dir,
        args.test_csv,
        args.validation_periods,
        args.version,
    )
    validation = pd.read_csv(output / "validation.csv")
    print(f"Exported production model to {output.resolve()}")
    print(f"scikit-learn: {sklearn.__version__}")
    print(f"Training temporal folds: {len(validation)}")
    print(f"Mean ROC-AUC: {validation['roc_auc'].mean():.6f}")
    print(f"Worst-fold ROC-AUC: {validation['roc_auc'].min():.6f}")
    print(f"Latest-fold ROC-AUC: {validation['roc_auc'].iloc[-1]:.6f}")
    print(
        "Before activation, verify the model's scikit-learn version matches "
        "backend/requirements.txt."
    )


if __name__ == "__main__":
    main()
