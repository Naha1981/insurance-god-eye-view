from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import text

from . import object_storage, storage


def _now() -> datetime:
    return datetime.now(timezone.utc)


def insert_frame_artifact(*, tenant_id: str, case_id: str, evidence_id: str, frame_index: int, timestamp_utc: datetime, sha256: str, media_type: str, size_bytes: int, artifact_bytes: bytes, provenance: dict | None = None, created_at: datetime | None = None) -> dict:
    created_at = created_at or _now()
    frame_id = f"FRM-{uuid4()}"
    artifact_key = f"{tenant_id}/{case_id}/frames/{frame_id}.png"
    object_storage.put_bytes(key=artifact_key, content=artifact_bytes, media_type=media_type)
    statement = text(
        "INSERT INTO frame_artifacts "
        "(id, tenant_id, case_id, evidence_id, frame_index, timestamp_utc, sha256, media_type, size_bytes, artifact_key, artifact_bytes, provenance_json, created_at) "
        "VALUES (:id, :tenant_id, :case_id, :evidence_id, :frame_index, :timestamp_utc, :sha256, :media_type, :size_bytes, :artifact_key, NULL, :provenance_json, :created_at)"
    )
    import json
    with storage.engine().begin() as connection:
        connection.execute(statement, {
            "id": frame_id, "tenant_id": tenant_id, "case_id": case_id, "evidence_id": evidence_id,
            "frame_index": frame_index, "timestamp_utc": timestamp_utc, "sha256": sha256,
            "media_type": media_type, "size_bytes": size_bytes, "artifact_key": artifact_key,
            "provenance_json": json.dumps(provenance or {}, separators=(",", ":")), "created_at": created_at,
        })
    return {"id": frame_id, "case_id": case_id, "evidence_id": evidence_id, "frame_index": frame_index, "timestamp_utc": timestamp_utc, "sha256": sha256, "media_type": media_type, "size_bytes": size_bytes, "artifact_key": artifact_key, "provenance": provenance or {}, "created_at": created_at}


def list_case_frame_artifacts(case_id: str, tenant_id: str) -> list[dict]:
    statement = text(
        "SELECT id, case_id, evidence_id, frame_index, timestamp_utc, sha256, media_type, size_bytes, artifact_key, provenance_json, created_at "
        "FROM frame_artifacts WHERE case_id = :case_id AND tenant_id = :tenant_id ORDER BY timestamp_utc ASC, frame_index ASC"
    )
    import json
    with storage.connect() as connection:
        rows = connection.execute(statement, {"case_id": case_id, "tenant_id": tenant_id}).mappings().all()
    return [{**dict(row), "provenance": json.loads(row["provenance_json"] or "{}"), "provenance_json": None} for row in rows]


def get_frame_bytes(case_id: str, tenant_id: str, frame_id: str) -> tuple[bytes, str] | None:
    statement = text("SELECT artifact_key, artifact_bytes, media_type FROM frame_artifacts WHERE id = :frame_id AND case_id = :case_id AND tenant_id = :tenant_id")
    with storage.connect() as connection:
        row = connection.execute(statement, {"frame_id": frame_id, "case_id": case_id, "tenant_id": tenant_id}).first()
    if not row: return None
    if row.artifact_bytes is not None: return bytes(row.artifact_bytes), row.media_type or "image/png"
    if not row.artifact_key: return None
    try:
        return object_storage.get_bytes(key=row.artifact_key), row.media_type or "image/png"
    except (FileNotFoundError, object_storage.ObjectStorageError):
        return None
