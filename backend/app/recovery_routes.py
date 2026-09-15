from __future__ import annotations

from uuid import uuid4
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query

from . import auth, recovery_storage, storage
from .recovery_engine import RecoveryAssessment, RecoveryAssessmentRequest, assess_recovery

router = APIRouter(prefix="/v1/cases/{case_id}/recovery", tags=["recovery-intelligence"])


def _now() -> datetime:
    return datetime.now(timezone.utc)


@router.post("/assessment", response_model=RecoveryAssessment)
def create_recovery_assessment(
    case_id: str,
    payload: RecoveryAssessmentRequest,
    principal: auth.Principal = Depends(auth.get_current_principal),
) -> RecoveryAssessment:
    if storage.get_case(case_id, principal.tenant_id) is None:
        raise HTTPException(status_code=404, detail="Case not found")

    assessment = assess_recovery(payload)
    recovery_storage.insert_assessment(
        {
            "id": f"REC-{uuid4()}",
            "tenant_id": principal.tenant_id,
            "case_id": case_id,
            **assessment.model_dump(mode="json"),
            "created_at": _now(),
        }
    )
    storage.insert_audit_event(
        {
            "id": f"AUD-RECOVERY-{uuid4()}",
            "tenant_id": principal.tenant_id,
            "actor_user_id": principal.user_id,
            "action": "RECOVERY_ASSESSMENT_CREATED",
            "resource_type": "CASE",
            "resource_id": case_id,
            "metadata": {
                "recommended_action": assessment.recommended_action.value,
                "expected_net_recovery_zar": assessment.expected_net_recovery_zar,
                "evidence_score": assessment.evidence_score,
                "model_version": assessment.model_version,
            },
            "created_at": _now(),
        }
    )
    return assessment


@router.get("/assessment")
def get_recovery_assessment(
    case_id: str,
    principal: auth.Principal = Depends(auth.get_current_principal),
) -> dict:
    if storage.get_case(case_id, principal.tenant_id) is None:
        raise HTTPException(status_code=404, detail="Case not found")
    assessment = recovery_storage.get_latest(case_id, principal.tenant_id)
    if assessment is None:
        raise HTTPException(status_code=404, detail="Recovery assessment not found")
    return assessment


@router.get("/opportunities")
def list_recovery_opportunities(
    min_expected_net_recovery_zar: float = Query(0.0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    principal: auth.Principal = Depends(auth.get_current_principal),
) -> list[dict]:
    return recovery_storage.list_opportunities(
        principal.tenant_id,
        min_expected_net_recovery_zar=min_expected_net_recovery_zar,
        limit=limit,
    )
