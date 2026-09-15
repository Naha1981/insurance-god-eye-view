from __future__ import annotations

from enum import Enum
from math import isfinite

from pydantic import BaseModel, ConfigDict, Field, model_validator


class RecoveryAction(str, Enum):
    RECOVER = "RECOVER"
    HUMAN_REVIEW = "HUMAN_REVIEW"
    REQUEST_EVIDENCE = "REQUEST_EVIDENCE"
    REFER_SIU = "REFER_SIU"
    CLOSE = "CLOSE"


class RecoveryAssessmentRequest(BaseModel):
    """Deterministic recovery-decision inputs for the first Claims Intelligence slice.

    These are decision-support signals, not legal findings. Production implementations
    should replace insurer-calibrated probabilities with governed models and verified
    provider data.
    """

    model_config = ConfigDict(extra="forbid")

    recoverable_quantum_zar: float = Field(gt=0, le=10_000_000_000)
    liability_confidence: float = Field(ge=0, le=1)
    recovery_probability: float = Field(ge=0, le=1)
    evidence_confidence: float = Field(ge=0, le=1)
    investigation_cost_zar: float = Field(ge=0, le=10_000_000)
    legal_cost_zar: float = Field(ge=0, le=10_000_000)
    contradiction_count: int = Field(default=0, ge=0, le=10_000)
    missing_critical_evidence: bool = False
    suspicious_indicators: int = Field(default=0, ge=0, le=10_000)

    @model_validator(mode="after")
    def validate_costs(self) -> "RecoveryAssessmentRequest":
        for value in (
            self.recoverable_quantum_zar,
            self.investigation_cost_zar,
            self.legal_cost_zar,
        ):
            if not isfinite(value):
                raise ValueError("financial inputs must be finite")
        return self


class RecoveryAssessment(BaseModel):
    model_config = ConfigDict(extra="forbid")

    recoverable_quantum_zar: float
    liability_confidence: float
    recovery_probability: float
    evidence_confidence: float
    expected_gross_recovery_zar: float
    expected_net_recovery_zar: float
    evidence_score: float
    risk_flags: list[str]
    recommended_action: RecoveryAction
    decision_reason: str
    model_version: str


def _risk_flags(payload: RecoveryAssessmentRequest) -> list[str]:
    flags: list[str] = []
    if payload.missing_critical_evidence:
        flags.append("MISSING_CRITICAL_EVIDENCE")
    if payload.contradiction_count > 0:
        flags.append("NARRATIVE_OR_EVIDENCE_CONTRADICTIONS")
    if payload.suspicious_indicators > 0:
        flags.append("SUSPICIOUS_INDICATORS")
    if payload.evidence_confidence < 0.60:
        flags.append("LOW_EVIDENCE_CONFIDENCE")
    return flags


def assess_recovery(payload: RecoveryAssessmentRequest) -> RecoveryAssessment:
    """Calculate an explainable recovery recommendation.

    Formula:
        expected_gross = quantum × liability confidence × recovery probability
        expected_net   = expected_gross − investigation cost − legal cost

    Routing deliberately prioritises evidence sufficiency and SIU signals before
    monetary optimisation. This prevents a financially attractive but poorly
    evidenced case from being presented as a confident automated decision.
    """

    expected_gross = (
        payload.recoverable_quantum_zar
        * payload.liability_confidence
        * payload.recovery_probability
    )
    expected_net = expected_gross - payload.investigation_cost_zar - payload.legal_cost_zar

    evidence_score = round(
        0.55 * payload.evidence_confidence
        + 0.30 * payload.liability_confidence
        + 0.15 * payload.recovery_probability,
        4,
    )
    flags = _risk_flags(payload)

    if payload.suspicious_indicators > 0:
        action = RecoveryAction.REFER_SIU
        reason = "Suspicious indicators require specialist investigation before recovery action."
    elif payload.missing_critical_evidence or evidence_score < 0.55:
        action = RecoveryAction.REQUEST_EVIDENCE
        reason = "Critical evidence is missing or evidence confidence is too low for a recovery decision."
    elif expected_net <= 0:
        action = RecoveryAction.CLOSE
        reason = "Expected recoverable value does not cover the estimated investigation and legal cost."
    elif expected_net < 5_000:
        action = RecoveryAction.HUMAN_REVIEW
        reason = "Positive expected recovery exists, but the value is low enough to require human economic review."
    elif evidence_score < 0.75:
        action = RecoveryAction.HUMAN_REVIEW
        reason = "The claim has economic recovery potential but evidence confidence is not high enough for automatic routing."
    else:
        action = RecoveryAction.RECOVER
        reason = "The claim has sufficient evidence confidence and positive expected net recovery for recovery workflow."

    return RecoveryAssessment(
        recoverable_quantum_zar=round(payload.recoverable_quantum_zar, 2),
        liability_confidence=payload.liability_confidence,
        recovery_probability=payload.recovery_probability,
        evidence_confidence=payload.evidence_confidence,
        expected_gross_recovery_zar=round(expected_gross, 2),
        expected_net_recovery_zar=round(expected_net, 2),
        evidence_score=evidence_score,
        risk_flags=flags,
        recommended_action=action,
        decision_reason=reason,
        model_version="recovery-engine-0.1.0",
    )
