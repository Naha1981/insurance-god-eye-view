"""Move derived frame storage to immutable object references and add provenance."""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0004_immutable_media_provenance"
down_revision = "0003_frame_artifacts"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("frame_artifacts") as batch:
        batch.add_column(sa.Column("artifact_key", sa.String(length=700), nullable=True))
        batch.add_column(sa.Column("provenance_json", sa.Text(), nullable=True))
        batch.alter_column("artifact_bytes", existing_type=sa.LargeBinary(), nullable=True)


def downgrade() -> None:
    with op.batch_alter_table("frame_artifacts") as batch:
        batch.drop_column("provenance_json")
        batch.drop_column("artifact_key")
