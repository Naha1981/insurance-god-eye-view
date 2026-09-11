from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

from alembic import command
from alembic.config import Config
from sqlalchemy import Column, DateTime, Float, Integer, LargeBinary, MetaData, String, Table, Text, create_engine, delete, func, insert, select
from sqlalchemy.engine import Connection, Engine

DEFAULT_DB_PATH = Path(__file__).resolve().parent.parent / "data" / "claimtrace.sqlite3"
metadata = MetaData()

tenants = Table("tenants", metadata, Column("id", String(120), primary_key=True), Column("name", String(240), nullable=False), Column("created_at", DateTime(timezone=True), nullable=False))
users = Table("users", metadata, Column("id", String(120), primary_key=True), Column("tenant_id", String(120), nullable=False), Column("email", String(320), nullable=False, unique=True), Column("password_hash", String(256), nullable=False), Column("role", String(40), nullable=False), Column("created_at", DateTime(timezone=True), nullable=False))
sessions = Table("sessions", metadata, Column("id", String(120), primary_key=True), Column("user_id", String(120), nullable=False), Column("token_hash", String(128), nullable=False, unique=True), Column("expires_at", DateTime(timezone=True), nullable=False), Column("created_at", DateTime(timezone=True), nullable=False))
cases = Table("cases", metadata, Column("id", String(120), primary_key=True), Column("tenant_id", String(120), nullable=False), Column("title", String(240), nullable=False), Column("incident_at", DateTime(timezone=True)), Column("location_json", Text), Column("status", String(40), nullable=False), Column("created_at", DateTime(timezone=True), nullable=False))
evidence = Table("evidence", metadata, Column("id", String(120), primary_key=True), Column("tenant_id", String(120), nullable=False), Column("case_id", String(120), nullable=False), Column("type", String(40), nullable=False), Column("source", String(120), nullable=False), Column("source_ref", String(500)), Column("artifact_key", String(700)), Column("artifact_bytes", LargeBinary), Column("sha256", String(64), nullable=False), Column("captured_at", DateTime(timezone=True)), Column("ingested_at", DateTime(timezone=True), nullable=False), Column("media_type", String(120)), Column("size_bytes", Integer), Column("chain_of_custody_json", Text, nullable=False))
video_metadata = Table("video_metadata", metadata,
    Column("id", String(120), primary_key=True), Column("tenant_id", String(120), nullable=False), Column("case_id", String(120), nullable=False), Column("evidence_id", String(120), nullable=False, unique=True),
    Column("duration_seconds", Float), Column("width", Integer), Column("height", Integer), Column("frame_rate", Float), Column("capture_start_at", DateTime(timezone=True)),
    Column("metadata_source", String(80), nullable=False), Column("metadata_version", String(40), nullable=False), Column("created_at", DateTime(timezone=True), nullable=False))
telemetry_points = Table("telemetry_points", metadata,
    Column("id", String(120), primary_key=True), Column("tenant_id", String(120), nullable=False), Column("case_id", String(120), nullable=False),
    Column("timestamp_utc", DateTime(timezone=True), nullable=False), Column("timestamp_local", String(80), nullable=False), Column("source_timezone", String(80), nullable=False),
    Column("assumed_timezone", Integer, nullable=False), Column("lat", Float, nullable=False), Column("lon", Float, nullable=False), Column("speed_kph", Float), Column("heading_deg", Float), Column("accuracy_meters", Float), Column("vehicle_id", String(160)), Column("segment_distance_meters", Float), Column("elapsed_seconds", Float), Column("derived_speed_kph", Float), Column("created_at", DateTime(timezone=True), nullable=False))
audit_events = Table("audit_events", metadata, Column("id", String(120), primary_key=True), Column("tenant_id", String(120)), Column("actor_user_id", String(120)), Column("action", String(120), nullable=False), Column("resource_type", String(80)), Column("resource_id", String(160)), Column("metadata_json", Text), Column("created_at", DateTime(timezone=True), nullable=False))


