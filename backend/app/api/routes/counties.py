from typing import Annotated

from fastapi import APIRouter, Path, Query, Response
from sqlalchemy import select

from app.api.deps import SessionDep
from app.db.models import Forecast, ModelVersion
from app.schemas.counties import CountiesResponse, CountyDetail
from app.schemas.forecasts import Period
from app.services import counties as svc

router = APIRouter(prefix="/api/v1/counties", tags=["counties"])
CACHE = "public, max-age=60, stale-while-revalidate=300"
PeriodQuery = Annotated[Period | None, Query(description="YYYY-MM. Defaults to the latest period.")]


def _resolve(session: SessionDep, period: str | None) -> str:
    if period:
        return period
    latest = session.scalar(
        select(Forecast.period).join(ModelVersion, ModelVersion.version == Forecast.model_version)
        .where(ModelVersion.is_active).order_by(Forecast.period.desc()).limit(1)
    )  # fmt: skip
    return latest or "0000-00"  # unknown -> the service answers 404 "Period not found"


@router.get("", response_model=CountiesResponse)
def list_counties(
    session: SessionDep, response: Response, period: PeriodQuery = None
) -> CountiesResponse:
    response.headers["Cache-Control"] = CACHE
    return svc.list_counties(session, _resolve(session, period))


@router.get("/{pcode}", response_model=CountyDetail)
def get_county(
    pcode: Annotated[str, Path(pattern=r"^[A-Za-z0-9_-]{1,16}$")],
    session: SessionDep, response: Response, period: PeriodQuery = None,
) -> CountyDetail:  # fmt: skip
    response.headers["Cache-Control"] = CACHE
    return svc.get_county(session, pcode, _resolve(session, period))
