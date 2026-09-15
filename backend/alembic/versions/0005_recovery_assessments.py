"""Persist explainable recovery-intelligence assessments."""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0005_recovery_assessments"
down_revision = "0004_immutable_media_provenance"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "recovery_assessments",
        sa.Column("id", sa.String(length=120), primary_key=True),
        sa.Column("tenant_id", sa.String(length=120), nullable=False),
        sa.Column("case_id", sa.String(length=120), nullable=False),
        sa.Column("recoverable_quantum_zar", sa.Float(), nullable=False),
        sa.Column("liability_confidence", sa.Float(), nullable=False),
        sa.Column("recovery_probability", sa.Float(), nullable=False),
        sa.Column("evidence_confidence", sa.Float(), nullable=False),
        sa.Column("expected_gross_recovery_zar", sa.Float(), nullable=False),
        sa.Column("expected_net_recovery_zar", sa.Float(), nullable=False),
        sa.Column("evidence_score", sa.Float(), nullable=False),
        sa.Column("recommended_action", sa.String(length=40), nullable=False),
        sa.Column("decision_reason", sa.Text(), nullable=False),
        sa.Column("risk_flags_json", sa.Text(), nullable=False),
        sa.Column("model_version", sa.String(length=80), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_recovery_assessments_tenant_net", "recovery_assessments", ["tenant_id", "expected_net_recovery_zar"])
    op.create_index("ix_recovery_assessments_case_created", "recovery_assessments", ["case_id", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_recovery_assessments_case_created", table_name="recovery_assessments")
    op.drop_index("ix_recovery_assessments_tenant_net", table_name="recovery_assessments")
    op.drop_table("recovery_assessments")
