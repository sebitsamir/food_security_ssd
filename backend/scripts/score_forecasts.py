"""Scores a period with the ACTIVE model and stores the forecasts.

    python -m scripts.score_forecasts 2026-10 [--replace]

Reads that period's rows from `observations` (see scripts.import_observations), runs the model's
pipeline, and writes one forecast per county. Existing forecasts for the same model are kept unless
--replace is given.
"""

import sys

from sqlalchemy import delete, select
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import Settings, get_settings
from app.db.models import Forecast, Geography, ModelVersion, Observation
from app.db.session import make_engine
from app.ml.features import build_frame
from app.ml.registry import load_model


def score(session: Session, settings: Settings, period: str, *, replace: bool = False) -> int:
    version = session.scalar(select(ModelVersion.version).where(ModelVersion.is_active))
    if version is None:
        raise SystemExit("No active model. Run: python -m scripts.activate_model <version>")
    model = load_model(settings.models_dir, version, allow_synthetic=not settings.is_production)

    state_of = dict(session.execute(select(Geography.pcode, Geography.parent_pcode)).all())
    obs = list(session.scalars(select(Observation).where(Observation.period == period)
                               .order_by(Observation.county_pcode)))  # fmt: skip
    if not obs:
        raise SystemExit(f"No observations for {period}. Import them first.")
    if replace:
        session.execute(delete(Forecast).where(Forecast.period == period,
                                               Forecast.model_version == version))  # fmt: skip
        session.flush()
    have = set(session.scalars(select(Forecast.county_pcode).where(
        Forecast.period == period, Forecast.model_version == version)))  # fmt: skip
    todo = [o for o in obs if o.county_pcode not in have]
    if not todo:
        return 0

    year, month = (int(x) for x in period.split("-"))
    frame = build_frame({
        "state": state_of[o.county_pcode], "county": o.county_pcode, "population": o.population,
        "year": year, "month": month, "phase": o.prior_ipc_phase, "pct": o.phase3plus_pct,
        "production": o.cereal_production_t, "gap": o.cereal_gap_t,
    } for o in todo)  # fmt: skip
    probs = model.pipeline.predict_proba(frame)[:, 1]
    for o, p in zip(todo, probs, strict=True):
        session.add(Forecast(county_pcode=o.county_pcode, period=period, model_version=version,
                             risk_probability=round(float(p), 4)))  # fmt: skip
    session.commit()
    return len(todo)


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if len(args) != 1:
        sys.exit(__doc__)
    settings = get_settings()
    with sessionmaker(make_engine(settings.database_url))() as s:
        print(f"scored {score(s, settings, args[0], replace='--replace' in sys.argv)} counties")
