from __future__ import annotations

import hashlib
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Literal
from uuid import uuid4

from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel, ConfigDict, Field, field_validator

from . import auth, report, storage, video

SourceType = Literal[
    "DASHCAM", "CCTV", "PHOTO", "POLICE_REPORT", "TELEMATICS", "GPS",
    "EDR", "STATEMENT", "OTHER",
]

MAX_UPLOAD_BYTES = int(os.getenv("CLAIMTRACE_MAX_UPLOAD_BYTES", str(25 * 1024 * 1024)))


@asynccontextmanager
async def lifespan(_: FastAPI):
    storage.init_database()
    auth.ensure_bootstrap_user()
    yield


app = FastAPI(
    title="ClaimTrace Evidence API",
    version="0.7.0",
    description="Authenticated tenant-scoped case, evidence, telemetry and video metadata registry for physical-world claim investigations.",
    lifespan=lifespan,
)

cors_origins = [item.strip() for item in os.getenv("CLAIMTRACE_CORS_ORIGINS", "*").split(",") if item.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept"],
)


class CustodyEvent(BaseModel):
    model_config = ConfigDict(extra="forbid")
    action: str = Field(min_length=1)
    timestamp: datetime
    actor: str = Field(min_length=1)
    note: str | None = None


class EvidenceCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    type: SourceType
    source: str = Field(min_length=1, max_length=120)
    source_ref: str | None = Field(default=None, max_length=500)
    sha256: str = Field(pattern=r"^[a-fA-F0-9]{64}$")
    captured_at: datetime | None = None
    media_type: str | None = Field(default=None, max_length=120)
    size_bytes: int | None = Field(default=None, ge=0)


class Evidence(EvidenceCreate):
    id: str
    case_id: str
    artifact_path: str | None = None
    ingested_at: datetime
    chain_of_custody: list[CustodyEvent]


class Location(BaseModel):
    model_config = ConfigDict(extra="forbid")
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)


class CaseCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str = Field(min_length=1, max_length=240)
    incident_at: datetime | None = None
    location: Location | None = None

    @field_validator("incident_at")
    @classmethod
    def incident_time_is_timezone_aware(cls, value: datetime | None) -> datetime | None:
        if value is not None and value.tzinfo is None:
            raise ValueError("incident_at must include a timezone")
        return value


class Case(CaseCreate):
    id: str
    status: Literal["INVESTIGATION", "REVIEW", "CLOSED"] = "INVESTIGATION"
    created_at: datetime
    evidence_count: int = 0


class TelemetryPointCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    timestamp: datetime
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    timestamp_local: str = Field(min_length=1, max_length=80)
    source_timezone: str = Field(min_length=1, max_length=80)
    assumed_timezone: bool = False
    speed_kph: float | None = Field(default=None, ge=0)
    heading_deg: float | None = Field(default=None, ge=0, lt=360)
    accuracy_meters: float | None = Field(default=None, ge=0)
    vehicle_id: str | None = Field(default=None, max_length=160)
    segment_distance_meters: float | None = Field(default=None, ge=0)
    elapsed_seconds: float | None = Field(default=None, ge=0)
    derived_speed_kph: float | None = Field(default=None, ge=0)

    @field_validator("timestamp")
    @classmethod
    def timestamp_is_timezone_aware(cls, value: datetime) -> datetime:
        if value.tzinfo is None:
            raise ValueError("timestamp must include a timezone")
        return value


class TelemetryPoint(TelemetryPointCreate):
    id: str
    case_id: str
    created_at: datetime


class TelemetryBatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    points: list[TelemetryPointCreate] = Field(min_length=1, max_length=10000)


class VideoMetadataIngest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    duration_seconds: float | None = Field(default=None, ge=0)
    width: int | None = Field(default=None, ge=1)
    height: int | None = Field(default=None, ge=1)
    frame_rate: float | None = Field(default=None, gt=0)
    capture_start_at: datetime | None = None
    metadata_source: str = Field(default="BROWSER_MEDIA_ELEMENT", min_length=1, max_length=80)
    metadata_version: str = Field(default="1", min_length=1, max_length=40)

    @field_validator("capture_start_at")
    @classmethod
    def capture_start_is_timezone_aware(cls, value: datetime | None) -> datetime | None:
        if value is not None and value.tzinfo is None:
            raise ValueError("capture_start_at must include a timezone")
        return value


