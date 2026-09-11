from __future__ import annotations


def test_frame_reference_is_persisted_as_case_audit_event(client):
    case = client.post('/v1/cases', json={'title': 'Frame reference case'}).json()
    video = client.post(
        f"/v1/cases/{case['id']}/evidence/upload",
        data={'type': 'DASHCAM', 'source': 'TEST'},
        files={'file': ('dashcam.mp4', b'not-a-real-video', 'video/mp4')},
    )
    assert video.status_code == 201
    evidence_id = video.json()['id']

    reference = client.post(
        f"/v1/cases/{case['id']}/evidence/{evidence_id}/frame-reference",
        json={
            'frame_index': 125,
            'timestamp': '2026-08-18T12:31:45.000Z',
            'note': 'Investigator synchronized frame reference',
        },
    )
    assert reference.status_code == 200
    body = reference.json()
    assert body['evidence_id'] == evidence_id
    assert body['frame_index'] == 125
    assert body['timestamp'] == '2026-08-18T12:31:45Z'
    assert body['id'].startswith('FRAME-')

    audit = client.get(f"/v1/cases/{case['id']}/audit")
    assert audit.status_code == 200
    matches = [item for item in audit.json() if item['action'] == 'FRAME_REFERENCE_CREATED']
    assert len(matches) == 1
    assert matches[0]['resource_id'] == case['id']
    assert matches[0]['metadata']['evidence_id'] == evidence_id
    assert matches[0]['metadata']['frame_index'] == 125
    assert matches[0]['metadata']['timestamp_utc'] == '2026-08-18T12:31:45Z'


def test_frame_reference_rejects_unknown_telemetry_point(client):
    case = client.post('/v1/cases', json={'title': 'Frame validation case'}).json()
    video = client.post(
        f"/v1/cases/{case['id']}/evidence/upload",
        data={'type': 'CCTV', 'source': 'TEST'},
        files={'file': ('cctv.mp4', b'not-a-real-video', 'video/mp4')},
    )
    assert video.status_code == 201
    evidence_id = video.json()['id']

    response = client.post(
        f"/v1/cases/{case['id']}/evidence/{evidence_id}/frame-reference",
        json={
            'frame_index': 4,
            'timestamp': '2026-08-18T12:31:45Z',
            'nearest_telemetry_point_id': 'GPS-NOT-IN-CASE',
        },
    )
    assert response.status_code == 422
