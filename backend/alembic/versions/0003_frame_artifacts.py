"""Store derived video frame artifacts linked to source evidence."""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0003_frame_artifacts"
down_revision = "0002_telemetry_evidence_provenance"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "frame_artifacts",
        sa.Column("id", sa.String(length=120), primary_key=True),
        sa.Column("tenant_id", sa.String(length=120), nullable=False),
        sa.Column("case_id", sa.String(length=120), nullable=False),
        sa.Column("evidence_id", sa.String(length=120), nullable=False),
        sa.Column("frame_index", sa.Integer(), nullable=False),
        sa.Column("timestamp_utc", sa.DateTime(timezone=True), nullable=False),
        sa.Column("sha256", sa.String(length=64), nullable=False),
        sa.Column("media_type", sa.String(length=120), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("artifact_bytes", sa.LargeBinary(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("frame_artifacts")
