from __future__ import annotations

import hashlib
import os
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response

from . import auth, frame_artifacts, storage, object_storage

MAX_FRAME_BYTES = int(os.getenv("CLAIMTRACE_MAX_FRAME_BYTES", str(2 * 1024 * 1024)))
router = APIRouter()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _audit(principal: auth.Principal, action: str, case_id: str, resource_id: str, metadata: dict) -> None:
    storage.insert_audit_event({"id": f"AUD-{uuid4()}", "tenant_id": principal.tenant_id, "actor_user_id": principal.user_id, "action": action, "resource_type": "FRAME_ARTIFACT", "resource_id": resource_id, "metadata": {"case_id": case_id, **metadata}, "created_at": _now()})


def _video_evidence(case_id: str, tenant_id: str, evidence_id: str) -> dict:
    evidence = next((item for item in storage.list_evidence(case_id, tenant_id) if item["id"] == evidence_id), None)
    if evidence is None: raise HTTPException(status_code=404, detail="Source video evidence not found")
    if evidence["type"] not in {"DASHCAM", "CCTV"} or not str(evidence.get("media_type") or "").startswith("video/"):
        raise HTTPException(status_code=422, detail="Frame artifact source must be DASHCAM or CCTV video evidence")
    return evidence


def _persist_png(principal: auth.Principal, case_id: str, evidence_id: str, content: bytes, frame_index: int, timestamp_utc: datetime, provenance: dict) -> dict:
    if len(content) > MAX_FRAME_BYTES: raise HTTPException(status_code=413, detail=f"Frame artifact exceeds {MAX_FRAME_BYTES} bytes")
    if not content.startswith(b"\x89PNG\r\n\x1a\n"): raise HTTPException(status_code=415, detail="Frame artifact must be a PNG image")
    sha256 = hashlib.sha256(content).hexdigest()
    if any(item["sha256"] == sha256 for item in frame_artifacts.list_case_frame_artifacts(case_id, principal.tenant_id)):
        raise HTTPException(status_code=409, detail="Frame artifact with this SHA-256 already exists")
    record = frame_artifacts.insert_frame_artifact(tenant_id=principal.tenant_id, case_id=case_id, evidence_id=evidence_id, frame_index=frame_index, timestamp_utc=timestamp_utc.astimezone(timezone.utc), sha256=sha256, media_type="image/png", size_bytes=len(content), artifact_bytes=content, provenance=provenance)
    _audit(principal, "FRAME_ARTIFACT_CREATED", case_id, record["id"], {"evidence_id": evidence_id, "frame_index": frame_index, "timestamp_utc": record["timestamp_utc"].isoformat(), "sha256": sha256, "size_bytes": len(content), "provenance": provenance})
    return record


@router.post("/v1/cases/{case_id}/frame-artifacts")
async def create_frame_artifact(case_id: str, evidence_id: str = Form(...), frame_index: int = Form(...), timestamp_utc: datetime = Form(...), file: UploadFile = File(...), principal: auth.Principal = Depends(auth.get_current_principal)) -> dict:
    if storage.get_case(case_id, principal.tenant_id) is None: raise HTTPException(status_code=404, detail="Case not found")
    if frame_index < 0: raise HTTPException(status_code=422, detail="frame_index must be non-negative")
    if timestamp_utc.tzinfo is None: raise HTTPException(status_code=422, detail="timestamp_utc must include a timezone")
    _video_evidence(case_id, principal.tenant_id, evidence_id)
    content = await file.read(MAX_FRAME_BYTES + 1)
    if not content: raise HTTPException(status_code=400, detail="Frame artifact is empty")
    return _persist_png(principal, case_id, evidence_id, content, frame_index, timestamp_utc, {"method": "browser-upload"})


@router.post("/v1/cases/{case_id}/frame-artifacts/extract")
def extract_frame_from_video(case_id: str, evidence_id: str, timestamp_seconds: float, frame_index: int = 0, principal: auth.Principal = Depends(auth.get_current_principal)) -> dict:
    if timestamp_seconds < 0: raise HTTPException(status_code=422, detail="timestamp_seconds must be non-negative")
    if frame_index < 0: raise HTTPException(status_code=422, detail="frame_index must be non-negative")
    evidence = _video_evidence(case_id, principal.tenant_id, evidence_id)
    artifact = storage.get_evidence_artifact(principal.tenant_id, case_id, evidence_id)
    if artifact is None: raise HTTPException(status_code=404, detail="Source video artifact not available")
    _, content, media_type = artifact
    if not media_type or not media_type.startswith("video/"): raise HTTPException(status_code=422, detail="Source evidence is not a video")
    with tempfile.TemporaryDirectory(prefix="claimtrace-ffmpeg-") as tmp:
        src = Path(tmp) / "source.bin"; out = Path(tmp) / "frame.png"
        src.write_bytes(content)
        cmd = [os.getenv("CLAIMTRACE_FFMPEG_BIN", "ffmpeg"), "-hide_banner", "-loglevel", "error", "-ss", f"{timestamp_seconds:.6f}", "-i", str(src), "-frames:v", "1", "-f", "image2", str(out)]
        try:
            result = subprocess.run(cmd, check=False, capture_output=True, text=True, timeout=float(os.getenv("CLAIMTRACE_FFMPEG_TIMEOUT_SECONDS", "30")))
        except (FileNotFoundError, subprocess.TimeoutExpired) as exc:
            raise HTTPException(status_code=503, detail="FFmpeg server-side frame extraction is unavailable") from exc
        if result.returncode != 0 or not out.exists():
            raise HTTPException(status_code=422, detail=f"FFmpeg frame extraction failed: {result.stderr[-500:]}")
        png = out.read_bytes()
    return _persist_png(principal, case_id, evidence_id, png, frame_index, _now(), {"method": "ffmpeg", "source_evidence_id": evidence_id, "timestamp_seconds": timestamp_seconds, "source_sha256": evidence["sha256"], "command": "ffmpeg -ss <timestamp> -i <source> -frames:v 1"})


@router.get("/v1/cases/{case_id}/frame-artifacts")
def list_frame_artifacts(case_id: str, principal: auth.Principal = Depends(auth.get_current_principal)) -> list[dict]:
    if storage.get_case(case_id, principal.tenant_id) is None: raise HTTPException(status_code=404, detail="Case not found")
    return frame_artifacts.list_case_frame_artifacts(case_id, principal.tenant_id)


@router.get("/v1/cases/{case_id}/frame-artifacts/{frame_id}")
def get_frame_artifact(case_id: str, frame_id: str, principal: auth.Principal = Depends(auth.get_current_principal)) -> Response:
    artifact = frame_artifacts.get_frame_bytes(case_id, principal.tenant_id, frame_id)
    if artifact is None: raise HTTPException(status_code=404, detail="Frame artifact not found")
    _audit(principal, "FRAME_ARTIFACT_VIEWED", case_id, frame_id, {})
    return Response(content=artifact[0], media_type=artifact[1])
