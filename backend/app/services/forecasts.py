from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import ProblemError
from app.db.models import Forecast, Geography, ModelVersion
from app.schemas.forecasts import Level, PeriodsResponse, RiskItem, RiskResponse


def _active_version(session: Session) -> str:
    version = session.scalar(select(ModelVersion.version).where(ModelVersion.is_active))
    if version is None:
        raise ProblemError(503, "No active model", "No model version is marked active.")
    return version


def list_periods(session: Session) -> PeriodsResponse:
    version = _active_version(session)
    periods = list(
        session.scalars(
            select(Forecast.period)
            .where(Forecast.model_version == version)
            .distinct()
            .order_by(Forecast.period.desc())
        )
    )
    return PeriodsResponse(latest=periods[0] if periods else None, periods=periods)


def get_risk(session: Session, level: Level, period: str) -> RiskResponse:
    version = _active_version(session)
    base = (Forecast.model_version == version) & (Forecast.period == period)

    if level == "counties":
        county_rows = session.execute(
            select(Forecast.county_pcode, Forecast.risk_probability)
            .where(base)
            .order_by(Forecast.county_pcode)
        ).all()
        items = [RiskItem(pcode=p, probability=v) for p, v in county_rows]
    else:  # state value = mean of its counties' probabilities
        state_rows = session.execute(
            select(
                Geography.parent_pcode, func.avg(Forecast.risk_probability), func.count(Forecast.id)
            )
            .join(Geography, Geography.pcode == Forecast.county_pcode)
            .where(base, Geography.parent_pcode.is_not(None))
            .group_by(Geography.parent_pcode)
            .order_by(Geography.parent_pcode)
        ).all()
        items = [
            RiskItem(pcode=p, probability=float(a), county_count=int(c))
            for p, a, c in state_rows
            if p is not None
        ]

    if not items:
        raise ProblemError(404, "Period not found", f"No forecasts for {period}.")
    return RiskResponse(level=level, period=period, model_version=version, items=items)
