from __future__ import annotations

import hashlib
import os
from pathlib import Path


class ObjectStorageError(RuntimeError):
    pass


def _mode() -> str:
    return os.getenv("CLAIMTRACE_OBJECT_STORAGE_MODE", "filesystem").strip().lower()


def _root() -> Path:
    root = Path(os.getenv("CLAIMTRACE_OBJECT_STORAGE_DIR", ".claimtrace-object-store")).resolve()
    root.mkdir(parents=True, exist_ok=True)
    return root


def _key_path(key: str) -> Path:
    safe = "/".join(part for part in key.replace("\\", "/").split("/") if part not in {"", ".", ".."})
    return _root() / safe


def _s3_client():
    try:
        import boto3
    except ImportError as exc:  # pragma: no cover
        raise ObjectStorageError("boto3 is required for S3-compatible object storage") from exc
    endpoint = os.getenv("CLAIMTRACE_OBJECT_STORAGE_ENDPOINT")
    region = os.getenv("CLAIMTRACE_OBJECT_STORAGE_REGION", "us-east-1")
    return boto3.client("s3", endpoint_url=endpoint or None, region_name=region)


def _bucket() -> str:
    bucket = os.getenv("CLAIMTRACE_OBJECT_STORAGE_BUCKET")
    if not bucket:
        raise ObjectStorageError("CLAIMTRACE_OBJECT_STORAGE_BUCKET is required for S3-compatible storage")
    return bucket


def put_bytes(*, key: str, content: bytes, media_type: str | None = None) -> str:
    digest = hashlib.sha256(content).hexdigest()
    if _mode() == "s3":
        client = _s3_client()
        bucket = _bucket()
        kwargs = {"Bucket": bucket, "Key": key, "Body": content}
        if media_type:
            kwargs["ContentType"] = media_type
        lock_mode = os.getenv("CLAIMTRACE_OBJECT_LOCK_MODE")
        retain_days = int(os.getenv("CLAIMTRACE_OBJECT_LOCK_DAYS", "0"))
        if lock_mode and retain_days > 0:
            from datetime import datetime, timedelta, timezone
            kwargs["ObjectLockMode"] = lock_mode.upper()
            kwargs["ObjectLockRetainUntilDate"] = datetime.now(timezone.utc) + timedelta(days=retain_days)
        try:
            existing = client.get_object(Bucket=bucket, Key=key)["Body"].read()
            if hashlib.sha256(existing).hexdigest() != digest:
                raise ObjectStorageError("Immutable object key already exists with different bytes")
            return key
        except Exception as exc:
            code = getattr(exc, "response", {}).get("Error", {}).get("Code")
            if code not in {"404", "NoSuchKey", "NotFound"}:
                raise ObjectStorageError(f"Object storage preflight failed: {exc}") from exc
        client.put_object(**kwargs)
        return key

    path = _key_path(key)
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        existing = path.read_bytes()
        if hashlib.sha256(existing).hexdigest() != digest:
            raise ObjectStorageError("Immutable object key already exists with different bytes")
        return key
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_bytes(content)
    os.replace(tmp, path)
    return key


def get_bytes(*, key: str) -> bytes:
    if _mode() == "s3":
        try:
            response = _s3_client().get_object(Bucket=_bucket(), Key=key)
            return response["Body"].read()
        except Exception as exc:
            raise ObjectStorageError(f"Object retrieval failed: {exc}") from exc
    path = _key_path(key)
    if not path.exists():
        raise FileNotFoundError(key)
    return path.read_bytes()


def delete_bytes(*, key: str) -> None:
    raise ObjectStorageError("ClaimTrace evidence objects are immutable and cannot be deleted by the application")


def describe() -> dict[str, str | bool]:
    return {"mode": _mode(), "immutable": True, "bucket_configured": bool(os.getenv("CLAIMTRACE_OBJECT_STORAGE_BUCKET"))}
