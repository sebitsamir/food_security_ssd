from fastapi import APIRouter, Depends, Request

from app.api.deps import ModelDep, SessionDep
from app.core.ratelimit import enforce_prediction_limit
from app.schemas.predictions import ModelInfo, PredictionInput, PredictionResponse
from app.services import predictions as svc

router = APIRouter(prefix="/api/v1", tags=["predictions"])


@router.post("/predictions", response_model=PredictionResponse,
             dependencies=[Depends(enforce_prediction_limit)])  # fmt: skip
def create_prediction(payload: PredictionInput, request: Request, session: SessionDep,
                      model: ModelDep) -> PredictionResponse:  # fmt: skip
    return svc.make_prediction(session, model, payload, request.app.state.settings)


@router.get("/model", response_model=ModelInfo)
def get_model(model: ModelDep) -> ModelInfo:
    return svc.model_info(model)
