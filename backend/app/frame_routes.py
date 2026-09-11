from __future__ import annotations

import hashlib
import os
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response

from . import auth, frame_artifacts, storage

MAX_FRAME_BYTES = int(os.getenv("CLAIMTRACE_MAX_FRAME_BYTES", str(2 * 1024 * 1024)))
router = APIRouter()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _audit(principal: auth.Principal, action: str, case_id: str, resource_id: str, metadata: dict) -> None:
    storage.insert_audit_event({
        "id": f"AUD-{uuid4()}",
        "tenant_id": principal.tenant_id,
        "actor_user_id": principal.user_id,
        "action": action,
        "resource_type": "FRAME_ARTIFACT",
        "resource_id": resource_id,
        "metadata": {"case_id": case_id, **metadata},
        "created_at": _now(),
    })


@router.post("/v1/cases/{case_id}/frame-artifacts")
async def create_frame_artifact(
    case_id: str,
    evidence_id: str = Form(...),
    frame_index: int = Form(...),
    timestamp_utc: datetime = Form(...),
    file: UploadFile = File(...),
    principal: auth.Principal = Depends(auth.get_current_principal),
) -> dict:
    if storage.get_case(case_id, principal.tenant_id) is None:
        raise HTTPException(status_code=404, detail="Case not found")
    if frame_index < 0:
        raise HTTPException(status_code=422, detail="frame_index must be non-negative")
    if timestamp_utc.tzinfo is None:
        raise HTTPException(status_code=422, detail="timestamp_utc must include a timezone")
    evidence = next((item for item in storage.list_evidence(case_id, principal.tenant_id) if item["id"] == evidence_id), None)
    if evidence is None:
        raise HTTPException(status_code=404, detail="Source video evidence not found")
    if evidence["type"] not in {"DASHCAM", "CCTV"} or not str(evidence.get("media_type") or "").startswith("video/"):
        raise HTTPException(status_code=422, detail="Frame artifact source must be DASHCAM or CCTV video evidence")

    content = await file.read(MAX_FRAME_BYTES + 1)
    if len(content) > MAX_FRAME_BYTES:
        raise HTTPException(status_code=413, detail=f"Frame artifact exceeds {MAX_FRAME_BYTES} bytes")
    if not content:
        raise HTTPException(status_code=400, detail="Frame artifact is empty")
    if content[:8] != b"\x89PNG\r\n\x1a\n":
        raise HTTPException(status_code=415, detail="Frame artifact must be a PNG image")

    sha256 = hashlib.sha256(content).hexdigest()
    existing = next((item for item in frame_artifacts.list_case_frame_artifacts(case_id, principal.tenant_id) if item["sha256"] == sha256), None)
    if existing:
        raise HTTPException(status_code=409, detail="Frame artifact with this SHA-256 already exists")

    record = frame_artifacts.insert_frame_artifact(
        tenant_id=principal.tenant_id,
        case_id=case_id,
        evidence_id=evidence_id,
        frame_index=frame_index,
        timestamp_utc=timestamp_utc.astimezone(timezone.utc),
        sha256=sha256,
        media_type="image/png",
        size_bytes=len(content),
        artifact_bytes=content,
    )
    _audit(principal, "FRAME_ARTIFACT_CREATED", case_id, record["id"], {
        "evidence_id": evidence_id,
        "frame_index": frame_index,
        "timestamp_utc": record["timestamp_utc"].isoformat(),
        "sha256": sha256,
        "size_bytes": len(content),
    })
    return record


@router.get("/v1/cases/{case_id}/frame-artifacts")
def list_frame_artifacts(case_id: str, principal: auth.Principal = Depends(auth.get_current_principal)) -> list[dict]:
    if storage.get_case(case_id, principal.tenant_id) is None:
        raise HTTPException(status_code=404, detail="Case not found")
    return frame_artifacts.list_case_frame_artifacts(case_id, principal.tenant_id)


@router.get("/v1/cases/{case_id}/frame-artifacts/{frame_id}")
def get_frame_artifact(case_id: str, frame_id: str, principal: auth.Principal = Depends(auth.get_current_principal)) -> Response:
    statement = storage.text(
        "SELECT artifact_bytes, media_type FROM frame_artifacts WHERE id = :frame_id AND case_id = :case_id AND tenant_id = :tenant_id"
    )
    with storage.connect() as connection:
        row = connection.execute(statement, {"frame_id": frame_id, "case_id": case_id, "tenant_id": principal.tenant_id}).first()
    if not row:
        raise HTTPException(status_code=404, detail="Frame artifact not found")
    _audit(principal, "FRAME_ARTIFACT_VIEWED", case_id, frame_id, {})
    return Response(content=bytes(row.artifact_bytes), media_type=row.media_type or "image/png")
