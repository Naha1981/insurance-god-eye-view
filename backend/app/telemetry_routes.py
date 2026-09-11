from __future__ import annotations

import hashlib
import os
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from . import auth, storage, telemetry_import, telemetry_provenance

MAX_IMPORT_BYTES = int(os.getenv("CLAIMTRACE_MAX_TELEMETRY_IMPORT_BYTES", os.getenv("CLAIMTRACE_MAX_UPLOAD_BYTES", str(25 * 1024 * 1024))))
router = APIRouter()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _audit(principal: auth.Principal, action: str, case_id: str, evidence_id: str | None, metadata: dict) -> None:
    storage.insert_audit_event({
        "id": f"AUD-{uuid4()}",
        "tenant_id": principal.tenant_id,
        "actor_user_id": principal.user_id,
        "action": action,
        "resource_type": "CASE",
        "resource_id": case_id,
        "metadata": {**metadata, "evidence_id": evidence_id} if evidence_id else metadata,
        "created_at": _now(),
    })


@router.post("/v1/cases/{case_id}/telemetry/import")
async def import_telemetry_csv(
    case_id: str,
    source_timezone: str = Form("Africa/Johannesburg"),
    source: str = Form("GPS_UPLOAD"),
    file: UploadFile = File(...),
    principal: auth.Principal = Depends(auth.get_current_principal),
) -> dict:
    if storage.get_case(case_id, principal.tenant_id) is None:
        raise HTTPException(status_code=404, detail="Case not found")

    filename = Path(file.filename or "telemetry.csv").name or "telemetry.csv"
    if not filename.lower().endswith(".csv"):
        raise HTTPException(status_code=415, detail="Telemetry import requires a CSV file")

    content = await file.read(MAX_IMPORT_BYTES + 1)
    if len(content) > MAX_IMPORT_BYTES:
        raise HTTPException(status_code=413, detail=f"Telemetry import exceeds {MAX_IMPORT_BYTES} byte upload limit")
    if not content:
        raise HTTPException(status_code=400, detail="Telemetry file is empty")

    try:
        parsed = telemetry_import.parse_csv(content, source_timezone)
    except telemetry_import.TelemetryImportError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    sha256 = hashlib.sha256(content).hexdigest()
    if storage.evidence_hash_exists(sha256, principal.tenant_id):
        raise HTTPException(status_code=409, detail="Telemetry evidence with this SHA-256 hash is already registered")

    evidence_id = f"E-{uuid4()}"
    ingested_at = _now()
    artifact_key = f"{principal.tenant_id}/{case_id}/{evidence_id}/{filename}"
    custody = [{
        "action": "INGESTED",
        "timestamp": ingested_at,
        "actor": "CLAIMTRACE-API",
        "note": "Telemetry source file stored unchanged; normalized points are derived records linked back to this evidence artifact.",
    }]
    storage.insert_evidence({
        "id": evidence_id,
        "tenant_id": principal.tenant_id,
        "case_id": case_id,
        "type": "GPS",
        "source": source,
        "source_ref": filename,
        "artifact_key": artifact_key,
        "artifact_bytes": content,
        "sha256": sha256,
        "captured_at": None,
        "ingested_at": ingested_at,
        "media_type": "text/csv",
        "size_bytes": len(content),
        "chain_of_custody": custody,
    })

    point_rows = []
    for point in parsed.points:
        point_rows.append({
            "id": f"GPS-{uuid4()}",
            "tenant_id": principal.tenant_id,
            "case_id": case_id,
            "timestamp_utc": datetime.fromisoformat(point["timestamp_utc"].replace("Z", "+00:00")),
            "timestamp_local": point["timestamp_local"],
            "source_timezone": point["source_timezone"],
            "assumed_timezone": int(point["assumed_timezone"]),
            "lat": point["lat"],
            "lon": point["lon"],
            "speed_kph": point.get("speed_kph"),
            "heading_deg": point.get("heading_deg"),
            "accuracy_meters": point.get("accuracy_meters"),
            "vehicle_id": point.get("vehicle_id"),
            "segment_distance_meters": point.get("segment_distance_meters"),
            "elapsed_seconds": point.get("elapsed_seconds"),
            "derived_speed_kph": point.get("derived_speed_kph"),
            "created_at": ingested_at,
        })

    storage.insert_telemetry_points(point_rows)
    telemetry_provenance.link_points(
        tenant_id=principal.tenant_id,
        case_id=case_id,
        evidence_id=evidence_id,
        point_ids=[row["id"] for row in point_rows],
        linked_at=ingested_at,
    )

    first = parsed.points[0]["timestamp_utc"]
    last = parsed.points[-1]["timestamp_utc"]
    total_distance = round(sum(point.get("segment_distance_meters") or 0 for point in parsed.points), 2)
    _audit(principal, "TELEMETRY_IMPORTED", case_id, evidence_id, {
        "point_count": len(point_rows),
        "rejected_rows": parsed.rejected_rows,
        "source_timezone": parsed.source_timezone,
        "first_timestamp_utc": first,
        "last_timestamp_utc": last,
        "total_distance_meters": total_distance,
    })

    return {
        "case_id": case_id,
        "evidence_id": evidence_id,
        "sha256": sha256,
        "filename": filename,
        "point_count": len(point_rows),
        "rejected_rows": parsed.rejected_rows,
        "source_timezone": parsed.source_timezone,
        "first_timestamp_utc": first,
        "last_timestamp_utc": last,
        "total_distance_meters": total_distance,
    }


