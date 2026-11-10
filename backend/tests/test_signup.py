import pytest
from fastapi.testclient import TestClient

from app import storage
from app.main import app


@pytest.fixture
def client(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAIMTRACE_DB_PATH", str(tmp_path / "c.sqlite3"))
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.setenv("CLAIMTRACE_AUTH_MODE", "required")
    monkeypatch.setenv("CLAIMTRACE_CORS_ORIGINS", "*")
    monkeypatch.setenv("CLAIMTRACE_OBJECT_STORAGE_MODE", "filesystem")
    monkeypatch.setenv("CLAIMTRACE_OBJECT_STORAGE_DIR", str(tmp_path / "o"))
    storage.init_database()
    storage.reset_database()
    with TestClient(app) as c:
        yield c


def test_open_signup_isolated_tenants(client):
    a = client.post("/v1/auth/register", json={"email": "a@x.co.za", "password": "correct-horse-1", "company_name": "A Assessors"})
    b = client.post("/v1/auth/register", json={"email": "b@x.co.za", "password": "correct-horse-2", "company_name": "B Assessors"})
    assert a.status_code == 200 and b.status_code == 200
    ta, tb = a.json()["user"]["tenant_id"], b.json()["user"]["tenant_id"]
    assert ta != tb
    ha = {"Authorization": "Bearer " + a.json()["access_token"]}
    hb = {"Authorization": "Bearer " + b.json()["access_token"]}
    created = client.post("/v1/cases", headers=ha, json={"title": "Case A"})
    assert created.status_code in (200, 201)
    assert client.get("/v1/cases", headers=hb).json() == []
    assert len(client.get("/v1/cases", headers=ha).json()) == 1
    assert client.post("/v1/auth/login", json={"email": "a@x.co.za", "password": "correct-horse-1"}).status_code == 200


def test_signup_validation(client):
    assert client.post("/v1/auth/register", json={"email": "a@x.co.za", "password": "short", "company_name": "A"}).status_code == 422
    ok = {"email": "c@x.co.za", "password": "correct-horse-3", "company_name": "C Co"}
    assert client.post("/v1/auth/register", json=ok).status_code == 200
    assert client.post("/v1/auth/register", json=ok).status_code == 409


def test_logout_revokes_only_current_session(client):
    payload = {"email":"logout@qa.invalid", "password":"test-logout-fixture-0626", "company_name":"Synthetic Logout"}
    registered = client.post("/v1/auth/register", json=payload)
    assert registered.status_code == 200
    first = {"Authorization":"Bearer " + registered.json()["access_token"]}
    second = {"Authorization":"Bearer " + client.post("/v1/auth/login", json=payload).json()["access_token"]}
    assert client.post("/v1/auth/logout", headers=first).status_code == 204
    assert client.get("/v1/auth/me", headers=first).status_code == 401
    assert client.get("/v1/auth/me", headers=second).status_code == 200


def test_logout_requires_session(client):
    assert client.post("/v1/auth/logout").status_code == 401
