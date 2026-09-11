from datetime import datetime, timezone

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


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
