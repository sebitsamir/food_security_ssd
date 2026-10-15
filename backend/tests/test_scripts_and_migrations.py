from pathlib import Path

import pytest
from alembic.config import Config
from sqlalchemy import create_engine, inspect, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker

from alembic import command
from app.db.base import Base
from app.db.models import Forecast, Geography, ModelVersion
from app.db.session import make_engine
from scripts import load_geographies, seed_dev
from tests.conftest import make_settings

ROOT = Path(__file__).parents[1]
DEV_GEO = ROOT / "data" / "geo"


def test_migration_matches_models(tmp_path: Path) -> None:
    url = f"sqlite:///{tmp_path / 'm.db'}"
    cfg = Config(str(ROOT / "alembic.ini"))
    cfg.set_main_option("script_location", str(ROOT / "alembic"))
    cfg.set_main_option("sqlalchemy.url", url)
    command.upgrade(cfg, "head")
    tables = set(inspect(create_engine(url)).get_table_names())
    assert set(Base.metadata.tables) <= tables


def test_load_geographies_is_idempotent() -> None:
    engine = make_engine("sqlite+pysqlite://")
    Base.metadata.create_all(engine)
    settings = make_settings(geo_dir=DEV_GEO)
    with sessionmaker(engine)() as s:
        first = load_geographies.sync(s, settings)
        second = load_geographies.sync(s, settings)
        assert first["inserted"] == 89 and second == {"inserted": 0, "updated": 0, "unchanged": 89}
        assert (
            s.scalar(select(Geography.parent_pcode).where(Geography.pcode == "DEV0301")) == "DEV03"
        )


def test_seed_dev_creates_complete_scored_forecasts(models_dir: Path) -> None:
    engine = make_engine("sqlite+pysqlite://")
    Base.metadata.create_all(engine)
    settings = make_settings(geo_dir=DEV_GEO, models_dir=models_dir)
    with sessionmaker(engine)() as s:
        load_geographies.sync(s, settings)
        first = seed_dev.seed(s, settings)
        assert first == {"observations": 79 * 14, "forecasts": 79 * 2}
        assert seed_dev.seed(s, settings) == {"observations": 0, "forecasts": 0}  # idempotent
        assert s.scalar(select(ModelVersion.is_active).where(ModelVersion.version == "1.0.0-dev"))
        probs = list(s.scalars(select(Forecast.risk_probability)))
        assert (
            all(0 <= p <= 1 for p in probs) and len(set(probs)) > 100
        )  # model output, not constants


def test_database_rejects_bad_probability() -> None:
    engine = make_engine("sqlite+pysqlite://")
    Base.metadata.create_all(engine)
    with sessionmaker(engine)() as s:
        s.add_all(
            [
                Geography(pcode="S", name="s", level="state"),
                ModelVersion(version="v", is_active=True),
            ]
        )
        s.flush()
        s.add(Geography(pcode="C", name="c", level="county", parent_pcode="S"))
        s.flush()
        s.add(Forecast(county_pcode="C", period="2026-04", model_version="v", risk_probability=1.5))
        with pytest.raises(IntegrityError):
            s.flush()


def test_alembic_cli_runs_from_backend_dir(tmp_path: Path) -> None:
    import os
    import subprocess
    import sys

    env = {**os.environ, "DATABASE_URL": f"sqlite:///{tmp_path / 'cli.db'}"}
    env.pop("PYTHONPATH", None)
    out = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=ROOT,
        env=env,
        capture_output=True,
        text=True,
    )
    assert out.returncode == 0, out.stderr
