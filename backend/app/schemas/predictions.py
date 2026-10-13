from typing import Literal

from pydantic import BaseModel, Field

from app.domain.risk import BandKey


class PredictionInput(BaseModel):
    county_pcode: str = Field(min_length=1, max_length=16, pattern=r"^[A-Za-z0-9_-]+$")
    start_year: int = Field(ge=1990, le=2100)
    start_month: int = Field(ge=1, le=12)
    population: int = Field(ge=1, le=50_000_000)
    previous_ipc_phase: int = Field(ge=1, le=5)
    phase3plus_pct: float = Field(ge=0, le=100)
    cereal_production_t: float = Field(ge=0, le=1e9)
    cereal_gap_t: float = Field(ge=-1e9, le=1e9)  # negative = deficit


class PredictionWarning(BaseModel):
    code: str
    severity: Literal["info", "warning"]
    message: str


class PredictionCounty(BaseModel):
    pcode: str
    name: str
    state_pcode: str
    state_name: str


class PredictionResponse(BaseModel):
    prediction_id: str
    model_version: str
    county: PredictionCounty
    risk_probability: float = Field(ge=0, le=1)
    risk_band: BandKey
    sensitivity_probability: float = Field(ge=0, le=1)
    model_spread: float = Field(ge=0, le=1)
    warnings: list[PredictionWarning]


class FoldOut(BaseModel):
    fold: int
    test_period: str
    roc_auc: float
    roc_auc_sensitivity: float


class SummaryStats(BaseModel):
    mean: float
    std: float
    min: float
    max: float
    latest: float


class ModelInfo(BaseModel):
    name: str
    version: str
    algorithm: str
    parameters: dict[str, object]
    sensitivity_parameters: dict[str, object]
    metric: str
    validation_strategy: str
    synthetic: bool
    trained_at: str
    training_periods: int
    training_counties: int
    folds: list[FoldOut]
    production: SummaryStats
    sensitivity: SummaryStats
