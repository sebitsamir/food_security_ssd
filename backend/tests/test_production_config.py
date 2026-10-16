"""Production Settings guards (no live Postgres required)."""

import pytest
from pydantic import ValidationError

from app.core.config import Settings


def test_production_refuses_sqlite() -> None:
    with pytest.raises(ValidationError, match="SQLite"):
        Settings(
            env="production",
            database_url="sqlite:///./prod.db",
            cors_origins="https://example.com",
        )


def test_production_refuses_wildcard_cors() -> None:
    with pytest.raises(ValidationError, match="CORS_ORIGINS"):
        Settings(
            env="production",
            database_url="postgresql+psycopg://u:p@db:5432/risk",
            cors_origins="*",
        )


def test_production_accepts_postgres() -> None:
    s = Settings(
        env="production",
        database_url="postgresql+psycopg://u:p@db:5432/risk",
        cors_origins="https://app.example",
    )
    assert s.is_production
