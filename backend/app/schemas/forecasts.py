from typing import Annotated, Literal

from pydantic import BaseModel, Field

Level = Literal["states", "counties"]
Period = Annotated[str, Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$", examples=["2026-04"])]


class RiskItem(BaseModel):
    pcode: str
    probability: float = Field(ge=0, le=1)
    county_count: int | None = Field(default=None, ge=1)


class RiskResponse(BaseModel):
    level: Level
    period: Period
    model_version: str
    items: list[RiskItem]


class PeriodsResponse(BaseModel):
    latest: Period | None
    periods: list[Period]
