import csv
from pathlib import Path

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.db.models import Forecast, ModelVersion, Observation
from app.db.session import make_engine
from app.ml.registry import ModelError
from scripts import activate_model, import_observations, load_geographies, score_forecasts
from tests.conftest import DEV_GEO, make_settings

COLS = import_observations.COLUMNS


@pytest.fixture
def db(models_dir: Path):  # type: ignore[no-untyped-def]
    engine = make_engine("sqlite+pysqlite://")
    Base.metadata.create_all(engine)
    settings = make_settings(geo_dir=DEV_GEO, models_dir=models_dir)
    with sessionmaker(engine)() as s:
        load_geographies.sync(s, settings)
        yield s, settings


def write_csv(path: Path, rows: list[list[object]], header: list[str] = COLS) -> Path:
    with path.open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow(header)
        w.writerows(rows)
    return path


GOOD = ["DEV0301", "2026-10", 300000, 3, 55, 12000, -20000]


def test_import_inserts_then_updates(db, tmp_path: Path) -> None:  # type: ignore[no-untyped-def]
    s, _ = db
    p = write_csv(tmp_path / "o.csv", [GOOD, ["DEV0302", "2026-10", 1000, 1, 5, 0, 0]])
    assert import_observations.import_csv(s, p) == {"inserted": 2, "updated": 0}
    p = write_csv(tmp_path / "o2.csv", [[*GOOD[:2], 999, *GOOD[3:]]])
    assert import_observations.import_csv(s, p) == {"inserted": 0, "updated": 1}
    assert (
        s.scalar(select(Observation.population).where(Observation.county_pcode == "DEV0301")) == 999
    )


@pytest.mark.parametrize(("row", "message"), [
    ([*GOOD[:3], 9, *GOOD[4:]], "line 3: prior_ipc_phase"),
    ([*GOOD[:4], 101, *GOOD[5:]], "phase3plus_pct"),
    (["NOPE", *GOOD[1:]], "unknown counties: NOPE"),
    ([GOOD[0], "2026-13", *GOOD[2:]], "period"),
    ([*GOOD[:2], "many", *GOOD[3:]], "population"),
])  # fmt: skip
def test_bad_rows_abort_the_whole_import(db, tmp_path: Path, row, message) -> None:  # type: ignore[no-untyped-def]
    s, _ = db
    p = write_csv(tmp_path / "o.csv", [["DEV0302", "2026-10", 1000, 1, 5, 0, 0], row])
    with pytest.raises(import_observations.ImportError_, match=message):
        import_observations.import_csv(s, p)
    assert s.scalar(select(func.count()).select_from(Observation)) == 0  # nothing written


def test_missing_columns_and_duplicates_are_rejected(db, tmp_path: Path) -> None:  # type: ignore[no-untyped-def]
    s, _ = db
    with pytest.raises(import_observations.ImportError_, match="missing columns"):
        import_observations.import_csv(
            s, write_csv(tmp_path / "a.csv", [[1]], header=["county_pcode"])
        )
    with pytest.raises(import_observations.ImportError_, match="duplicate"):
        import_observations.import_csv(s, write_csv(tmp_path / "b.csv", [GOOD, GOOD]))


def test_activate_then_score_end_to_end(db, tmp_path: Path) -> None:  # type: ignore[no-untyped-def]
    s, settings = db
    import_observations.import_csv(
        s, write_csv(tmp_path / "o.csv", [GOOD, ["DEV0302", "2026-10", 90000, 4, 80, 5000, -30000]])
    )
    meta = activate_model.activate(s, settings, "1.0.0-dev")
    assert meta.version == "1.0.0-dev"
    assert (
        s.scalar(select(ModelVersion.is_active).where(ModelVersion.version == "1.0.0-dev")) is True
    )

    assert score_forecasts.score(s, settings, "2026-10") == 2
    assert score_forecasts.score(s, settings, "2026-10") == 0  # idempotent
    probs = dict(s.execute(select(Forecast.county_pcode, Forecast.risk_probability)).all())
    assert set(probs) == {"DEV0301", "DEV0302"} and probs["DEV0302"] > probs["DEV0301"]
    assert score_forecasts.score(s, settings, "2026-10", replace=True) == 2


def test_only_one_model_is_ever_active(db) -> None:  # type: ignore[no-untyped-def]
    s, settings = db
    s.add(ModelVersion(version="old", is_active=True))
    s.commit()
    activate_model.activate(s, settings, "1.0.0-dev")
    assert list(s.scalars(select(ModelVersion.version).where(ModelVersion.is_active))) == [
        "1.0.0-dev"
    ]


def test_production_refuses_to_activate_a_synthetic_model(db) -> None:  # type: ignore[no-untyped-def]
    s, settings = db
    prod = make_settings(env="production", geo_dir=settings.geo_dir, models_dir=settings.models_dir)
    with pytest.raises(ModelError, match="synthetic"):
        activate_model.activate(s, prod, "1.0.0-dev")
    assert s.scalar(select(func.count()).select_from(ModelVersion)) == 0  # nothing registered


def test_scoring_without_inputs_or_model_is_a_clear_error(db) -> None:  # type: ignore[no-untyped-def]
    s, settings = db
    with pytest.raises(SystemExit, match="No active model"):
        score_forecasts.score(s, settings, "2026-10")
    activate_model.activate(s, settings, "1.0.0-dev")
    with pytest.raises(SystemExit, match="No observations"):
        score_forecasts.score(s, settings, "2026-10")