@router.get("/v1/cases/{case_id}/telemetry/provenance")
def list_telemetry_provenance(case_id: str, principal: auth.Principal = Depends(auth.get_current_principal)) -> list[dict]:
    if storage.get_case(case_id, principal.tenant_id) is None:
        raise HTTPException(status_code=404, detail="Case not found")
    return telemetry_provenance.list_case_links(case_id, principal.tenant_id)


@router.post("/v1/cases/{case_id}/evidence/{evidence_id}/frame-reference")
def create_frame_reference(
    case_id: str,
    evidence_id: str,
    payload: dict,
    principal: auth.Principal = Depends(auth.get_current_principal),
) -> dict:
    if storage.get_case(case_id, principal.tenant_id) is None:
        raise HTTPException(status_code=404, detail="Case not found")
    evidence = next((item for item in storage.list_evidence(case_id, principal.tenant_id) if item["id"] == evidence_id), None)
    if evidence is None:
        raise HTTPException(status_code=404, detail="Evidence not found")
    if evidence["type"] not in {"DASHCAM", "CCTV"} or not str(evidence.get("media_type") or "").startswith("video/"):
        raise HTTPException(status_code=422, detail="Frame references require a DASHCAM or CCTV video evidence artifact")

    try:
        frame_index = int(payload.get("frame_index"))
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=422, detail="frame_index must be a non-negative integer") from exc
    if frame_index < 0:
        raise HTTPException(status_code=422, detail="frame_index must be a non-negative integer")

    timestamp_value = payload.get("timestamp")
    try:
        timestamp = datetime.fromisoformat(str(timestamp_value).replace("Z", "+00:00"))
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=422, detail="timestamp must be ISO-8601") from exc
    if timestamp.tzinfo is None:
        raise HTTPException(status_code=422, detail="timestamp must include a timezone")
    timestamp = timestamp.astimezone(timezone.utc)

    nearest_id = payload.get("nearest_telemetry_point_id")
    if nearest_id:
        telemetry = storage.list_telemetry_points(case_id, principal.tenant_id)
        if not any(point["id"] == nearest_id for point in telemetry):
            raise HTTPException(status_code=422, detail="nearest_telemetry_point_id is not part of this case")

    reference_id = f"FRAME-{uuid4()}"
    created_at = _now()
    metadata = {
        "frame_reference_id": reference_id,
        "frame_index": frame_index,
        "timestamp_utc": timestamp.isoformat().replace("+00:00", "Z"),
        "nearest_telemetry_point_id": nearest_id,
        "note": payload.get("note"),
    }
    _audit(principal, "FRAME_REFERENCE_CREATED", case_id, evidence_id, metadata)
    return {
        "id": reference_id,
        "case_id": case_id,
        "evidence_id": evidence_id,
        "frame_index": frame_index,
        "timestamp": metadata["timestamp_utc"],
        "nearest_telemetry_point_id": nearest_id,
        "created_at": created_at.isoformat().replace("+00:00", "Z"),
    }
