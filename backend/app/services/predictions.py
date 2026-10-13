import json
import uuid

from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.errors import ProblemError
from app.db.models import Geography, Prediction
from app.domain.risk import band_for
from app.ml.features import build_frame
from app.ml.registry import LoadedModel
from app.schemas.predictions import (
    FoldOut,
    ModelInfo,
    PredictionCounty,
    PredictionInput,
    PredictionResponse,
    PredictionWarning,
    SummaryStats,
)

SPREAD_WARN = 0.10


def _warn(code: str, message: str, severity: str = "warning") -> PredictionWarning:
    return PredictionWarning(code=code, severity=severity, message=message)


def _warnings(p: PredictionInput, model: LoadedModel, spread: float) -> list[PredictionWarning]:
    out: list[PredictionWarning] = []
    lo, hi = model.metadata.training_ranges["population"]
    if not lo * 0.5 <= p.population <= hi * 1.5:  # 50% tolerance around the training range
        out.append(_warn("OUT_OF_RANGE_POPULATION",
                         "Population is outside the observed training range."))  # fmt: skip
    ylo, yhi = model.metadata.training_ranges["start_year"]
    if not ylo - 1 <= p.start_year <= yhi + 2:
        out.append(_warn("OUT_OF_RANGE_YEAR",
                         "Year is outside the historical training period."))  # fmt: skip
    shift = (p.phase3plus_pct < 25 and p.previous_ipc_phase >= 4) or (
        p.phase3plus_pct > 75 and p.previous_ipc_phase <= 2
    )
    if shift:
        out.append(_warn("DISTRIBUTION_SHIFT", "Inputs differ substantially from training data."))
    if spread > SPREAD_WARN:
        out.append(_warn("MODEL_SENSITIVITY",
                         "The result is sensitive to the model's regularisation setting.",
                         "info"))  # fmt: skip
    return out


def make_prediction(
    session: Session, model: LoadedModel, payload: PredictionInput, settings: Settings
) -> PredictionResponse:
    county = session.get(Geography, payload.county_pcode)
    if county is None or county.level != "county" or county.parent_pcode is None:
        raise ProblemError(404, "County not found", f"Unknown county {payload.county_pcode}.")
    state = session.get(Geography, county.parent_pcode)
    if state is None:
        raise ProblemError(500, "Inconsistent geography data")

    frame = build_frame([{
        "state": state.pcode, "county": county.pcode, "population": payload.population,
        "year": payload.start_year, "month": payload.start_month,
        "phase": payload.previous_ipc_phase, "pct": payload.phase3plus_pct,
        "production": payload.cereal_production_t, "gap": payload.cereal_gap_t,
    }])  # fmt: skip
    p1 = float(model.pipeline.predict_proba(frame)[0][1])
    p2 = float(model.sensitivity.predict_proba(frame)[0][1])
    spread = abs(p1 - p2)
    pid = str(uuid.uuid4())
    band = band_for(p1)

    if settings.persist_predictions:
        session.add(Prediction(
            id=pid, model_version=model.metadata.version, county_pcode=county.pcode,
            inputs=json.dumps(payload.model_dump(), sort_keys=True),
            risk_probability=p1, sensitivity_probability=p2, risk_band=band,
        ))  # fmt: skip
        session.commit()

    return PredictionResponse(
        prediction_id=pid,
        model_version=model.metadata.version,
        county=PredictionCounty(
            pcode=county.pcode, name=county.name, state_pcode=state.pcode, state_name=state.name
        ),  # fmt: skip
        risk_probability=p1,
        risk_band=band,
        sensitivity_probability=p2,
        model_spread=spread,
        warnings=_warnings(payload, model, spread),
    )


def _stats(values: list[float]) -> SummaryStats:
    n = len(values)
    mean = sum(values) / n
    std = (sum((v - mean) ** 2 for v in values) / (n - 1)) ** 0.5 if n > 1 else 0.0
    return SummaryStats(mean=mean, std=std, min=min(values), max=max(values), latest=values[-1])


def model_info(model: LoadedModel) -> ModelInfo:
    m = model.metadata
    return ModelInfo(
        name=m.name, version=m.version, algorithm=m.algorithm, parameters=m.parameters,
        sensitivity_parameters=m.sensitivity_parameters, metric=m.metric,
        validation_strategy=m.validation_strategy, synthetic=m.synthetic, trained_at=m.trained_at,
        training_periods=m.training_periods, training_counties=m.training_counties,
        folds=[FoldOut(**f.model_dump()) for f in model.folds],
        production=_stats([f.roc_auc for f in model.folds]),
        sensitivity=_stats([f.roc_auc_sensitivity for f in model.folds]),
    )  # fmt: skip
