import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from starlette.middleware.gzip import GZipMiddleware

from app.api.routes import counties, forecasts, geo, health, predictions
from app.core.config import Settings, get_settings
from app.core.errors import install_error_handlers
from app.core.logging import configure_logging
from app.core.middleware import RequestContextMiddleware
from app.core.ratelimit import RateLimiter
from app.db.models import ModelVersion
from app.db.session import make_engine, make_session_factory
from app.geo.loader import load_store
from app.ml.registry import LoadedModel, ModelError, load_model

log = logging.getLogger(__name__)


def _load_active_model(app: FastAPI, settings: Settings) -> LoadedModel | None:
    try:
        with app.state.session_factory() as session:
            version = session.scalar(select(ModelVersion.version).where(ModelVersion.is_active))
    except Exception:
        if settings.is_production:
            raise
        log.exception("could not read the active model version; predictions disabled")
        return None
    if version is None:
        if settings.is_production:
            raise ModelError(
                "No active model. Place artifacts under MODELS_DIR/<version>/ then run: "
                "python -m scripts.activate_model <version>"
            )
        log.warning("no active model version; predictions disabled")
        return None
    try:
        return load_model(settings.models_dir, version, allow_synthetic=not settings.is_production)
    except ModelError:
        if settings.is_production:
            raise  # never serve a half-configured production instance
        log.exception("model %s could not be loaded; predictions disabled", version)
        return None



def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    configure_logging(settings.log_level)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        # Fail fast: invalid boundaries abort startup instead of breaking the map later.
        app.state.geo = load_store(settings.geo_dir, allow_synthetic=not settings.is_production)
        log.info(
            "geo loaded: %d states, %d counties (synthetic=%s)",
            len(app.state.geo.states.pcodes),
            len(app.state.geo.counties.pcodes),
            app.state.geo.meta.synthetic,
        )
        app.state.model = _load_active_model(app, settings)
        yield
        app.state.engine.dispose()

    app = FastAPI(
        title="South Sudan Food Security API",
        version="1.0.0",
        lifespan=lifespan,
        docs_url=None if settings.is_production else "/docs",
        redoc_url=None,
        openapi_url=None if settings.is_production else "/openapi.json",
    )
    app.state.settings = settings
    app.state.model = None
    app.state.prediction_limiter = RateLimiter(settings.prediction_rate_limit)
    app.state.engine = make_engine(settings.database_url)
    app.state.session_factory = make_session_factory(app.state.engine)

    # Order matters: the last added runs first (outermost).
    app.add_middleware(GZipMiddleware, minimum_size=1024)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_methods=["GET", "POST"],
        allow_headers=["If-None-Match", "X-Request-ID", "Content-Type"],
        expose_headers=["ETag", "X-Request-ID"],
        max_age=600,
    )
    app.add_middleware(RequestContextMiddleware)
    install_error_handlers(app)

    app.include_router(health.router)
    app.include_router(geo.router)
    app.include_router(forecasts.router)
    app.include_router(counties.router)
    app.include_router(predictions.router)
    return app
