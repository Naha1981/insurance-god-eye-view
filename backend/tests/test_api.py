import hashlib
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import inspect

from app import storage
from app.auth import hash_password
from app.main import app


@pytest.fixture
def configured_env(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAIMTRACE_DB_PATH", str(tmp_path / "claimtrace.sqlite3"))
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.setenv("CLAIMTRACE_AUTH_MODE", "disabled")
    monkeypatch.setenv("CLAIMTRACE_CORS_ORIGINS", "*")
    storage.init_database()
    storage.reset_database()
    return tmp_path


@pytest.fixture
def client(configured_env):
    with TestClient(app) as test_client:
        yield test_client


def test_health(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_database_initialization_records_alembic_revision(configured_env):
    with storage.connect() as connection:
        tables = set(inspect(connection).get_table_names())
        assert "video_metadata" in tables
        assert "alembic_version" in tables
        revision = connection.exec_driver_sql("SELECT version_num FROM alembic_version").scalar_one()
    assert revision == "0001_claimtrace_baseline"


def test_case_and_evidence_lifecycle(client):
    case_response = client.post("/v1/cases", json={"title": "Synthetic motor collision", "incident_at": datetime(2026, 8, 18, 12, 31, 50, tzinfo=timezone.utc).isoformat(), "location": {"lat": -26.2466, "lon": 28.0205}})
    assert case_response.status_code == 201
    case = case_response.json()
    assert case["id"].startswith("CLM-")
    assert case["evidence_count"] == 0
    evidence_response = client.post(f"/v1/cases/{case['id']}/evidence", json={"type": "DASHCAM", "source": "USER_UPLOAD", "source_ref": "dashcam.mp4", "sha256": "a" * 64, "captured_at": datetime(2026, 8, 18, 12, 31, 50, tzinfo=timezone.utc).isoformat(), "media_type": "video/mp4", "size_bytes": 1234})
    assert evidence_response.status_code == 201
    evidence = evidence_response.json()
    assert evidence["case_id"] == case["id"]
    assert evidence["sha256"] == "a" * 64
    assert evidence["chain_of_custody"][0]["action"] == "INGESTED"
    assert client.get(f"/v1/cases/{case['id']}").json()["evidence_count"] == 1
    listed = client.get(f"/v1/cases/{case['id']}/evidence")
    assert listed.status_code == 200
    assert len(listed.json()) == 1
    assert listed.json()[0]["id"] == evidence["id"]


def test_file_upload_hashes_persists_and_serves_original(client):
    case_id = client.post("/v1/cases", json={"title": "Upload case"}).json()["id"]
    fixture = b"ClaimTrace server-side evidence intake fixture"
    digest = hashlib.sha256(fixture).hexdigest()
    response = client.post(f"/v1/cases/{case_id}/evidence/upload", data={"type": "PHOTO", "source": "USER_UPLOAD", "claimed_sha256": digest}, files={"file": ("scene.txt", fixture, "text/plain")})
    assert response.status_code == 201
    evidence = response.json()
    assert evidence["sha256"] == digest
    assert evidence["size_bytes"] == len(fixture)
    assert evidence["artifact_path"].startswith("TENANT-DEMO/")
    artifact = client.get(f"/v1/cases/{case_id}/evidence/{evidence['id']}/artifact")
    assert artifact.status_code == 200
    assert artifact.content == fixture
    assert artifact.headers["content-type"].startswith("text/plain")
    duplicate = client.post(f"/v1/cases/{case_id}/evidence/upload", data={"type": "PHOTO"}, files={"file": ("scene.txt", fixture, "text/plain")})
    assert duplicate.status_code == 409


def test_video_metadata_is_tenant_scoped_and_linked_to_video_evidence(client):
    case_id = client.post("/v1/cases", json={"title": "Dashcam metadata case"}).json()["id"]
    evidence = client.post(
        f"/v1/cases/{case_id}/evidence",
        json={"type": "DASHCAM", "source": "INSURED", "source_ref": "front.mp4", "sha256": "c" * 64, "media_type": "video/mp4", "size_bytes": 2048},
    ).json()
    response = client.post(
        f"/v1/cases/{case_id}/evidence/{evidence['id']}/video-metadata",
        json={"duration_seconds": 91.25, "width": 1920, "height": 1080, "metadata_source": "BROWSER_MEDIA_ELEMENT", "metadata_version": "1"},
    )
    assert response.status_code == 200
    metadata = response.json()
    assert metadata["evidence_id"] == evidence["id"]
    assert metadata["duration_seconds"] == 91.25
    assert metadata["width"] == 1920
    fetched = client.get(f"/v1/cases/{case_id}/evidence/{evidence['id']}/video-metadata")
    assert fetched.status_code == 200
    assert fetched.json()["height"] == 1080

    photo = client.post(
        f"/v1/cases/{case_id}/evidence",
        json={"type": "PHOTO", "source": "INSURED", "source_ref": "scene.jpg", "sha256": "d" * 64, "media_type": "image/jpeg", "size_bytes": 200},
    ).json()
    rejected = client.post(
        f"/v1/cases/{case_id}/evidence/{photo['id']}/video-metadata",
        json={"duration_seconds": 3},
    )
    assert rejected.status_code == 422


def test_investigator_report_is_downloadable(client):
    case = client.post("/v1/cases", json={"title": "Reportable collision", "incident_at": datetime(2026, 8, 18, 12, 31, 50, tzinfo=timezone.utc).isoformat(), "location": {"lat": -26.2466, "lon": 28.0205}}).json()
    report = client.get(f"/v1/cases/{case['id']}/report")
    assert report.status_code == 200
    assert report.headers["content-type"].startswith("text/html")
    assert "attachment" in report.headers["content-disposition"]
    assert case["id"] in report.text
    assert "INVESTIGATOR REVIEW REQUIRED" in report.text
    assert "does not determine legal liability" in report.text


def test_case_listing_is_tenant_scoped_and_reports_evidence_counts(client):
    first = client.post("/v1/cases", json={"title": "Case one"}).json()
    second = client.post("/v1/cases", json={"title": "Case two"}).json()
    evidence = client.post(f"/v1/cases/{first['id']}/evidence", json={"type": "PHOTO", "source": "UPLOAD", "sha256": "b" * 64})
    assert evidence.status_code == 201
    listed = client.get("/v1/cases")
    assert listed.status_code == 200
    payload = listed.json()
    assert {item["id"] for item in payload} == {first["id"], second["id"]}
    counts = {item["id"]: item["evidence_count"] for item in payload}
    assert counts[first["id"]] == 1
    assert counts[second["id"]] == 0


def test_telemetry_is_normalized_persisted_and_tenant_scoped(client):
    case_id = client.post("/v1/cases", json={"title": "GPS reconstruction case"}).json()["id"]
    first_timestamp = datetime(2026, 8, 18, 12, 31, 49, tzinfo=timezone.utc)
    second_timestamp = datetime(2026, 8, 18, 12, 31, 51, tzinfo=timezone.utc)
    response = client.post(f"/v1/cases/{case_id}/telemetry", json={"points": [
        {"timestamp": second_timestamp.isoformat(), "timestamp_local": "2026-08-18 14:31:51", "source_timezone": "Africa/Johannesburg", "assumed_timezone": False, "lat": -26.24655, "lon": 28.02060, "speed_kph": 42.0, "vehicle_id": "VH-A"},
        {"timestamp": first_timestamp.isoformat(), "timestamp_local": "2026-08-18 14:31:49", "source_timezone": "Africa/Johannesburg", "assumed_timezone": False, "lat": -26.24670, "lon": 28.02040, "speed_kph": 36.0, "vehicle_id": "VH-A"},
    ]})
    assert response.status_code == 201
    body = response.json()
    assert len(body) == 2
    assert body[0]["timestamp"].endswith("Z")
    assert body[0]["vehicle_id"] == "VH-A"
    stored = client.get(f"/v1/cases/{case_id}/telemetry")
    assert stored.status_code == 200
    assert [item["timestamp"] for item in stored.json()] == sorted(item["timestamp"] for item in stored.json())
    assert len(stored.json()) == 2


def test_invalid_hash_is_rejected(client):
    case_id = client.post("/v1/cases", json={"title": "Hash validation case"}).json()["id"]
    invalid = client.post(f"/v1/cases/{case_id}/evidence", json={"type": "PHOTO", "source": "USER_UPLOAD", "sha256": "not-a-sha256"})
    assert invalid.status_code == 422


def test_invalid_location_and_naive_incident_time_are_rejected(client):
    invalid_location = client.post("/v1/cases", json={"title": "Location case", "location": {"lat": 95, "lon": 28}})
    assert invalid_location.status_code == 422
    naive_time = client.post("/v1/cases", json={"title": "Time case", "incident_at": "2026-08-18T12:31:50"})
    assert naive_time.status_code == 422


def test_authentication_and_tenant_isolation(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAIMTRACE_DB_PATH", str(tmp_path / "claimtrace.sqlite3")); monkeypatch.delenv("DATABASE_URL", raising=False); monkeypatch.setenv("CLAIMTRACE_AUTH_MODE", "required")
    storage.init_database(); storage.reset_database(); now = datetime.now(timezone.utc)
    storage.insert_tenant({"id": "TENANT-A", "name": "Tenant A", "created_at": now})
    storage.insert_tenant({"id": "TENANT-B", "name": "Tenant B", "created_at": now})
    storage.insert_user({"id": "USR-A", "tenant_id": "TENANT-A", "email": "a@example.com", "password_hash": hash_password("correct horse battery staple"), "role": "ADMIN", "created_at": now})
    storage.insert_user({"id": "USR-B", "tenant_id": "TENANT-B", "email": "b@example.com", "password_hash": hash_password("correct horse battery staple"), "role": "ADMIN", "created_at": now})
    with TestClient(app) as test_client:
        assert test_client.post("/v1/cases", json={"title": "blocked"}).status_code == 401
        token_a = test_client.post("/v1/auth/login", json={"email": "a@example.com", "password": "correct horse battery staple"}).json()["access_token"]
        token_b = test_client.post("/v1/auth/login", json={"email": "b@example.com", "password": "correct horse battery staple"}).json()["access_token"]
        headers_a = {"Authorization": f"Bearer {token_a}"}; headers_b = {"Authorization": f"Bearer {token_b}"}
        case = test_client.post("/v1/cases", headers=headers_a, json={"title": "Private case A"}); assert case.status_code == 201; case_id = case.json()["id"]
        other_case = test_client.post("/v1/cases", headers=headers_b, json={"title": "Private case B"}); assert other_case.status_code == 201
        assert test_client.get(f"/v1/cases/{case_id}", headers=headers_b).status_code == 404
        assert [item["id"] for item in test_client.get("/v1/cases", headers=headers_a).json()] == [case_id]
        assert [item["id"] for item in test_client.get("/v1/cases", headers=headers_b).json()] == [other_case.json()["id"]]
        audit = test_client.get(f"/v1/cases/{case_id}/audit", headers=headers_a); assert audit.status_code == 200
        assert any(item["action"] == "CASE_CREATED" for item in audit.json())


def test_expired_session_is_rejected(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAIMTRACE_DB_PATH", str(tmp_path / "claimtrace.sqlite3")); monkeypatch.delenv("DATABASE_URL", raising=False); monkeypatch.setenv("CLAIMTRACE_AUTH_MODE", "required"); monkeypatch.setenv("CLAIMTRACE_SESSION_HOURS", "1")
    storage.init_database(); storage.reset_database(); now = datetime.now(timezone.utc)
    storage.insert_tenant({"id": "TENANT-X", "name": "Tenant X", "created_at": now})
    storage.insert_user({"id": "USR-X", "tenant_id": "TENANT-X", "email": "x@example.com", "password_hash": hash_password("correct horse battery staple"), "role": "ADMIN", "created_at": now})
    from app.auth import _hash_token
    storage.insert_session({"id": "SES-X", "user_id": "USR-X", "token_hash": _hash_token("expired"), "expires_at": now - timedelta(minutes=1), "created_at": now - timedelta(hours=1)})
    with TestClient(app) as test_client:
        assert test_client.get("/v1/auth/me", headers={"Authorization": "Bearer expired"}).status_code == 401
