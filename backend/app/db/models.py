from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Geography(Base):
    """States and counties. `pcode` is the stable join key used everywhere."""

    __tablename__ = "geographies"
    __table_args__ = (CheckConstraint("level IN ('state','county')", name="ck_geo_level"),)

    pcode: Mapped[str] = mapped_column(String(16), primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    level: Mapped[str] = mapped_column(String(10), index=True)
    parent_pcode: Mapped[str | None] = mapped_column(
        ForeignKey("geographies.pcode", ondelete="RESTRICT"), index=True
    )


class ModelVersion(Base):
    __tablename__ = "model_versions"

    version: Mapped[str] = mapped_column(String(32), primary_key=True)
    is_active: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Forecast(Base):
    __tablename__ = "forecasts"
    __table_args__ = (
        UniqueConstraint("county_pcode", "period", "model_version", name="uq_forecast"),
        CheckConstraint("risk_probability >= 0 AND risk_probability <= 1", name="ck_probability"),
        CheckConstraint("length(period) = 7", name="ck_period_len"),
        Index("ix_forecast_period_model", "period", "model_version"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    county_pcode: Mapped[str] = mapped_column(ForeignKey("geographies.pcode"), index=True)
    period: Mapped[str] = mapped_column(String(7))  # YYYY-MM
    model_version: Mapped[str] = mapped_column(ForeignKey("model_versions.version"))
    risk_probability: Mapped[float] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Observation(Base):
    """Inputs available when forecasting `period` for a county (the preview's county facts)."""

    __tablename__ = "observations"
    __table_args__ = (
        UniqueConstraint("county_pcode", "period", name="uq_observation"),
        CheckConstraint("prior_ipc_phase BETWEEN 1 AND 5", name="ck_obs_phase"),
        CheckConstraint("phase3plus_pct BETWEEN 0 AND 100", name="ck_obs_pct"),
        CheckConstraint("length(period) = 7", name="ck_obs_period_len"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    county_pcode: Mapped[str] = mapped_column(ForeignKey("geographies.pcode"), index=True)
    period: Mapped[str] = mapped_column(String(7))
    population: Mapped[int] = mapped_column(Integer)
    prior_ipc_phase: Mapped[int] = mapped_column(Integer)
    phase3plus_pct: Mapped[float] = mapped_column(Float)
    cereal_production_t: Mapped[float] = mapped_column(Float)
    cereal_gap_t: Mapped[float] = mapped_column(Float)


class Prediction(Base):
    """Audit log of scenario predictions: who asked what, and what the model said."""

    __tablename__ = "predictions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    model_version: Mapped[str] = mapped_column(String(32))
    county_pcode: Mapped[str] = mapped_column(ForeignKey("geographies.pcode"), index=True)
    inputs: Mapped[str] = mapped_column(Text)  # JSON
    risk_probability: Mapped[float] = mapped_column(Float)
    sensitivity_probability: Mapped[float] = mapped_column(Float)
    risk_band: Mapped[str] = mapped_column(String(10))
