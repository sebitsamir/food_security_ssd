
from pydantic import BaseModel, Field

from app.schemas.forecasts import Period


class CompetitionPrediction(BaseModel):
    id: str
    state: str
    county: str
    period: Period
    risk_probability: float = Field(ge=0, le=1)
    sensitivity_probability: float = Field(ge=0, le=1)
    model_spread: float = Field(ge=0, le=1)


class CompetitionPredictionsResponse(BaseModel):
    dataset: str
    model_version: str
    historical_only: bool = True
    periods: list[Period]
    total: int
    items: list[CompetitionPrediction]
