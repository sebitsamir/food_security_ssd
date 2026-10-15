import json
import shutil
from pathlib import Path

import pytest

from app.core.ratelimit import RateLimiter
from app.domain.risk import band_for
from app.ml.dev_data import DEV_VERSION
from app.ml.registry import ModelError, load_model


@pytest.fixture
def mdir(models_dir: Path, tmp_path: Path) -> Path:
    shutil.copytree(models_dir, tmp_path / "m")
    return tmp_path / "m"


def edit_meta(d: Path, **kw: object) -> None:
    p = d / DEV_VERSION / "metadata.json"
    data = json.loads(p.read_text())
    data.update(kw)
    p.write_text(json.dumps(data))


def test_loads(mdir: Path) -> None:
    m = load_model(mdir, DEV_VERSION, allow_synthetic=True)
    assert m.metadata.version == DEV_VERSION and len(m.folds) == 9


def test_synthetic_model_refused_in_production(mdir: Path) -> None:
    with pytest.raises(ModelError, match="synthetic"):
        load_model(mdir, DEV_VERSION, allow_synthetic=False)


def test_tampered_artifact_is_refused(mdir: Path) -> None:
    with (mdir / DEV_VERSION / "pipeline.joblib").open("ab") as f:
        f.write(b"x")
    with pytest.raises(ModelError, match="checksum"):
        load_model(mdir, DEV_VERSION, allow_synthetic=True)


def test_sklearn_version_mismatch_is_refused(mdir: Path) -> None:
    edit_meta(mdir, sklearn_version="0.1.0")
    with pytest.raises(ModelError, match="scikit-learn"):
        load_model(mdir, DEV_VERSION, allow_synthetic=True)


def test_feature_contract_mismatch_is_refused(mdir: Path) -> None:
    edit_meta(mdir, features=["only_one"])
    with pytest.raises(ModelError, match="feature"):
        load_model(mdir, DEV_VERSION, allow_synthetic=True)


@pytest.mark.parametrize("version", ["../x", "../../etc", "/etc/passwd", ".."])
def test_version_cannot_escape_models_dir(mdir: Path, version: str) -> None:
    with pytest.raises(ModelError):
        load_model(mdir, version, allow_synthetic=True)


def test_missing_model_is_a_clean_error(tmp_path: Path) -> None:
    with pytest.raises(ModelError):
        load_model(tmp_path, "9.9.9", allow_synthetic=True)


@pytest.mark.parametrize(("p", "band"), [
    (0, "lower"), (0.1999, "lower"), (0.2, "moderate"), (0.4999, "moderate"),
    (0.5, "elevated"), (0.7999, "elevated"), (0.8, "high"), (1.0, "high"),
])  # fmt: skip
def test_band_edges(p: float, band: str) -> None:
    assert band_for(p) == band


@pytest.mark.parametrize("p", [-0.01, 1.01, float("nan")])
def test_band_rejects_non_probabilities(p: float) -> None:
    with pytest.raises(ValueError):
        band_for(p)


def test_rate_limiter_window() -> None:
    now = [0.0]
    lim = RateLimiter(2, 10, clock=lambda: now[0])
    assert lim.hit("a") == (True, 0.0) and lim.hit("a")[0] and not lim.hit("a")[0]
    assert lim.hit("b")[0]  # keys are independent
    now[0] = 10.5
    assert lim.hit("a")[0]  # window slid
