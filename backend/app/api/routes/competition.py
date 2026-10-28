
from typing import Annotated

from fastapi import APIRouter, Query, Request, Response

from app.schemas.competition import CompetitionPredictionsResponse
from app.schemas.forecasts import Period
from app.services.competition import list_competition_predictions

router = APIRouter(prefix="/api/v1/competition", tags=["competition"])


@router.get("/predictions", response_model=CompetitionPredictionsResponse)
def predictions(
    request: Request,
    response: Response,
    period: Annotated[
        Period | None,
        Query(description="Optional period, YYYY-MM"),
    ] = None,
) -> CompetitionPredictionsResponse:
    response.headers["Cache-Control"] = "public, max-age=300"
    return list_competition_predictions(request.app.state.settings, period)
