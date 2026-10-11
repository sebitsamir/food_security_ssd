from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy.orm import Session

from app.core.errors import ProblemError
from app.db.session import get_session
from app.geo.loader import GeoStore
from app.ml.registry import LoadedModel

SessionDep = Annotated[Session, Depends(get_session)]


def get_geo_store(request: Request) -> GeoStore:
    store: GeoStore = request.app.state.geo
    return store


GeoDep = Annotated[GeoStore, Depends(get_geo_store)]


def get_model(request: Request) -> LoadedModel:
    model: LoadedModel | None = request.app.state.model
    if model is None:
        raise ProblemError(503, "No model loaded", "The prediction model is not available.")
    return model


ModelDep = Annotated[LoadedModel, Depends(get_model)]
