"""Score a period with the active model and persist one forecast per county.

Run from backend/: python -m scripts.score_forecasts YYYY-MM [--replace]
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

    geographies = list(session.scalars(select(Geography)))
    by_code = {geo.pcode: geo for geo in geographies}
    state_name_by_county: dict[str, str] = {}
    county_name_by_code: dict[str, str] = {}
    for geo in geographies:
        if geo.level != "county":
            continue
        county_name_by_code[geo.pcode] = geo.name
        parent = by_code.get(geo.parent_pcode or "")
        if parent is None or parent.level != "state":
            raise SystemExit(
                f"Geography integrity error: county {geo.pcode} has no valid parent state."
            )
        state_name_by_county[geo.pcode] = parent.name

    obs = list(
        session.scalars(
            select(Observation)
            .where(Observation.period == period)
            .order_by(Observation.county_pcode)
        )
    )
    if not obs:
        raise SystemExit(f"No observations for {period}. Import them first.")

    missing_codes = sorted({o.county_pcode for o in obs} - set(county_name_by_code))
    if missing_codes:
        raise SystemExit(f"Observations reference unknown counties: {missing_codes}")

    if replace:
        session.execute(
            delete(Forecast).where(Forecast.period == period, Forecast.model_version == version)
        )
        session.flush()
    have = set(
        session.scalars(
            select(Forecast.county_pcode).where(
                Forecast.period == period, Forecast.model_version == version
            )
        )
    )
    todo = [observation for observation in obs if observation.county_pcode not in have]
    if not todo:
        return 0

    year, month = (int(value) for value in period.split("-"))
    frame = build_frame(
        {
            "state": state_name_by_county[observation.county_pcode],
            "county": county_name_by_code[observation.county_pcode],
            "population": observation.population,
            "year": year,
            "month": month,
            "phase": observation.prior_ipc_phase,
            "pct": observation.phase3plus_pct,
            "production": observation.cereal_production_t,
            "gap": observation.cereal_gap_t,
        }
        for observation in todo
    )
    probabilities = model.pipeline.predict_proba(frame)[:, 1]
    for observation, probability in zip(todo, probabilities, strict=True):
        session.add(
            Forecast(
                county_pcode=observation.county_pcode,
                period=period,
                model_version=version,
                risk_probability=round(float(probability), 4),
            )
        )
    session.commit()
    return len(todo)


if __name__ == "__main__":
    args = [arg for arg in sys.argv[1:] if not arg.startswith("--")]
    if len(args) != 1:
        sys.exit(__doc__)
    settings = get_settings()
    with sessionmaker(make_engine(settings.database_url))() as session:
        count = score(session, settings, args[0], replace="--replace" in sys.argv)
        print(f"scored {count} counties")
