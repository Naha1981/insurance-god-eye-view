"""ClaimTrace baseline schema.

This first migration intentionally mirrors the current SQLAlchemy metadata and
uses check-first creation so an existing pilot database can be stamped/upgraded
without attempting destructive recreation. Future schema changes should use
normal explicit Alembic operations.
"""

from __future__ import annotations

from alembic import op
from app.storage import metadata

revision = "0001_claimtrace_baseline"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    metadata.create_all(bind=bind, checkfirst=True)


def downgrade() -> None:
    # Baseline downgrades are intentionally non-destructive. Production rollback
    # must use an explicit migration for each schema change rather than dropping
    # the entire evidence database.
    pass