class LoginResponse(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in_hours: int
    user: auth.Principal


def now() -> datetime:
    return datetime.now(timezone.utc)


def normalize_case(case: dict) -> Case:
    return Case.model_validate(case)


def normalize_evidence(record: dict) -> Evidence:
    data = dict(record)
    if "artifact_key" in data:
        data["artifact_path"] = data.pop("artifact_key")
    return Evidence.model_validate(data)


def normalize_telemetry(record: dict) -> TelemetryPoint:
    data = dict(record)
    data["timestamp"] = data.pop("timestamp_utc")
    return TelemetryPoint.model_validate(data)


def audit(principal: auth.Principal, action: str, resource_type: str | None = None, resource_id: str | None = None, metadata: dict | None = None) -> None:
    storage.insert_audit_event({
        "id": f"AUD-{uuid4()}",
        "tenant_id": principal.tenant_id,
        "actor_user_id": principal.user_id,
        "action": action,
        "resource_type": resource_type,
        "resource_id": resource_id,
        "metadata": metadata,
        "created_at": now(),
    })


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "claimtrace-evidence-api", "version": "0.7.0"}


@app.post("/v1/auth/login", response_model=LoginResponse)
def login(payload: auth.LoginRequest) -> LoginResponse:
    result = auth.authenticate(payload.email, payload.password)
    if result is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
    principal, token = result
    audit(principal, "AUTH_LOGIN", "USER", principal.user_id)
    return LoginResponse(access_token=token, expires_in_hours=auth.SESSION_HOURS, user=principal)


@app.get("/v1/auth/me", response_model=auth.Principal)
def me(principal: auth.Principal = Depends(auth.get_current_principal)) -> auth.Principal:
    return principal


@app.get("/v1/cases", response_model=list[Case])
def list_cases(principal: auth.Principal = Depends(auth.get_current_principal)) -> list[Case]:
    cases = [normalize_case(item) for item in storage.list_cases(principal.tenant_id)]
    audit(principal, "CASES_LISTED", "TENANT", principal.tenant_id, {"count": len(cases)})
    return cases


@app.post("/v1/cases", response_model=Case, status_code=status.HTTP_201_CREATED)
def create_case(payload: CaseCreate, principal: auth.Principal = Depends(auth.get_current_principal)) -> Case:
    created_at = now()
    case_id = f"CLM-{uuid4()}"
    storage.insert_case({
        "id": case_id,
        "tenant_id": principal.tenant_id,
        "title": payload.title,
        "incident_at": payload.incident_at,
        "location_json": payload.location.model_dump_json() if payload.location else None,
        "status": "INVESTIGATION",
        "created_at": created_at,
    })
    case = normalize_case(storage.get_case(case_id, principal.tenant_id))
    audit(principal, "CASE_CREATED", "CASE", case_id, {"title": payload.title})
    return case


@app.get("/v1/cases/{case_id}", response_model=Case)
def get_case(case_id: str, principal: auth.Principal = Depends(auth.get_current_principal)) -> Case:
    case = storage.get_case(case_id, principal.tenant_id)
    if case is None:
        raise HTTPException(status_code=404, detail="Case not found")
    return normalize_case(case)


@app.post("/v1/cases/{case_id}/telemetry", response_model=list[TelemetryPoint], status_code=status.HTTP_201_CREATED)
def register_telemetry(case_id: str, payload: TelemetryBatch, principal: auth.Principal = Depends(auth.get_current_principal)) -> list[TelemetryPoint]:
    if storage.get_case(case_id, principal.tenant_id) is None:
        raise HTTPException(status_code=404, detail="Case not found")
    created_at = now()
    points = []
    for point in payload.points:
        timestamp_utc = point.timestamp.astimezone(timezone.utc)
        points.append({
            "id": f"GPS-{uuid4()}",
            "tenant_id": principal.tenant_id,
            "case_id": case_id,
            "timestamp_utc": timestamp_utc,
            "timestamp_local": point.timestamp_local,
            "source_timezone": point.source_timezone,
            "assumed_timezone": int(point.assumed_timezone),
            "lat": point.lat,
            "lon": point.lon,
            "speed_kph": point.speed_kph,
            "heading_deg": point.heading_deg,
            "accuracy_meters": point.accuracy_meters,
            "vehicle_id": point.vehicle_id,
            "segment_distance_meters": point.segment_distance_meters,
            "elapsed_seconds": point.elapsed_seconds,
            "derived_speed_kph": point.derived_speed_kph,
            "created_at": created_at,
        })
    storage.insert_telemetry_points(points)
    audit(principal, "TELEMETRY_REGISTERED", "CASE", case_id, {"point_count": len(points)})
    return [normalize_telemetry(point) for point in storage.list_telemetry_points(case_id, principal.tenant_id)[-len(points):]]


