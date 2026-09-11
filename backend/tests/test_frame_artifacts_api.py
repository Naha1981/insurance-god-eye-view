import hashlib


def test_frame_artifact_persists_and_is_tenant_scoped(client):
    case = client.post("/v1/cases", json={"title": "Frame artifact case"}).json()
    video_bytes = b"synthetic-video-source"
    video_hash = hashlib.sha256(video_bytes).hexdigest()
    evidence = client.post(
        f"/v1/cases/{case['id']}/evidence",
        json={
            "type": "DASHCAM",
            "source": "TEST",
            "source_ref": "dashcam.mp4",
            "sha256": video_hash,
            "media_type": "video/mp4",
            "size_bytes": len(video_bytes),
        },
    )
    assert evidence.status_code == 201
    evidence_id = evidence.json()["id"]

    png = b"\x89PNG\r\n\x1a\n" + b"frame-payload"
    response = client.post(
        f"/v1/cases/{case['id']}/frame-artifacts",
        data={
            "evidence_id": evidence_id,
            "frame_index": "25",
            "timestamp_utc": "2026-08-18T12:31:42.000Z",
        },
        files={"file": ("frame-25.png", png, "image/png")},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["evidence_id"] == evidence_id
    assert body["frame_index"] == 25
    assert body["media_type"] == "image/png"
    assert body["sha256"] == hashlib.sha256(png).hexdigest()

    listing = client.get(f"/v1/cases/{case['id']}/frame-artifacts")
    assert listing.status_code == 200
    assert len(listing.json()) == 1
    assert listing.json()[0]["id"] == body["id"]

    artifact = client.get(f"/v1/cases/{case['id']}/frame-artifacts/{body['id']}")
    assert artifact.status_code == 200
    assert artifact.headers["content-type"].startswith("image/png")
    assert artifact.content == png


def test_frame_artifact_rejects_non_png(client):
    case = client.post("/v1/cases", json={"title": "Frame format validation"}).json()
    video_bytes = b"another-video"
    evidence = client.post(
        f"/v1/cases/{case['id']}/evidence",
        json={
            "type": "CCTV",
            "source": "TEST",
            "source_ref": "cctv.mp4",
            "sha256": hashlib.sha256(video_bytes).hexdigest(),
            "media_type": "video/mp4",
            "size_bytes": len(video_bytes),
        },
    ).json()
    response = client.post(
        f"/v1/cases/{case['id']}/frame-artifacts",
        data={
            "evidence_id": evidence["id"],
            "frame_index": "1",
            "timestamp_utc": "2026-08-18T12:31:42.000Z",
        },
        files={"file": ("frame.jpg", b"not-a-png", "image/jpeg")},
    )
    assert response.status_code == 415
