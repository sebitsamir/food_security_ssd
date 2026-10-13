from sqlalchemy import select
from sqlalchemy.orm import Session, aliased

from app.core.errors import ProblemError
from app.db.models import Forecast, Geography, ModelVersion, Observation
from app.domain.risk import band_for
from app.schemas.counties import (
    CountiesResponse,
    CountyDetail,
    CountyRecord,
    Facts,
    HistoryPoint,
)

HISTORY_POINTS = 10


def _active_version(session: Session) -> str:
    version = session.scalar(select(ModelVersion.version).where(ModelVersion.is_active))
    if version is None:
        raise ProblemError(503, "No active model", "No model version is marked active.")
    return version


def list_counties(session: Session, period: str) -> CountiesResponse:
    version = _active_version(session)
    state = aliased(Geography)
    rows = session.execute(
        select(
            Forecast.county_pcode,
            Forecast.risk_probability,
            Geography.name,
            Geography.parent_pcode,
            state.name,
            Observation.population,
            Observation.prior_ipc_phase,
            Observation.phase3plus_pct,
            Observation.cereal_production_t,
            Observation.cereal_gap_t,
        )  # fmt: skip
        .join(Geography, Geography.pcode == Forecast.county_pcode)
        .join(state, state.pcode == Geography.parent_pcode)
        .outerjoin(
            Observation,
            (Observation.county_pcode == Forecast.county_pcode)
            & (Observation.period == Forecast.period),
        )
        .where(Forecast.model_version == version, Forecast.period == period)
        .order_by(Forecast.risk_probability.desc(), Forecast.county_pcode)
    ).all()
    if not rows:
        raise ProblemError(404, "Period not found", f"No forecasts for {period}.")

    items = []
    for i, r in enumerate(rows, start=1):
        facts = None if r[5] is None else Facts(
            population=r[5], previous_ipc_phase=r[6], phase3plus_pct=r[7],
            cereal_production_t=r[8], cereal_gap_t=r[9],
        )  # fmt: skip
        items.append(CountyRecord(
            pcode=r[0], name=r[2], state_pcode=r[3], state_name=r[4],
            probability=r[1], band=band_for(r[1]), rank=i, facts=facts,
        ))  # fmt: skip
    return CountiesResponse(period=period, model_version=version, items=items)


def get_county(session: Session, pcode: str, period: str) -> CountyDetail:
    listing = list_counties(session, period)
    record = next((c for c in listing.items if c.pcode == pcode), None)
    if record is None:
        raise ProblemError(404, "County not found", f"No county {pcode} in {period}.")
    in_state = [c for c in listing.items if c.state_pcode == record.state_pcode]
    history = session.execute(
        select(Observation.period, Observation.phase3plus_pct)
        .where(Observation.county_pcode == pcode, Observation.period <= period)
        .order_by(Observation.period.desc()).limit(HISTORY_POINTS)
    ).all()  # fmt: skip
    return CountyDetail(
        **record.model_dump(),
        period=period,
        model_version=listing.model_version,
        state_rank=[c.pcode for c in in_state].index(pcode) + 1,
        state_county_count=len(in_state),
        history=[HistoryPoint(period=p, phase3plus_pct=v) for p, v in reversed(history)],
    )
