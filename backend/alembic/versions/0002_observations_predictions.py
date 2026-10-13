"""observations and predictions

Revision ID: 0002
Revises: 0001
"""
import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "observations",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("county_pcode", sa.String(16), sa.ForeignKey("geographies.pcode"), nullable=False),
        sa.Column("period", sa.String(7), nullable=False),
        sa.Column("population", sa.Integer, nullable=False),
        sa.Column("prior_ipc_phase", sa.Integer, nullable=False),
        sa.Column("phase3plus_pct", sa.Float, nullable=False),
        sa.Column("cereal_production_t", sa.Float, nullable=False),
        sa.Column("cereal_gap_t", sa.Float, nullable=False),
        sa.UniqueConstraint("county_pcode", "period", name="uq_observation"),
        sa.CheckConstraint("prior_ipc_phase BETWEEN 1 AND 5", name="ck_obs_phase"),
        sa.CheckConstraint("phase3plus_pct BETWEEN 0 AND 100", name="ck_obs_pct"),
        sa.CheckConstraint("length(period) = 7", name="ck_obs_period_len"),
    )
    op.create_index("ix_observations_county_pcode", "observations", ["county_pcode"])

    op.create_table(
        "predictions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("model_version", sa.String(32), nullable=False),
        sa.Column("county_pcode", sa.String(16), sa.ForeignKey("geographies.pcode"), nullable=False),
        sa.Column("inputs", sa.Text, nullable=False),
        sa.Column("risk_probability", sa.Float, nullable=False),
        sa.Column("sensitivity_probability", sa.Float, nullable=False),
        sa.Column("risk_band", sa.String(10), nullable=False),
    )
    op.create_index("ix_predictions_county_pcode", "predictions", ["county_pcode"])


def downgrade() -> None:
    op.drop_table("predictions")
    op.drop_table("observations")
