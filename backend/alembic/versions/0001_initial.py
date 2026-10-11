"""initial schema

Revision ID: 0001
Revises:
"""
import sqlalchemy as sa
from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "geographies",
        sa.Column("pcode", sa.String(16), primary_key=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("level", sa.String(10), nullable=False),
        sa.Column("parent_pcode", sa.String(16), sa.ForeignKey("geographies.pcode", ondelete="RESTRICT")),
        sa.CheckConstraint("level IN ('state','county')", name="ck_geo_level"),
    )
    op.create_index("ix_geographies_level", "geographies", ["level"])
    op.create_index("ix_geographies_parent_pcode", "geographies", ["parent_pcode"])

    op.create_table(
        "model_versions",
        sa.Column("version", sa.String(32), primary_key=True),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    # Exactly one active model at a time (partial unique index; supported by Postgres and SQLite).
    op.create_index("uq_one_active_model", "model_versions", ["is_active"], unique=True,
                    postgresql_where=sa.text("is_active"), sqlite_where=sa.text("is_active"))

    op.create_table(
        "forecasts",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("county_pcode", sa.String(16), sa.ForeignKey("geographies.pcode"), nullable=False),
        sa.Column("period", sa.String(7), nullable=False),
        sa.Column("model_version", sa.String(32), sa.ForeignKey("model_versions.version"), nullable=False),
        sa.Column("risk_probability", sa.Float, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("county_pcode", "period", "model_version", name="uq_forecast"),
        sa.CheckConstraint("risk_probability >= 0 AND risk_probability <= 1", name="ck_probability"),
        sa.CheckConstraint("length(period) = 7", name="ck_period_len"),
    )
    op.create_index("ix_forecasts_county_pcode", "forecasts", ["county_pcode"])
    op.create_index("ix_forecast_period_model", "forecasts", ["period", "model_version"])


def downgrade() -> None:
    op.drop_table("forecasts")
    op.drop_table("model_versions")
    op.drop_table("geographies")
