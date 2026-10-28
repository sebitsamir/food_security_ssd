from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.db.base import Base
from app.db.models import Forecast, Geography, ModelVersion
from app.main import create_app

FIXTURES = Path(__file__).parent / "fixtures" / "geo"


def make_settings(**kw: object) -> Settings:
    base: dict[str, object] = {
        "env": "test",
        "database_url": "sqlite+pysqlite://",
        "geo_dir": FIXTURES,
        "log_level": "WARNING",
    }
    if kw.get("env") == "production":
        # Unit tests still use SQLite; real deploys never set this flag.
        base["relax_production_db_check"] = True
    return Settings(**{**base, **kw})  # type: ignore[arg-type]


@pytest.fixture
def client(tmp_path: Path) -> Iterator[TestClient]:
    # Keep no-model tests isolated from the real model artifacts.
    app = create_app(make_settings(models_dir=tmp_path))

    Base.metadata.create_all(app.state.engine)

    with app.state.session_factory() as session:
        seed(session)

    with TestClient(app) as test_client:
        yield test_client


def seed(s: Session) -> None:
    s.add_all(
        [
            Geography(pcode="T1", name="Alpha", level="state"),
            Geography(pcode="T2", name="Beta", level="state"),
        ]
    )
    s.flush()
    s.add_all(
        [
            Geography(pcode="T101", name="A-One", level="county", parent_pcode="T1"),
            Geography(pcode="T102", name="A-Two", level="county", parent_pcode="T1"),
            Geography(pcode="T201", name="B-One", level="county", parent_pcode="T2"),
            Geography(pcode="T202", name="B-Two", level="county", parent_pcode="T2"),
            ModelVersion(version="1.0.0", is_active=True),
            ModelVersion(version="0.9.0", is_active=False),
        ]
    )
    s.flush()
    rows = {"T101": 0.2, "T102": 0.6, "T201": 0.8, "T202": 1.0}
    for period in ("2026-04", "2025-10"):
        for code, p in rows.items():
            s.add(
                Forecast(
                    county_pcode=code, period=period, model_version="1.0.0", risk_probability=p
                )
            )
    # an old inactive model with different numbers must never leak into responses
    s.add(
        Forecast(
            county_pcode="T101", period="2026-04", model_version="0.9.0", risk_probability=0.01
        )
    )
    s.commit()


# ---- full-stack fixtures: real dev boundaries, a really trained (synthetic) model ----
DEV_GEO = Path(__file__).parents[1] / "data" / "geo"


@pytest.fixture(scope="session")
def models_dir(tmp_path_factory: pytest.TempPathFactory) -> Path:
    from scripts.train_dev_model import counties_from_geojson, train

    d = tmp_path_factory.mktemp("models")
    train(d, counties_from_geojson(DEV_GEO / "counties.geojson"))
    return d


def make_ml_app(models_dir: Path, **kw: object):  # type: ignore[no-untyped-def]
    from scripts import load_geographies, seed_dev

    settings = make_settings(geo_dir=DEV_GEO, models_dir=models_dir, **kw)
    app = create_app(settings)
    Base.metadata.create_all(app.state.engine)
    with app.state.session_factory() as s:
        load_geographies.sync(s, settings)
        seed_dev.seed(s, settings)
    return app


@pytest.fixture
def ml_client(models_dir: Path) -> Iterator[TestClient]:
    with TestClient(make_ml_app(models_dir)) as c:
        yield c
