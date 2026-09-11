from __future__ import annotations

import json
import os
import sqlite3
from pathlib import Path
from typing import Any

DEFAULT_DB_PATH = Path(__file__).resolve().parent.parent / "data" / "claimtrace.sqlite3"
DEFAULT_STORAGE_ROOT = Path(__file__).resolve().parent.parent / "data" / "evidence"


def db_path() -> Path:
    return Path(os.getenv("CLAIMTRACE_DB_PATH", str(DEFAULT_DB_PATH))).resolve()


def storage_root() -> Path:
    return Path(os.getenv("CLAIMTRACE_STORAGE_ROOT", str(DEFAULT_STORAGE_ROOT))).resolve()


def connect() -> sqlite3.Connection:
    path = db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(path)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def init_database() -> None:
    with connect() as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS cases (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                incident_at TEXT,
                location_json TEXT,
                status TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS evidence (
                id TEXT PRIMARY KEY,
                case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
                type TEXT NOT NULL,
                source TEXT NOT NULL,
                source_ref TEXT,
                artifact_path TEXT,
                sha256 TEXT NOT NULL,
                captured_at TEXT,
                ingested_at TEXT NOT NULL,
                media_type TEXT,
                size_bytes INTEGER,
                chain_of_custody_json TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_evidence_case_id ON evidence(case_id);
            CREATE INDEX IF NOT EXISTS idx_evidence_sha256 ON evidence(sha256);
            """
        )


def reset_database() -> None:
    with connect() as connection:
        connection.executescript("DELETE FROM evidence; DELETE FROM cases;")


def insert_case(case: dict[str, Any]) -> None:
    with connect() as connection:
        connection.execute(
            """
            INSERT INTO cases (id, title, incident_at, location_json, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                case["id"],
                case["title"],
                case.get("incident_at"),
                json.dumps(case.get("location")) if case.get("location") is not None else None,
                case["status"],
                case["created_at"],
            ),
        )


def _row_to_case(row: sqlite3.Row) -> dict[str, Any]:
    case_id = row["id"]
    with connect() as connection:
        count = connection.execute(
            "SELECT COUNT(*) AS count FROM evidence WHERE case_id = ?", (case_id,)
        ).fetchone()["count"]
    return {
        "id": row["id"],
        "title": row["title"],
        "incident_at": row["incident_at"],
        "location": json.loads(row["location_json"]) if row["location_json"] else None,
        "status": row["status"],
        "created_at": row["created_at"],
        "evidence_count": count,
    }


def get_case(case_id: str) -> dict[str, Any] | None:
    with connect() as connection:
        row = connection.execute("SELECT * FROM cases WHERE id = ?", (case_id,)).fetchone()
    return _row_to_case(row) if row else None


def insert_evidence(evidence: dict[str, Any]) -> None:
    with connect() as connection:
        connection.execute(
            """
            INSERT INTO evidence (
                id, case_id, type, source, source_ref, artifact_path, sha256,
                captured_at, ingested_at, media_type, size_bytes, chain_of_custody_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                evidence["id"],
                evidence["case_id"],
                evidence["type"],
                evidence["source"],
                evidence.get("source_ref"),
                evidence.get("artifact_path"),
                evidence["sha256"],
                evidence.get("captured_at"),
                evidence["ingested_at"],
                evidence.get("media_type"),
                evidence.get("size_bytes"),
                json.dumps(evidence["chain_of_custody"]),
            ),
        )


def list_evidence(case_id: str) -> list[dict[str, Any]]:
    with connect() as connection:
        rows = connection.execute(
            "SELECT * FROM evidence WHERE case_id = ? ORDER BY ingested_at ASC", (case_id,)
        ).fetchall()
    return [
        {
            "id": row["id"],
            "case_id": row["case_id"],
            "type": row["type"],
            "source": row["source"],
            "source_ref": row["source_ref"],
            "artifact_path": row["artifact_path"],
            "sha256": row["sha256"],
            "captured_at": row["captured_at"],
            "ingested_at": row["ingested_at"],
            "media_type": row["media_type"],
            "size_bytes": row["size_bytes"],
            "chain_of_custody": json.loads(row["chain_of_custody_json"]),
        }
        for row in rows
    ]


def evidence_hash_exists(sha256: str) -> bool:
    with connect() as connection:
        row = connection.execute("SELECT 1 FROM evidence WHERE sha256 = ? LIMIT 1", (sha256,)).fetchone()
    return row is not None


def write_original(case_id: str, evidence_id: str, filename: str, content: bytes) -> str:
    root = storage_root() / case_id
    root.mkdir(parents=True, exist_ok=True)
    safe_name = Path(filename or "evidence.bin").name or "evidence.bin"
    relative_key = Path(case_id) / f"{evidence_id}-{safe_name}"
    destination = storage_root() / relative_key
    destination.write_bytes(content)
    return relative_key.as_posix()


def read_original(artifact_key: str) -> bytes:
    root = storage_root().resolve()
    destination = (root / artifact_key).resolve()
    if root != destination and root not in destination.parents:
        raise ValueError("artifact key resolves outside the storage root")
    return destination.read_bytes()
