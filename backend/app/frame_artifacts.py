from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from . import storage
from sqlalchemy import text


def _now() -> datetime:
    return datetime.now(timezone.utc)


def insert_frame_artifact(*, tenant_id: str, case_id: str, evidence_id: str, frame_index: int, timestamp_utc: datetime, sha256: str, media_type: str, size_bytes: int, artifact_bytes: bytes, created_at: datetime | None = None) -> dict:
    created_at = created_at or _now()
    frame_id = f"FRM-{uuid4()}"
    statement = text(
        "INSERT INTO frame_artifacts "
        "(id, tenant_id, case_id, evidence_id, frame_index, timestamp_utc, sha256, media_type, size_bytes, artifact_bytes, created_at) "
        "VALUES (:id, :tenant_id, :case_id, :evidence_id, :frame_index, :timestamp_utc, :sha256, :media_type, :size_bytes, :artifact_bytes, :created_at)"
    )
    with storage.engine().begin() as connection:
        connection.execute(statement, {
            "id": frame_id,
            "tenant_id": tenant_id,
            "case_id": case_id,
            "evidence_id": evidence_id,
            "frame_index": frame_index,
            "timestamp_utc": timestamp_utc,
            "sha256": sha256,
            "media_type": media_type,
            "size_bytes": size_bytes,
            "artifact_bytes": artifact_bytes,
            "created_at": created_at,
        })
    return {"id": frame_id, "case_id": case_id, "evidence_id": evidence_id, "frame_index": frame_index, "timestamp_utc": timestamp_utc, "sha256": sha256, "media_type": media_type, "size_bytes": size_bytes, "created_at": created_at}


def list_case_frame_artifacts(case_id: str, tenant_id: str) -> list[dict]:
    statement = text(
        "SELECT id, case_id, evidence_id, frame_index, timestamp_utc, sha256, media_type, size_bytes, created_at "
        "FROM frame_artifacts WHERE case_id = :case_id AND tenant_id = :tenant_id "
        "ORDER BY timestamp_utc ASC, frame_index ASC"
    )
    with storage.connect() as connection:
        rows = connection.execute(statement, {"case_id": case_id, "tenant_id": tenant_id}).mappings().all()
    return [dict(row) for row in rows]