@app.get("/v1/cases/{case_id}/telemetry", response_model=list[TelemetryPoint])
def list_case_telemetry(case_id: str, principal: auth.Principal = Depends(auth.get_current_principal)) -> list[TelemetryPoint]:
    if storage.get_case(case_id, principal.tenant_id) is None:
        raise HTTPException(status_code=404, detail="Case not found")
    return [normalize_telemetry(item) for item in storage.list_telemetry_points(case_id, principal.tenant_id)]


@app.post("/v1/cases/{case_id}/evidence", response_model=Evidence, status_code=status.HTTP_201_CREATED)
def register_evidence(case_id: str, payload: EvidenceCreate, principal: auth.Principal = Depends(auth.get_current_principal)) -> Evidence:
    if storage.get_case(case_id, principal.tenant_id) is None:
        raise HTTPException(status_code=404, detail="Case not found")
    normalized_hash = payload.sha256.lower()
    if storage.evidence_hash_exists(normalized_hash, principal.tenant_id):
        raise HTTPException(status_code=409, detail="Evidence with this SHA-256 hash is already registered")
    ingested_at = now()
    evidence_id = f"E-{uuid4()}"
    custody = [{"action": "INGESTED", "timestamp": ingested_at, "actor": "CLAIMTRACE-API", "note": "Evidence metadata registered without altering the original source artifact."}]
    storage.insert_evidence({**payload.model_dump(), "id": evidence_id, "tenant_id": principal.tenant_id, "case_id": case_id, "artifact_key": None, "artifact_bytes": None, "sha256": normalized_hash, "ingested_at": ingested_at, "chain_of_custody": custody})
    evidence = normalize_evidence({**payload.model_dump(), "id": evidence_id, "case_id": case_id, "artifact_key": None, "sha256": normalized_hash, "ingested_at": ingested_at, "chain_of_custody": custody})
    audit(principal, "EVIDENCE_REGISTERED", "EVIDENCE", evidence_id, {"type": payload.type, "sha256": normalized_hash})
    return evidence


@app.post("/v1/cases/{case_id}/evidence/upload", response_model=Evidence, status_code=status.HTTP_201_CREATED)
async def upload_evidence(case_id: str, type: SourceType = Form(...), source: str = Form("USER_UPLOAD"), captured_at: datetime | None = Form(None), claimed_sha256: str | None = Form(None), file: UploadFile = File(...), principal: auth.Principal = Depends(auth.get_current_principal)) -> Evidence:
    if storage.get_case(case_id, principal.tenant_id) is None:
        raise HTTPException(status_code=404, detail="Case not found")
    content = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail=f"Evidence exceeds {MAX_UPLOAD_BYTES} byte upload limit")
    if not content:
        raise HTTPException(status_code=400, detail="Evidence file is empty")
    sha256 = hashlib.sha256(content).hexdigest()
    if claimed_sha256 and claimed_sha256.lower() != sha256:
        raise HTTPException(status_code=422, detail="claimed_sha256 does not match server-computed SHA-256")
    if storage.evidence_hash_exists(sha256, principal.tenant_id):
        raise HTTPException(status_code=409, detail="Evidence with this SHA-256 hash is already registered")
    evidence_id = f"E-{uuid4()}"
    safe_filename = os.path.basename(file.filename or "evidence.bin") or "evidence.bin"
    artifact_key = f"{principal.tenant_id}/{case_id}/{evidence_id}/{safe_filename}"
    ingested_at = now()
    custody = [{"action": "INGESTED", "timestamp": ingested_at, "actor": "CLAIMTRACE-API", "note": "Original evidence bytes stored with server-side SHA-256 recorded at intake."}]
    storage.insert_evidence({"id": evidence_id, "tenant_id": principal.tenant_id, "case_id": case_id, "type": type, "source": source, "source_ref": safe_filename, "artifact_key": artifact_key, "artifact_bytes": content, "sha256": sha256, "captured_at": captured_at, "ingested_at": ingested_at, "media_type": file.content_type, "size_bytes": len(content), "chain_of_custody": custody})
    evidence = normalize_evidence({"id": evidence_id, "case_id": case_id, "type": type, "source": source, "source_ref": safe_filename, "artifact_key": artifact_key, "sha256": sha256, "captured_at": captured_at, "ingested_at": ingested_at, "media_type": file.content_type, "size_bytes": len(content), "chain_of_custody": custody})
    audit(principal, "EVIDENCE_UPLOADED", "EVIDENCE", evidence_id, {"type": type, "sha256": sha256, "size_bytes": len(content)})
    return evidence


