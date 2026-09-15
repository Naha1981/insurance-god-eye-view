from __future__ import annotations

import json
from datetime import datetime
from typing import Any

from sqlalchemy import Column, DateTime, Float, Integer, MetaData, String, Text, Table, insert, select

from .storage import engine

metadata = MetaData()

recovery_assessments = Table(
    "recovery_assessments",
    metadata,
    Column("id", String(120), primary_key=True),
    Column("tenant_id", String(120), nullable=False),
    Column("case_id", String(120), nullable=False),
    Column("recoverable_quantum_zar", Float, nullable=False),
    Column("liability_confidence", Float, nullable=False),
    Column("recovery_probability", Float, nullable=False),
    Column("evidence_confidence", Float, nullable=False),
    Column("expected_gross_recovery_zar", Float, nullable=False),
    Column("expected_net_recovery_zar", Float, nullable=False),
    Column("evidence_score", Float, nullable=False),
    Column("recommended_action", String(40), nullable=False),
    Column("decision_reason", Text, nullable=False),
    Column("risk_flags_json", Text, nullable=False),
    Column("model_version", String(80), nullable=False),
    Column("created_at", DateTime(timezone=True), nullable=False),
)


def insert_assessment(record: dict[str, Any]) -> None:
    values = dict(record)
    values["risk_flags_json"] = json.dumps(values.pop("risk_flags"), separators=(",", ":"))
    with engine().begin() as connection:
        connection.execute(insert(recovery_assessments).values(**values))


def _normalize(row: Any) -> dict[str, Any]:
    result = dict(row)
    result["risk_flags"] = json.loads(result.pop("risk_flags_json"))
    result.pop("tenant_id", None)
    return result


def get_latest(case_id: str, tenant_id: str) -> dict[str, Any] | None:
    statement = (
        select(recovery_assessments)
        .where(recovery_assessments.c.case_id == case_id)
        .where(recovery_assessments.c.tenant_id == tenant_id)
        .order_by(recovery_assessments.c.created_at.desc())
        .limit(1)
    )
    with engine().connect() as connection:
        row = connection.execute(statement).mappings().first()
    return _normalize(row) if row else None


def list_opportunities(tenant_id: str, min_expected_net_recovery_zar: float = 0.0, limit: int = 100) -> list[dict[str, Any]]:
    statement = (
        select(recovery_assessments)
        .where(recovery_assessments.c.tenant_id == tenant_id)
        .where(recovery_assessments.c.expected_net_recovery_zar >= min_expected_net_recovery_zar)
        .order_by(recovery_assessments.c.expected_net_recovery_zar.desc())
        .limit(limit)
    )
    with engine().connect() as connection:
        rows = connection.execute(statement).mappings().all()
    return [_normalize(row) for row in rows]
