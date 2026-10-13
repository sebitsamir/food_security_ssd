from typing import Annotated

from fastapi import APIRouter, Query, Response

from app.api.deps import SessionDep
from app.schemas.forecasts import Level, Period, PeriodsResponse, RiskResponse
from app.services import forecasts as svc

router = APIRouter(prefix="/api/v1/forecasts", tags=["forecasts"])
CACHE = "public, max-age=60, stale-while-revalidate=300"
PeriodQuery = Annotated[Period, Query(description="Forecast period, YYYY-MM")]


@router.get("/periods", response_model=PeriodsResponse)
def periods(session: SessionDep, response: Response) -> PeriodsResponse:
    response.headers["Cache-Control"] = CACHE
    return svc.list_periods(session)


@router.get("/{level}", response_model=RiskResponse)
def risk(
    level: Level, period: PeriodQuery, session: SessionDep, response: Response
) -> RiskResponse:
    response.headers["Cache-Control"] = CACHE
    return svc.get_risk(session, level, period)