def database_url() -> str:
    url = os.getenv("DATABASE_URL")
    if url:
        if url.startswith("postgres://"): return "postgresql+psycopg://" + url[len("postgres://"):]
        if url.startswith("postgresql://"): return "postgresql+psycopg://" + url[len("postgresql://"):]
        return url
    path = Path(os.getenv("CLAIMTRACE_DB_PATH", str(DEFAULT_DB_PATH))).resolve(); path.parent.mkdir(parents=True, exist_ok=True)
    return f"sqlite:///{path}"


def engine() -> Engine: return create_engine(database_url(), future=True, pool_pre_ping=True)
def connect() -> Connection: return engine().connect()


def _alembic_config() -> Config:
    config = Config(str(Path(__file__).resolve().parent.parent / "alembic.ini"))
    config.set_main_option("script_location", str(Path(__file__).resolve().parent.parent / "alembic"))
    return config


def init_database() -> None:
    command.upgrade(_alembic_config(), "head")


def reset_database() -> None:
    db_engine = engine()
    with db_engine.begin() as connection:
        for table in (audit_events, video_metadata, telemetry_points, evidence, cases, sessions, users, tenants): connection.execute(delete(table))
    db_engine.dispose()

def insert_tenant(tenant: dict[str, Any]) -> None:
    with engine().begin() as connection: connection.execute(insert(tenants).values(**tenant))
def get_tenant(tenant_id: str) -> dict[str, Any] | None:
    with connect() as connection: row = connection.execute(select(tenants).where(tenants.c.id == tenant_id)).mappings().first()
    return dict(row) if row else None
def insert_user(user: dict[str, Any]) -> None:
    with engine().begin() as connection: connection.execute(insert(users).values(**user))
def get_user_by_email(email: str) -> dict[str, Any] | None:
    with connect() as connection: row = connection.execute(select(users).where(users.c.email == email.lower())).mappings().first()
    return dict(row) if row else None
def get_user(user_id: str) -> dict[str, Any] | None:
    with connect() as connection: row = connection.execute(select(users).where(users.c.id == user_id)).mappings().first()
    return dict(row) if row else None
def insert_session(session: dict[str, Any]) -> None:
    with engine().begin() as connection: connection.execute(insert(sessions).values(**session))
def get_session_by_hash(token_hash: str, now_value: Any) -> dict[str, Any] | None:
    with connect() as connection:
        row = connection.execute(select(sessions, users.c.tenant_id, users.c.email, users.c.role).join(users, users.c.id == sessions.c.user_id).where(sessions.c.token_hash == token_hash).where(sessions.c.expires_at > now_value)).mappings().first()
    return dict(row) if row else None

def insert_case(case: dict[str, Any]) -> None:
    with engine().begin() as connection: connection.execute(insert(cases).values(**case))
def _case_result(row: Any, evidence_count: int) -> dict[str, Any]:
    result = dict(row); location_json = result.pop("location_json", None); result["location"] = json.loads(location_json) if location_json else None; result["evidence_count"] = int(evidence_count); result.pop("tenant_id", None); return result
def get_case(case_id: str, tenant_id: str | None = None) -> dict[str, Any] | None:
    statement = select(cases).where(cases.c.id == case_id)
    if tenant_id is not None: statement = statement.where(cases.c.tenant_id == tenant_id)
    with connect() as connection:
        row = connection.execute(statement).mappings().first()
        if not row: return None
        count = connection.execute(select(func.count()).select_from(evidence).where(evidence.c.case_id == case_id)).scalar_one()
    return _case_result(row, count)
def list_cases(tenant_id: str, status: str | None = None, limit: int = 50, offset: int = 0) -> list[dict[str, Any]]:
    statement = select(cases).where(cases.c.tenant_id == tenant_id).order_by(cases.c.created_at.desc()).limit(limit).offset(offset)
    if status: statement = statement.where(cases.c.status == status)
    with connect() as connection:
        rows = connection.execute(statement).mappings().all()
        counts = connection.execute(select(evidence.c.case_id, func.count().label("count")).where(evidence.c.tenant_id == tenant_id).group_by(evidence.c.case_id)).all()
    count_map = {row.case_id: row.count for row in counts}
    return [_case_result(row, count_map.get(row.id, 0)) for row in rows]
