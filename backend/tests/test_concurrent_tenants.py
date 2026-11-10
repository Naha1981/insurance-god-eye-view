from concurrent.futures import ThreadPoolExecutor
from fastapi.testclient import TestClient
from app import auth, storage
from app.main import app

def test_50_independent_tenants_concurrent_case_writes(monkeypatch, tmp_path):
    monkeypatch.delenv('DATABASE_URL', raising=False)
    monkeypatch.setenv('CLAIMTRACE_DB_PATH', str(tmp_path / 'stress.sqlite3'))
    monkeypatch.setenv('CLAIMTRACE_AUTH_MODE', 'required')
    monkeypatch.setenv('CLAIMTRACE_OBJECT_STORAGE_MODE', 'filesystem')
    monkeypatch.setenv('CLAIMTRACE_OBJECT_STORAGE_DIR', str(tmp_path / 'objects'))
    storage.init_database()
    # Fixture setup, not traffic through or a bypass of the public signup limiter.
    accounts = [auth.register(f'stress-{i}@qa.invalid', 'synthetic-stress-fixture', f'Synthetic Tenant {i}') for i in range(50)]
    with TestClient(app) as client:
        def journey(account):
            principal, token = account
            headers = {'Authorization': 'Bearer ' + token}
            created = client.post('/v1/cases', headers=headers, json={'title': 'SYNTHETIC ' + principal.tenant_id})
            assert created.status_code == 201, created.text
            own = client.get('/v1/cases', headers=headers)
            assert own.status_code == 200
            assert len(own.json()) == 1
            assert own.json()[0]['id'] == created.json()['id']
            assert own.json()[0]['title'] == 'SYNTHETIC ' + principal.tenant_id
            return (headers, created.json()['id'])
        with ThreadPoolExecutor(max_workers=50) as pool:
            results = list(pool.map(journey, accounts))
        for i, (headers, _) in enumerate(results):
            foreign_id = results[(i + 1) % 50][1]
            assert client.get('/v1/cases/' + foreign_id, headers=headers).status_code == 404
    # A fresh application client must still see the persisted own case only.
    with TestClient(app) as restarted:
        for headers, own_id in results:
            data = restarted.get('/v1/cases', headers=headers)
            assert data.status_code == 200
            assert [item['id'] for item in data.json()] == [own_id]
