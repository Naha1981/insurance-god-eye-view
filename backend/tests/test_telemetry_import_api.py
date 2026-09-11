from __future__ import annotations

from datetime import datetime, timezone


def test_raw_telemetry_csv_import_creates_evidence_and_provenance(client):
    case = client.post("/v1/cases", json={"title": "Raw GPS import case"}).json()
    csv_payload = (
        "timestamp,latitude,longitude,speed_kph,vehicle_id\n"
        "2026-08-18 14:31:49,-26.24670,28.02040,36.0,VH-A\n"
        "2026-08-18 14:31:51,-26.24655,28.02060,42.0,VH-A\n"
        "not-a-time,-26.24650,28.02070,41.0,VH-A\n"
    ).encode()

    response = client.post(
        f"/v1/cases/{case['id']}/telemetry/import",
        data={"source_timezone": "Africa/Johannesburg", "source": "TELEMATICS_EXPORT"},
        files={"file": ("trip.csv", csv_payload, "text/csv")},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["case_id"] == case["id"]
    assert body["point_count"] == 2
    assert body["rejected_rows"] == 1
    assert len(body["sha256"]) == 64
    assert body["first_timestamp_utc"].endswith("Z")
    assert body["last_timestamp_utc"].endswith("Z")

    evidence = client.get(f"/v1/cases/{case['id']}/evidence")
    assert evidence.status_code == 200
    items = evidence.json()
    assert len(items) == 1
    assert items[0]["id"] == body["evidence_id"]
    assert items[0]["type"] == "GPS"
    assert items[0]["sha256"] == body["sha256"]

    telemetry = client.get(f"/v1/cases/{case['id']}/telemetry")
    assert telemetry.status_code == 200
    points = telemetry.json()
    assert len(points) == 2
    assert points[0]["timestamp"].endswith("Z")
    assert points[1]["derived_speed_kph"] is not None

    provenance = client.get(f"/v1/cases/{case['id']}/telemetry/provenance")
    assert provenance.status_code == 200
    links = provenance.json()
    assert len(links) == 2
    assert {link["evidence_id"] for link in links} == {body["evidence_id"]}
    assert {link["telemetry_point_id"] for link in links} == {point["id"] for point in points}


def test_raw_telemetry_import_rejects_non_csv_and_duplicate_content(client):
    case = client.post("/v1/cases", json={"title": "Telemetry validation"}).json()
    bad = client.post(
        f"/v1/cases/{case['id']}/telemetry/import",
        data={"source_timezone": "Africa/Johannesburg"},
        files={"file": ("trip.txt", b"timestamp,lat,lon\n2026-08-18T12:31:50Z,-26.2,28.0\n", "text/plain")},
    )
    assert bad.status_code == 415

    content = b"timestamp,lat,lon\n2026-08-18T12:31:50Z,-26.2,28.0\n"
    first = client.post(
        f"/v1/cases/{case['id']}/telemetry/import",
        data={"source_timezone": "Africa/Johannesburg"},
        files={"file": ("trip.csv", content, "text/csv")},
    )
    assert first.status_code == 200

    duplicate = client.post(
        f"/v1/cases/{case['id']}/telemetry/import",
        data={"source_timezone": "Africa/Johannesburg"},
        files={"file": ("trip-again.csv", content, "text/csv")},
    )
    assert duplicate.status_code == 409
