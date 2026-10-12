"""Verifies a model on disk, registers it, and makes it the one active version.

    python -m scripts.activate_model 1.0.0

It loads the model exactly as the API will (checksums, scikit-learn version, feature contract,
no synthetic models in production) BEFORE touching the database, so a bad artifact can never become
active. Restart or redeploy the API afterwards so it picks the new model up.
"""

import sys

from sqlalchemy import update
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import Settings, get_settings
from app.db.models import ModelVersion
from app.db.session import make_engine
from app.ml.registry import ModelError, ModelMetadata, load_model


def activate(session: Session, settings: Settings, version: str) -> ModelMetadata:
    loaded = load_model(settings.models_dir, version, allow_synthetic=not settings.is_production)
    if session.get(ModelVersion, version) is None:
        session.add(ModelVersion(version=version, is_active=False))
        session.flush()
    session.execute(update(ModelVersion).values(is_active=False))
    session.flush()
    session.execute(
        update(ModelVersion).where(ModelVersion.version == version).values(is_active=True)
    )
    session.commit()
    return loaded.metadata


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    settings = get_settings()
    try:
        with sessionmaker(make_engine(settings.database_url))() as s:
            meta = activate(s, settings, sys.argv[1])
    except ModelError as exc:
        sys.exit(f"REFUSED: {exc}")
    print(f"active model: {meta.version} ({meta.algorithm}, trained {meta.trained_at})")
