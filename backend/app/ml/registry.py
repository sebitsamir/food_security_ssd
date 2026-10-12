"""Loads a trained pipeline from disk, verifying integrity and compatibility first.

joblib/pickle files can execute code when loaded. We therefore load only from a trusted
directory, only after checking the SHA-256 recorded in metadata.json, and only when the
scikit-learn version matches the one used for training.
"""

import csv
import hashlib
import json
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import joblib
import sklearn
from pydantic import BaseModel, Field, ValidationError

from app.ml.features import FEATURES

log = logging.getLogger(__name__)


class ModelError(RuntimeError):
    pass


class Artifact(BaseModel):
    file: str
    sha256: str = Field(min_length=64, max_length=64)


class ModelMetadata(BaseModel):
    name: str
    version: str
    algorithm: str
    parameters: dict[str, Any]
    sensitivity_parameters: dict[str, Any]
    metric: str
    validation_strategy: str
    synthetic: bool
    trained_at: str
    sklearn_version: str
    features: list[str]
    training_ranges: dict[str, tuple[float, float]]
    training_periods: int = Field(ge=1)
    training_counties: int = Field(ge=1)
    artifacts: dict[str, Artifact]


class FoldResult(BaseModel):
    fold: int
    test_period: str
    roc_auc: float = Field(ge=0, le=1)
    roc_auc_sensitivity: float = Field(ge=0, le=1)


@dataclass(frozen=True)
class LoadedModel:
    metadata: ModelMetadata
    pipeline: Any
    sensitivity: Any
    folds: list[FoldResult]


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _minor(version: str) -> str:
    return ".".join(version.split(".")[:2])


def load_model(models_dir: Path, version: str, *, allow_synthetic: bool) -> LoadedModel:
    root = (models_dir / version).resolve()
    if models_dir.resolve() not in root.parents:  # no path traversal via the version string
        raise ModelError(f"invalid model version: {version!r}")
    try:
        meta = ModelMetadata.model_validate_json((root / "metadata.json").read_bytes())
    except (OSError, ValidationError) as exc:
        raise ModelError(f"metadata.json missing or invalid for {version}: {exc}") from exc

    if meta.version != version:
        raise ModelError(f"metadata says {meta.version}, directory is {version}")
    if meta.synthetic and not allow_synthetic:
        raise ModelError("Refusing to load a synthetic development model in production.")
    if meta.features != FEATURES:
        raise ModelError("Model feature list differs from the application's feature contract.")
    if _minor(meta.sklearn_version) != _minor(sklearn.__version__):
        raise ModelError(
            f"Model was trained with scikit-learn {meta.sklearn_version}; "
            f"runtime has {sklearn.__version__}. Retrain or pin the runtime."
        )

    loaded: dict[str, Any] = {}
    for key in ("pipeline", "sensitivity"):
        art = meta.artifacts.get(key)
        if art is None:
            raise ModelError(f"metadata has no '{key}' artifact")
        path = root / art.file
        if not path.is_file() or sha256_file(path) != art.sha256:
            raise ModelError(f"{art.file}: missing or checksum mismatch. Refusing to load.")
        loaded[key] = joblib.load(path)

    try:
        with (root / "validation.csv").open(newline="", encoding="utf-8") as f:
            folds = [FoldResult.model_validate(row) for row in csv.DictReader(f)]
    except (OSError, ValidationError) as exc:
        raise ModelError(f"validation.csv missing or invalid: {exc}") from exc
    if not folds:
        raise ModelError("validation.csv has no folds")

    log.info("model %s loaded (%s, synthetic=%s)", version, meta.algorithm, meta.synthetic)
    return LoadedModel(
        metadata=meta, pipeline=loaded["pipeline"], sensitivity=loaded["sensitivity"], folds=folds
    )


def write_metadata(root: Path, meta: dict[str, Any]) -> None:
    (root / "metadata.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
