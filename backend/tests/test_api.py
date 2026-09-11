import hashlib
from datetime import datetime, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app import storage

client = TestClient(app)


@pytest.fixture(autouse=True)
def isolated_storage(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAIMTRACE_DB_PATH", str(tmp_path / "claimtrace.sqlite3"))
    monkeypatch.setenv("CLAIMTRACE_STORAGE_ROOT", str(tmp_path / "evidence"))
    storage.init_database()
    storage.reset_database()


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "claimtrace-evidence-api"}


def test_case_and_evidence_lifecycle():
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


def test_file_upload_hashes_and_persists_original(tmp_path):
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
    assert evidence["artifact_path"]

    artifact = Path(evidence["artifact_path"])
    assert artifact.exists()
    assert artifact.read_bytes() == fixture

    duplicate = client.post(
        f"/v1/cases/{case_id}/evidence/upload",
        data={"type": "PHOTO"},
        files={"file": ("scene.txt", fixture, "text/plain")},
    )
    assert duplicate.status_code == 409


def test_invalid_hash_is_rejected():
    response = client.post(
        "/v1/cases",
        json={"title": "Hash validation case"},
    )
    case_id = response.json()["id"]

    invalid = client.post(
        f"/v1/cases/{case_id}/evidence",
        json={
            "type": "PHOTO",
            "source": "USER_UPLOAD",
            "sha256": "not-a-sha256",
        },
    )
    assert invalid.status_code == 422


def test_invalid_location_and_naive_incident_time_are_rejected():
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
