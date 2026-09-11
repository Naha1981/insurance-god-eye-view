from __future__ import annotations

from datetime import datetime


def normalize_video_metadata(payload: dict) -> dict:
    duration = _number(payload.get("duration_seconds"))
    width = _int(payload.get("width"))
    height = _int(payload.get("height"))
    frame_rate = _number(payload.get("frame_rate"))
    capture_start_at = payload.get("capture_start_at")
    return {
        "duration_seconds": duration if duration is not None and duration >= 0 else None,
        "width": width if width is not None and width > 0 else None,
        "height": height if height is not None and height > 0 else None,
        "frame_rate": frame_rate if frame_rate is not None and frame_rate > 0 else None,
        "capture_start_at": _normalize_datetime(capture_start_at),
        "metadata_source": str(payload.get("metadata_source") or "BROWSER_MEDIA_ELEMENT")[:80],
        "metadata_version": str(payload.get("metadata_version") or "1")[:40],
    }


def _number(value):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if number == number and number not in (float("inf"), float("-inf")) else None


def _int(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _normalize_datetime(value):
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        parsed = value
    else:
        try:
            parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        except ValueError:
            return None
    return parsed if parsed.tzinfo is not None else None
