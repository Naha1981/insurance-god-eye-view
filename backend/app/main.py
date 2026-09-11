from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal
from uuid import uuid4

from fastapi import FastAPI, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field

app = FastAPI(
    title="ClaimTrace Evidence API",
    version="0.1.0",
    description="Pilot-stage case and evidence registry for physical-world claim investigations.",
)

SourceType = Literal[
    "DASHCAM", "CCTV", "PHOTO", "POLICE_REPORT", "TELEMATICS", "GPS",
    "EDR", "STATEMENT", "OTHER",
]


class CustodyEvent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    action: str = Field(min_length=1)
    timestamp: datetime
    actor: str = Field(min_length=1)
    note: str | None = None


class EvidenceCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: SourceType
    source: str = Field(min_length=1)
    source_ref: str | None = None
    sha256: str = Field(pattern=r"^[a-fA-F0-9]{64}$")
    captured_at: datetime | None = None
    media_type: str | None = None
    size_bytes: int | None = Field(default=None, ge=0)


class Evidence(EvidenceCreate):
    id: str
    case_id: str
    ingested_at: datetime
    chain_of_custody: list[CustodyEvent]


class CaseCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1, max_length=240)
    incident_at: datetime | None = None
    location: dict[str, float] | None = None


class Case(CaseCreate):
    id: str
    status: Literal["INVESTIGATION", "REVIEW", "CLOSED"] = "INVESTIGATION"
    created_at: datetime
    evidence_count: int = 0


CASES: dict[str, Case] = {}
EVIDENCE: dict[str, Evidence] = {}


def now() -> datetime:
    return datetime.now(timezone.utc)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "claimtrace-evidence-api"}


@app.post("/v1/cases", response_model=Case, status_code=status.HTTP_201_CREATED)
def create_case(payload: CaseCreate) -> Case:
    case = Case(id=f"CLM-{uuid4()}", created_at=now(), **payload.model_dump())
    CASES[case.id] = case
    return case


@app.get("/v1/cases/{case_id}", response_model=Case)
def get_case(case_id: str) -> Case:
    case = CASES.get(case_id)
    if case is None:
        raise HTTPException(status_code=404, detail="Case not found")
    return case


@app.post("/v1/cases/{case_id}/evidence", response_model=Evidence, status_code=status.HTTP_201_CREATED)
def register_evidence(case_id: str, payload: EvidenceCreate) -> Evidence:
    case = CASES.get(case_id)
    if case is None:
        raise HTTPException(status_code=404, detail="Case not found")

    ingested_at = now()
    evidence = Evidence(
        id=f"E-{uuid4()}",
        case_id=case_id,
        ingested_at=ingested_at,
        chain_of_custody=[
            CustodyEvent(
                action="INGESTED",
                timestamp=ingested_at,
                actor="CLAIMTRACE-API",
                note="Evidence registered without altering original source artifact.",
            )
        ],
        **payload.model_dump(),
    )
    EVIDENCE[evidence.id] = evidence
    case.evidence_count += 1
    return evidence


@app.get("/v1/cases/{case_id}/evidence", response_model=list[Evidence])
def list_evidence(case_id: str) -> list[Evidence]:
    if case_id not in CASES:
        raise HTTPException(status_code=404, detail="Case not found")
    return [item for item in EVIDENCE.values() if item.case_id == case_id]
