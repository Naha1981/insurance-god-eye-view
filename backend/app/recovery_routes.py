from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from . import auth, storage
from .recovery_engine import RecoveryAssessment, RecoveryAssessmentRequest, assess_recovery

router = APIRouter(prefix="/v1/cases/{case_id}/recovery", tags=["recovery-intelligence"])


@router.post("/assessment", response_model=RecoveryAssessment)
def create_recovery_assessment(
    case_id: str,
    payload: RecoveryAssessmentRequest,
    principal: auth.Principal = Depends(auth.get_current_principal),
) -> RecoveryAssessment:
    if storage.get_case(case_id, principal.tenant_id) is None:
        raise HTTPException(status_code=404, detail="Case not found")

    assessment = assess_recovery(payload)
    storage.insert_audit_event(
        {
            "id": f"AUD-RECOVERY-{case_id}-{assessment.model_version}",
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
        }
    )
    return assessment
