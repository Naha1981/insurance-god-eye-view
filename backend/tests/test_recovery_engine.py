from app.recovery_engine import RecoveryAction, RecoveryAssessmentRequest, assess_recovery


def test_high_confidence_claim_routes_to_recovery() -> None:
    result = assess_recovery(
        RecoveryAssessmentRequest(
            recoverable_quantum_zar=45_000,
            liability_confidence=0.92,
            recovery_probability=0.80,
            evidence_confidence=0.90,
            investigation_cost_zar=1_000,
            legal_cost_zar=1_500,
        )
    )

    assert result.expected_gross_recovery_zar == 33_120.00
    assert result.expected_net_recovery_zar == 30_620.00
    assert result.recommended_action is RecoveryAction.RECOVER
    assert result.risk_flags == []


def test_suspicious_claim_is_referred_before_economic_routing() -> None:
    result = assess_recovery(
        RecoveryAssessmentRequest(
            recoverable_quantum_zar=100_000,
            liability_confidence=0.95,
            recovery_probability=0.90,
            evidence_confidence=0.90,
            investigation_cost_zar=1_000,
            legal_cost_zar=1_500,
            suspicious_indicators=2,
        )
    )

    assert result.recommended_action is RecoveryAction.REFER_SIU
    assert "SUSPICIOUS_INDICATORS" in result.risk_flags


def test_missing_critical_evidence_blocks_recovery() -> None:
    result = assess_recovery(
        RecoveryAssessmentRequest(
            recoverable_quantum_zar=75_000,
            liability_confidence=0.95,
            recovery_probability=0.85,
            evidence_confidence=0.85,
            investigation_cost_zar=500,
            legal_cost_zar=750,
            missing_critical_evidence=True,
        )
    )

    assert result.recommended_action is RecoveryAction.REQUEST_EVIDENCE
    assert "MISSING_CRITICAL_EVIDENCE" in result.risk_flags


def test_negative_expected_recovery_is_closed() -> None:
    result = assess_recovery(
        RecoveryAssessmentRequest(
            recoverable_quantum_zar=2_000,
            liability_confidence=0.50,
            recovery_probability=0.40,
            evidence_confidence=0.90,
            investigation_cost_zar=1_000,
            legal_cost_zar=1_000,
        )
    )

    assert result.expected_net_recovery_zar < 0
    assert result.recommended_action is RecoveryAction.CLOSE
