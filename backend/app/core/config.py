from functools import lru_cache
from pathlib import Path
from typing import Literal, Self

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

DEFAULT_GEO_DIR = Path(__file__).resolve().parents[2] / "data" / "geo"
DEFAULT_MODELS_DIR = Path(__file__).resolve().parents[2] / "models"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    env: Literal["development", "test", "production"] = "development"
    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5432/risk"
    cors_origins: str = "http://localhost:3000"  # comma separated
    geo_dir: Path = DEFAULT_GEO_DIR
    models_dir: Path = DEFAULT_MODELS_DIR
    prediction_rate_limit: int = 30  # requests per minute per client address
    persist_predictions: bool = True
    log_level: str = "INFO"
    # Comma-separated proxy IPs trusted for X-Forwarded-For (uvicorn --forwarded-allow-ips).
    # Empty means uvicorn default (127.0.0.1). Set to your load balancer in production.
    forwarded_allow_ips: str = ""
    # Tests only: allow in-memory SQLite while exercising other production guards.
    relax_production_db_check: bool = False

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def is_production(self) -> bool:
        return self.env == "production"

    @model_validator(mode="after")
    def _production_guards(self) -> Self:
        if not self.is_production:
            return self
        url = self.database_url.lower()
        if url.startswith("sqlite") and not self.relax_production_db_check:
            raise ValueError(
                "ENV=production refuses SQLite. Set DATABASE_URL to PostgreSQL "
                "(postgresql+psycopg://...)."
            )
        if not self.cors_origin_list:
            raise ValueError("ENV=production requires CORS_ORIGINS (your website origin).")
        if any(o == "*" for o in self.cors_origin_list):
            raise ValueError("ENV=production refuses CORS_ORIGINS=*")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
