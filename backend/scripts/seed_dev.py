"""Development data: model-scored forecasts and observations. Refuses to run in production.

Order: boundaries -> `python -m scripts.load_geographies`, then this script. It trains the
synthetic dev model if none exists, marks it active, writes observations for every period and
scores the forecast periods with the real pipeline, so the UI shows model-shaped numbers.
"""

import sys

from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import Settings, get_settings
from app.db.models import Forecast, Geography, ModelVersion, Observation
from app.db.session import make_engine
from app.ml.dev_data import ALL_PERIODS, DEV_VERSION, FORECAST_PERIODS, generate, obs_to_row
from app.ml.features import build_frame
from app.ml.registry import load_model
from scripts.train_dev_model import counties_from_geojson, train


def seed(session: Session, settings: Settings) -> dict[str, int]:
    pairs = [
        (g.pcode, g.parent_pcode or "")
        for g in session.scalars(select(Geography).where(Geography.level == "county"))
    ]
    if not pairs:
        raise SystemExit("No counties. Run: python -m scripts.load_geographies")
    if not (settings.models_dir / DEV_VERSION / "metadata.json").exists():
        train(settings.models_dir, counties_from_geojson(settings.geo_dir / "counties.geojson"))
    model = load_model(settings.models_dir, DEV_VERSION, allow_synthetic=True)

    if session.get(ModelVersion, DEV_VERSION) is None:
        session.add(ModelVersion(version=DEV_VERSION, is_active=False))
        session.flush()
    session.query(ModelVersion).update({ModelVersion.is_active: False})
    session.flush()
    session.query(ModelVersion).filter_by(version=DEV_VERSION).update(
        {ModelVersion.is_active: True}
    )

    obs = generate(pairs)
    have_obs = set(session.execute(select(Observation.county_pcode, Observation.period)).all())
    n_obs = 0
    for o in obs:
        if (o.county, o.period) not in have_obs:
            session.add(
                Observation(
                    county_pcode=o.county,
                    period=o.period,
                    population=o.population,
                    prior_ipc_phase=o.phase,
                    phase3plus_pct=o.pct,
                    cereal_production_t=o.production,
                    cereal_gap_t=o.gap,
                )  # fmt: skip
            )
            n_obs += 1

    have_fc = set(session.execute(select(Forecast.county_pcode, Forecast.period)
                                  .where(Forecast.model_version == DEV_VERSION)).all())  # fmt: skip
    n_fc = 0
    for period in FORECAST_PERIODS:
        rows = [o for o in obs if o.period == period and (o.county, period) not in have_fc]
        if not rows:
            continue
        probs = model.pipeline.predict_proba(build_frame(obs_to_row(o) for o in rows))[:, 1]
        for o, p in zip(rows, probs, strict=True):
            session.add(Forecast(county_pcode=o.county, period=period, model_version=DEV_VERSION,
                                 risk_probability=round(float(p), 4)))  # fmt: skip
            n_fc += 1
    session.commit()
    assert set(ALL_PERIODS) >= set(FORECAST_PERIODS)
    return {"observations": n_obs, "forecasts": n_fc}


if __name__ == "__main__":
    settings = get_settings()
    if settings.is_production:
        sys.exit("Refusing to seed development data in production.")
    with sessionmaker(make_engine(settings.database_url))() as s:
        print(seed(s, settings))
