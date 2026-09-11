from __future__ import annotations

import hashlib
import hmac
import os
import secrets
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from fastapi import Depends, Header, HTTPException, status
from pydantic import BaseModel, EmailStr, Field

from . import storage

SESSION_HOURS = int(os.getenv("CLAIMTRACE_SESSION_HOURS", "12"))
PBKDF2_ITERATIONS = 310_000


class Principal(BaseModel):
    user_id: str
    tenant_id: str
    email: EmailStr
    role: str


def auth_required() -> bool:
    return os.getenv("CLAIMTRACE_AUTH_MODE", "required").lower() != "disabled"


def _hash_password(password: str, salt: bytes) -> str:
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ITERATIONS)
    return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${salt.hex()}${digest.hex()}"


def hash_password(password: str) -> str:
    if len(password) < 12:
        raise ValueError("Password must contain at least 12 characters")
    return _hash_password(password, secrets.token_bytes(16))


def verify_password(password: str, encoded: str) -> bool:
    try:
        algorithm, iterations, salt_hex, digest_hex = encoded.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        expected = bytes.fromhex(digest_hex)
        actual = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), bytes.fromhex(salt_hex), int(iterations))
        return hmac.compare_digest(actual, expected)
    except (TypeError, ValueError):
        return False


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def ensure_bootstrap_user() -> None:
    email = os.getenv("CLAIMTRACE_BOOTSTRAP_EMAIL", "").strip().lower()
    password = os.getenv("CLAIMTRACE_BOOTSTRAP_PASSWORD", "")
    if not email or not password:
        return
    existing = storage.get_user_by_email(email)
    if existing:
        return
    tenant_id = os.getenv("CLAIMTRACE_BOOTSTRAP_TENANT_ID", "TENANT-PILOT")
    tenant_name = os.getenv("CLAIMTRACE_BOOTSTRAP_TENANT_NAME", "ClaimTrace Pilot")
    now = datetime.now(timezone.utc)
    if storage.get_tenant(tenant_id) is None:
        storage.insert_tenant({"id": tenant_id, "name": tenant_name, "created_at": now})
    storage.insert_user({
        "id": f"USR-{uuid4()}",
        "tenant_id": tenant_id,
        "email": email,
        "password_hash": hash_password(password),
        "role": "ADMIN",
        "created_at": now,
    })


def authenticate(email: str, password: str) -> tuple[Principal, str] | None:
    user = storage.get_user_by_email(email.strip().lower())
    if not user or not verify_password(password, user["password_hash"]):
        return None
    token = secrets.token_urlsafe(48)
    now = datetime.now(timezone.utc)
    storage.insert_session({
        "id": f"SES-{uuid4()}",
        "user_id": user["id"],
        "token_hash": _hash_token(token),
        "expires_at": now + timedelta(hours=SESSION_HOURS),
        "created_at": now,
    })
    return Principal(user_id=user["id"], tenant_id=user["tenant_id"], email=user["email"], role=user["role"]), token


def principal_from_token(token: str) -> Principal | None:
    row = storage.get_session_by_hash(_hash_token(token), datetime.now(timezone.utc))
    if not row:
        return None
    return Principal(user_id=row["user_id"], tenant_id=row["tenant_id"], email=row["email"], role=row["role"])


def get_current_principal(authorization: str | None = Header(default=None)) -> Principal:
    if not auth_required():
        return Principal(user_id="system", tenant_id="TENANT-DEMO", email="demo@claimtrace.local", role="ADMIN")
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Bearer authentication required")
    principal = principal_from_token(authorization[7:].strip())
    if not principal:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired session")
    return principal


def require_admin(principal: Principal = Depends(get_current_principal)) -> Principal:
    if principal.role != "ADMIN":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Administrator role required")
    return principal
