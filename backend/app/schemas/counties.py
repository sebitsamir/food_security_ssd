from pydantic import BaseModel, Field

from app.domain.risk import BandKey
from app.schemas.forecasts import Period


class Facts(BaseModel):
    population: int
    previous_ipc_phase: int = Field(ge=1, le=5)
    phase3plus_pct: float = Field(ge=0, le=100)
    cereal_production_t: float
    cereal_gap_t: float


class CountyRecord(BaseModel):
    pcode: str
    name: str
    state_pcode: str
    state_name: str
    probability: float = Field(ge=0, le=1)
    band: BandKey
    rank: int = Field(ge=1)
    facts: Facts | None


class CountiesResponse(BaseModel):
    period: Period
    model_version: str
    items: list[CountyRecord]


class HistoryPoint(BaseModel):
    period: Period
    phase3plus_pct: float


class CountyDetail(CountyRecord):
    period: Period
    model_version: str
    state_rank: int
    state_county_count: int
    history: list[HistoryPoint]
