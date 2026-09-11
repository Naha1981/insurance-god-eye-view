from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from sqlalchemy import text

from . import storage


def link_points(*, tenant_id: str, case_id: str, evidence_id: str, point_ids: list[str], linked_at: datetime | None = None) -> None:
    if not point_ids:
        return
    linked_at = linked_at or datetime.now(timezone.utc)
    rows = [
        {
            "id": f"TEL-LINK-{uuid4()}",
            "tenant_id": tenant_id,
            "case_id": case_id,
            "telemetry_point_id": point_id,
            "evidence_id": evidence_id,
            "linked_at": linked_at,
        }
        for point_id in point_ids
    ]
    statement = text(
        "INSERT INTO telemetry_evidence_links "
        "(id, tenant_id, case_id, telemetry_point_id, evidence_id, linked_at) "
        "VALUES (:id, :tenant_id, :case_id, :telemetry_point_id, :evidence_id, :linked_at)"
    )
    with storage.engine().begin() as connection:
        connection.execute(statement, rows)


def list_case_links(case_id: str, tenant_id: str) -> list[dict[str, Any]]:
    statement = text(
        "SELECT id, case_id, telemetry_point_id, evidence_id, linked_at "
        "FROM telemetry_evidence_links "
        "WHERE case_id = :case_id AND tenant_id = :tenant_id "
        "ORDER BY linked_at ASC, telemetry_point_id ASC"
    )
    with storage.connect() as connection:
        rows = connection.execute(statement, {"case_id": case_id, "tenant_id": tenant_id}).mappings().all()
    return [dict(row) for row in rows]
