import hashlib
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

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


def test_case_and_evidence_lifecycle(client):
    case_response = client.post(
        "/v1/cases",
        json={
            "title": "Synthetic motor collision",
            "incident_at": datetime(2026, 8, 18, 12, 31, 50, tzinfo=timezone.utc).isoformat(),
            "location": {"lat": -26.2466, "lon": 28.0205},
        },
    )
    assert case_response.status_code == 201
    case = case_response.json()
    assert case["id"].startswith("CLM-")
    assert case["evidence_count"] == 0

    evidence_response = client.post(
        f"/v1/cases/{case['id']}/evidence",
        json={
            "type": "DASHCAM",
            "source": "USER_UPLOAD",
            "source_ref": "dashcam.mp4",
            "sha256": "a" * 64,
            "captured_at": datetime(2026, 8, 18, 12, 31, 50, tzinfo=timezone.utc).isoformat(),
            "media_type": "video/mp4",
            "size_bytes": 1234,
        },
    )
    assert evidence_response.status_code == 201
    evidence = evidence_response.json()
    assert evidence["case_id"] == case["id"]
    assert evidence["sha256"] == "a" * 64
    assert evidence["chain_of_custody"][0]["action"] == "INGESTED"

    stored_case = client.get(f"/v1/cases/{case['id']}").json()
    assert stored_case["evidence_count"] == 1

    listed = client.get(f"/v1/cases/{case['id']}/evidence")
    assert listed.status_code == 200
    assert len(listed.json()) == 1
    assert listed.json()[0]["id"] == evidence["id"]


def test_file_upload_hashes_persists_and_serves_original(client):
    case_id = client.post("/v1/cases", json={"title": "Upload case"}).json()["id"]
    fixture = b"ClaimTrace server-side evidence intake fixture"
    digest = hashlib.sha256(fixture).hexdigest()

    response = client.post(
        f"/v1/cases/{case_id}/evidence/upload",
        data={"type": "PHOTO", "source": "USER_UPLOAD", "claimed_sha256": digest},
        files={"file": ("scene.txt", fixture, "text/plain")},
    )
    assert response.status_code == 201
    evidence = response.json()
    assert evidence["sha256"] == digest
    assert evidence["size_bytes"] == len(fixture)
    assert evidence["artifact_path"].startswith("TENANT-DEMO/")

    artifact = client.get(f"/v1/cases/{case_id}/evidence/{evidence['id']}/artifact")
    assert artifact.status_code == 200
    assert artifact.content == fixture
    assert artifact.headers["content-type"].startswith("text/plain")

    duplicate = client.post(
        f"/v1/cases/{case_id}/evidence/upload",
        data={"type": "PHOTO"},
        files={"file": ("scene.txt", fixture, "text/plain")},
    )
    assert duplicate.status_code == 409


def test_investigator_report_is_downloadable(client):
    case = client.post(
        "/v1/cases",
        json={
            "title": "Reportable collision",
            "incident_at": datetime(2026, 8, 18, 12, 31, 50, tzinfo=timezone.utc).isoformat(),
            "location": {"lat": -26.2466, "lon": 28.0205},
        },
    ).json()
    report = client.get(f"/v1/cases/{case['id']}/report")
    assert report.status_code == 200
    assert report.headers["content-type"].startswith("text/html")
    assert "attachment" in report.headers["content-disposition"]
    assert case["id"] in report.text
    assert "INVESTIGATOR REVIEW REQUIRED" in report.text
    assert "does not determine legal liability" in report.text


def test_invalid_hash_is_rejected(client):
    case_id = client.post("/v1/cases", json={"title": "Hash validation case"}).json()["id"]
    invalid = client.post(
        f"/v1/cases/{case_id}/evidence",
        json={"type": "PHOTO", "source": "USER_UPLOAD", "sha256": "not-a-sha256"},
    )
    assert invalid.status_code == 422


def test_invalid_location_and_naive_incident_time_are_rejected(client):
    invalid_location = client.post(
        "/v1/cases",
        json={"title": "Location case", "location": {"lat": 95, "lon": 28}},
    )
    assert invalid_location.status_code == 422

    naive_time = client.post(
        "/v1/cases",
        json={"title": "Time case", "incident_at": "2026-08-18T12:31:50"},
    )
    assert naive_time.status_code == 422


def test_authentication_and_tenant_isolation(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAIMTRACE_DB_PATH", str(tmp_path / "claimtrace.sqlite3"))
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.setenv("CLAIMTRACE_AUTH_MODE", "required")
    storage.init_database()
    storage.reset_database()

    now = datetime.now(timezone.utc)
    storage.insert_tenant({"id": "TENANT-A", "name": "Tenant A", "created_at": now})
    storage.insert_tenant({"id": "TENANT-B", "name": "Tenant B", "created_at": now})
    storage.insert_user({"id": "USR-A", "tenant_id": "TENANT-A", "email": "a@example.com", "password_hash": hash_password("correct horse battery staple"), "role": "ADMIN", "created_at": now})
    storage.insert_user({"id": "USR-B", "tenant_id": "TENANT-B", "email": "b@example.com", "password_hash": hash_password("correct horse battery staple"), "role": "ADMIN", "created_at": now})

    with TestClient(app) as test_client:
        no_auth = test_client.post("/v1/cases", json={"title": "blocked"})
        assert no_auth.status_code == 401

        login_a = test_client.post("/v1/auth/login", json={"email": "a@example.com", "password": "correct horse battery staple"})
        assert login_a.status_code == 200
        token_a = login_a.json()["access_token"]

        login_b = test_client.post("/v1/auth/login", json={"email": "b@example.com", "password": "correct horse battery staple"})
        assert login_b.status_code == 200
        token_b = login_b.json()["access_token"]

        headers_a = {"Authorization": f"Bearer {token_a}"}
        headers_b = {"Authorization": f"Bearer {token_b}"}
        case = test_client.post("/v1/cases", headers=headers_a, json={"title": "Private case A"})
        assert case.status_code == 201
        case_id = case.json()["id"]

        hidden = test_client.get(f"/v1/cases/{case_id}", headers=headers_b)
        assert hidden.status_code == 404

        audit = test_client.get(f"/v1/cases/{case_id}/audit", headers=headers_a)
        assert audit.status_code == 200
        assert any(item["action"] == "CASE_CREATED" for item in audit.json())


def test_expired_session_is_rejected(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAIMTRACE_DB_PATH", str(tmp_path / "claimtrace.sqlite3"))
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.setenv("CLAIMTRACE_AUTH_MODE", "required")
    monkeypatch.setenv("CLAIMTRACE_SESSION_HOURS", "1")
    storage.init_database()
    storage.reset_database()

    now = datetime.now(timezone.utc)
    storage.insert_tenant({"id": "TENANT-X", "name": "Tenant X", "created_at": now})
    storage.insert_user({"id": "USR-X", "tenant_id": "TENANT-X", "email": "x@example.com", "password_hash": hash_password("correct horse battery staple"), "role": "ADMIN", "created_at": now})
    from app.auth import _hash_token
    storage.insert_session({"id": "SES-X", "user_id": "USR-X", "token_hash": _hash_token("expired"), "expires_at": now - timedelta(minutes=1), "created_at": now - timedelta(hours=1)})

    with TestClient(app) as test_client:
        response = test_client.get("/v1/auth/me", headers={"Authorization": "Bearer expired"})
        assert response.status_code == 401
