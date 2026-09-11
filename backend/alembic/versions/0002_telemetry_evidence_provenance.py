"""Link telemetry points to the evidence artifact that produced them."""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0002_telemetry_evidence_provenance"
down_revision = "0001_claimtrace_baseline"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "telemetry_evidence_links",
        sa.Column("id", sa.String(length=120), primary_key=True),
        sa.Column("tenant_id", sa.String(length=120), nullable=False),
        sa.Column("case_id", sa.String(length=120), nullable=False),
        sa.Column("telemetry_point_id", sa.String(length=120), nullable=False, unique=True),
        sa.Column("evidence_id", sa.String(length=120), nullable=False),
        sa.Column("linked_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("telemetry_evidence_links")