@app.post("/v1/cases/{case_id}/evidence/{evidence_id}/video-metadata")
def register_video_metadata(case_id: str, evidence_id: str, payload: VideoMetadataIngest, principal: auth.Principal = Depends(auth.get_current_principal)) -> dict:
    if storage.get_case(case_id, principal.tenant_id) is None:
        raise HTTPException(status_code=404, detail="Case not found")
    evidence_record = next((item for item in storage.list_evidence(case_id, principal.tenant_id) if item["id"] == evidence_id), None)
    if evidence_record is None:
        raise HTTPException(status_code=404, detail="Evidence not found")
    media_type = str(evidence_record.get("media_type") or "")
    if evidence_record["type"] not in {"DASHCAM", "CCTV"} or not media_type.startswith("video/"):
        raise HTTPException(status_code=422, detail="Video metadata requires a DASHCAM or CCTV video evidence artifact")
    normalized = video.normalize_video_metadata(payload.model_dump())
    row = {"id": f"VID-{uuid4()}", "tenant_id": principal.tenant_id, "case_id": case_id, "evidence_id": evidence_id, **normalized, "created_at": now()}
    storage.insert_video_metadata(row)
    audit(principal, "VIDEO_METADATA_REGISTERED", "EVIDENCE", evidence_id, {"duration_seconds": normalized["duration_seconds"], "width": normalized["width"], "height": normalized["height"], "metadata_source": normalized["metadata_source"]})
    return row


@app.get("/v1/cases/{case_id}/evidence/{evidence_id}/video-metadata")
def get_video_metadata(case_id: str, evidence_id: str, principal: auth.Principal = Depends(auth.get_current_principal)) -> dict:
    if storage.get_case(case_id, principal.tenant_id) is None:
        raise HTTPException(status_code=404, detail="Case not found")
    result = storage.get_video_metadata(evidence_id, principal.tenant_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Video metadata not found")
    result.pop("tenant_id", None)
    return result


@app.get("/v1/cases/{case_id}/evidence", response_model=list[Evidence])
def list_evidence(case_id: str, principal: auth.Principal = Depends(auth.get_current_principal)) -> list[Evidence]:
    if storage.get_case(case_id, principal.tenant_id) is None:
        raise HTTPException(status_code=404, detail="Case not found")
    return [normalize_evidence(item) for item in storage.list_evidence(case_id, principal.tenant_id)]


@app.get("/v1/cases/{case_id}/evidence/{evidence_id}/artifact")
def get_evidence_artifact(case_id: str, evidence_id: str, principal: auth.Principal = Depends(auth.get_current_principal)) -> Response:
    artifact = storage.get_evidence_artifact(principal.tenant_id, case_id, evidence_id)
    if artifact is None:
        raise HTTPException(status_code=404, detail="Evidence artifact not found")
    _, content, media_type = artifact
    audit(principal, "EVIDENCE_VIEWED", "EVIDENCE", evidence_id)
    return Response(content=content, media_type=media_type or "application/octet-stream")


@app.get("/v1/cases/{case_id}/report")
def get_case_report(case_id: str, principal: auth.Principal = Depends(auth.get_current_principal)) -> Response:
    case = storage.get_case(case_id, principal.tenant_id)
    if case is None:
        raise HTTPException(status_code=404, detail="Case not found")
    evidence = storage.list_evidence(case_id, principal.tenant_id)
    audit_events = storage.list_audit_events(principal.tenant_id, case_id)
    payload = report.build_report(case, evidence, audit_events)
    document = report.render_html(payload)
    audit(principal, "REPORT_GENERATED", "CASE", case_id, {"evidence_count": len(evidence)})
    return Response(content=document, media_type="text/html", headers={"Content-Disposition": f'attachment; filename="claimtrace-{case_id}-report.html"'})


@app.get("/v1/cases/{case_id}/audit")
def list_case_audit(case_id: str, principal: auth.Principal = Depends(auth.get_current_principal)) -> list[dict]:
    if storage.get_case(case_id, principal.tenant_id) is None:
        raise HTTPException(status_code=404, detail="Case not found")
    return storage.list_audit_events(principal.tenant_id, case_id)
