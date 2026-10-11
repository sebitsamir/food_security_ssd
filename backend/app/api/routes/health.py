from fastapi import APIRouter, Request
from sqlalchemy import select, text

from app.api.deps import GeoDep, SessionDep
from app.core.errors import ProblemError
from app.db.models import ModelVersion

router = APIRouter(tags=["health"])


@router.get("/healthz")
def healthz() -> dict[str, str]:
    """Liveness: the process is up."""
    return {"status": "ok"}


@router.get("/readyz")
def readyz(request: Request, session: SessionDep, geo: GeoDep) -> dict[str, object]:
    """Readiness: dependencies work. Orchestrators route traffic only when this is 200."""
    settings = request.app.state.settings
    try:
        session.execute(text("SELECT 1"))
    except Exception as exc:
        raise ProblemError(503, "Database unavailable") from exc
    try:  # catches a reachable but un-migrated database
        session.execute(select(ModelVersion.version).limit(1))
    except Exception as exc:
        raise ProblemError(
            503, "Database schema is not migrated", "Run: alembic upgrade head"
        ) from exc
    model_loaded = request.app.state.model is not None
    if settings.is_production and not model_loaded:
        raise ProblemError(503, "Model not loaded")
    if settings.is_production and geo.meta.synthetic:
        raise ProblemError(503, "Synthetic boundaries are not allowed in production")
    return {
        "status": "ready",
        "counties": len(geo.counties.pcodes),
        "states": len(geo.states.pcodes),
        "synthetic_geo": geo.meta.synthetic,
        "model_loaded": model_loaded,
    }