def insert_evidence(record: dict[str, Any]) -> None:
    values = dict(record); values["chain_of_custody_json"] = json.dumps(values.pop("chain_of_custody"), separators=(",", ":"))
    with engine().begin() as connection: connection.execute(insert(evidence).values(**values))
def list_evidence(case_id: str, tenant_id: str | None = None) -> list[dict[str, Any]]:
    statement = select(evidence).where(evidence.c.case_id == case_id).order_by(evidence.c.ingested_at.asc())
    if tenant_id is not None: statement = statement.where(evidence.c.tenant_id == tenant_id)
    with connect() as connection: rows = connection.execute(statement).mappings().all()
    result = []
    for row in rows:
        item = dict(row); item["chain_of_custody"] = json.loads(item.pop("chain_of_custody_json")); item.pop("artifact_bytes", None); item.pop("tenant_id", None); result.append(item)
    return result
def get_evidence_artifact(tenant_id: str, case_id: str, evidence_id: str) -> tuple[str | None, bytes, str | None] | None:
    with connect() as connection:
        row = connection.execute(select(evidence.c.artifact_key, evidence.c.artifact_bytes, evidence.c.media_type).where(evidence.c.id == evidence_id).where(evidence.c.case_id == case_id).where(evidence.c.tenant_id == tenant_id)).first()
    if not row or row.artifact_bytes is None: return None
    return row.artifact_key, bytes(row.artifact_bytes), row.media_type
def evidence_hash_exists(sha256: str, tenant_id: str | None = None) -> bool:
    statement = select(evidence.c.id).where(evidence.c.sha256 == sha256.lower()).limit(1)
    if tenant_id is not None: statement = statement.where(evidence.c.tenant_id == tenant_id)
    with connect() as connection: return connection.execute(statement).first() is not None

def insert_video_metadata(metadata: dict[str, Any]) -> None:
    with engine().begin() as connection: connection.execute(insert(video_metadata).values(**metadata))
def get_video_metadata(evidence_id: str, tenant_id: str) -> dict[str, Any] | None:
    statement = select(video_metadata).where(video_metadata.c.evidence_id == evidence_id).where(video_metadata.c.tenant_id == tenant_id)
    with connect() as connection: row = connection.execute(statement).mappings().first()
    return dict(row) if row else None

def insert_telemetry_points(points: list[dict[str, Any]]) -> None:
    if not points: return
    with engine().begin() as connection: connection.execute(insert(telemetry_points), points)
def list_telemetry_points(case_id: str, tenant_id: str) -> list[dict[str, Any]]:
    statement = select(telemetry_points).where(telemetry_points.c.case_id == case_id, telemetry_points.c.tenant_id == tenant_id).order_by(telemetry_points.c.timestamp_utc.asc())
    with connect() as connection: rows = connection.execute(statement).mappings().all()
    return [dict(row) for row in rows]
def insert_audit_event(event: dict[str, Any]) -> None:
    payload = dict(event); metadata_value = payload.pop("metadata", None); payload["metadata_json"] = json.dumps(metadata_value, separators=(",", ":")) if metadata_value is not None else None
    with engine().begin() as connection: connection.execute(insert(audit_events).values(**payload))
def list_audit_events(tenant_id: str, resource_id: str | None = None) -> list[dict[str, Any]]:
    statement = select(audit_events).where(audit_events.c.tenant_id == tenant_id).order_by(audit_events.c.created_at.desc())
    if resource_id is not None: statement = statement.where(audit_events.c.resource_id == resource_id)
    with connect() as connection: rows = connection.execute(statement).mappings().all()
    return [{**{key: value for key, value in row.items() if key != "metadata_json"}, "metadata": json.loads(row["metadata_json"]) if row["metadata_json"] else None} for row in rows]
