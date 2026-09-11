from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app import storage
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
