from __future__ import annotations

import hashlib
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Literal
from uuid import uuid4

from fastapi import FastAPI, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel, ConfigDict, Field, field_validator

from . import storage

SourceType = Literal[
    "DASHCAM", "CCTV", "PHOTO", "POLICE_REPORT", "TELEMATICS", "GPS",
    "EDR", "STATEMENT", "OTHER",
]

MAX_UPLOAD_BYTES = int(os.getenv("CLAIMTRACE_MAX_UPLOAD_BYTES", str(25 * 1024 * 1024)))


@asynccontextmanager
async def lifespan(_: FastAPI):
    storage.init_database()
    yield


app = FastAPI(
    title="ClaimTrace Evidence API",
    version="0.2.0",
    description="Pilot-stage persistent case and evidence registry for physical-world claim investigations.",
    lifespan=lifespan,
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


def now() -> datetime:
    return datetime.now(timezone.utc)


def normalize_case(case: dict) -> Case:
    return Case.model_validate(case)


def normalize_evidence(evidence: dict) -> Evidence:
    return Evidence.model_validate(evidence)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "claimtrace-evidence-api"}


@app.post("/v1/cases", response_model=Case, status_code=status.HTTP_201_CREATED)
def create_case(payload: CaseCreate) -> Case:
    created_at = now()
    case_data = {
        "id": f"CLM-{uuid4()}",
        **payload.model_dump(mode="json"),
        "status": "INVESTIGATION",
        "created_at": created_at,
        "evidence_count": 0,
    }
    case = normalize_case(case_data)
    storage.insert_case(case.model_dump(mode="json"))
    return case


@app.get("/v1/cases/{case_id}", response_model=Case)
def get_case(case_id: str) -> Case:
    case = storage.get_case(case_id)
    if case is None:
        raise HTTPException(status_code=404, detail="Case not found")
    return normalize_case(case)


@app.post("/v1/cases/{case_id}/evidence", response_model=Evidence, status_code=status.HTTP_201_CREATED)
def register_evidence(case_id: str, payload: EvidenceCreate) -> Evidence:
    case = storage.get_case(case_id)
    if case is None:
        raise HTTPException(status_code=404, detail="Case not found")
    if storage.evidence_hash_exists(payload.sha256.lower()):
        raise HTTPException(status_code=409, detail="Evidence with this SHA-256 hash is already registered")

    ingested_at = now()
    evidence = normalize_evidence({
        **payload.model_dump(mode="json"),
        "id": f"E-{uuid4()}",
        "case_id": case_id,
        "artifact_path": None,
        "ingested_at": ingested_at,
        "chain_of_custody": [{
            "action": "INGESTED",
            "timestamp": ingested_at,
            "actor": "CLAIMTRACE-API",
            "note": "Evidence metadata registered without altering the original source artifact.",
        }],
    })
    storage.insert_evidence(evidence.model_dump(mode="json"))
    return evidence


@app.post("/v1/cases/{case_id}/evidence/upload", response_model=Evidence, status_code=status.HTTP_201_CREATED)
async def upload_evidence(
    case_id: str,
    type: SourceType = Form(...),
    source: str = Form("USER_UPLOAD"),
    captured_at: datetime | None = Form(None),
    claimed_sha256: str | None = Form(None),
    file: UploadFile = File(...),
) -> Evidence:
    case = storage.get_case(case_id)
    if case is None:
        raise HTTPException(status_code=404, detail="Case not found")

    content = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail=f"Evidence exceeds {MAX_UPLOAD_BYTES} byte upload limit")
    if not content:
        raise HTTPException(status_code=400, detail="Evidence file is empty")

    sha256 = hashlib.sha256(content).hexdigest()
    if claimed_sha256 and claimed_sha256.lower() != sha256:
        raise HTTPException(status_code=422, detail="claimed_sha256 does not match server-computed SHA-256")
    if storage.evidence_hash_exists(sha256):
        raise HTTPException(status_code=409, detail="Evidence with this SHA-256 hash is already registered")

    evidence_id = f"E-{uuid4()}"
    path = storage.write_original(case_id, evidence_id, file.filename or "evidence.bin", content)
    ingested_at = now()
    evidence = normalize_evidence({
        "id": evidence_id,
        "case_id": case_id,
        "type": type,
        "source": source,
        "source_ref": file.filename or "evidence.bin",
        "artifact_path": str(path),
        "sha256": sha256,
        "captured_at": captured_at,
        "ingested_at": ingested_at,
        "media_type": file.content_type,
        "size_bytes": len(content),
        "chain_of_custody": [{
            "action": "INGESTED",
            "timestamp": ingested_at,
            "actor": "CLAIMTRACE-API",
            "note": "Original evidence bytes stored by ClaimTrace; server-side SHA-256 recorded at intake.",
        }],
    })
    storage.insert_evidence(evidence.model_dump(mode="json"))
    return evidence


@app.get("/v1/cases/{case_id}/evidence", response_model=list[Evidence])
def list_evidence(case_id: str) -> list[Evidence]:
    if storage.get_case(case_id) is None:
        raise HTTPException(status_code=404, detail="Case not found")
    return [normalize_evidence(item) for item in storage.list_evidence(case_id)]
