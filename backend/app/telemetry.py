from __future__ import annotations

import math
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

SOUTH_AFRICA_TIME_ZONE = ZoneInfo("Africa/Johannesburg")


def _number(value):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def normalize_coordinate(lat=None, lon=None, latitude=None, longitude=None):
    normalized_lat = _number(lat if lat is not None else latitude)
    normalized_lon = _number(lon if lon is not None else longitude)
    if normalized_lat is None or normalized_lon is None:
        return None
    if not -90 <= normalized_lat <= 90:
        return None
    normalized_lon = ((normalized_lon + 180) % 360) - 180
    return {"lat": normalized_lat, "lon": normalized_lon}


def normalize_timestamp(value, source_timezone: str = "Africa/Johannesburg"):
    if not value:
        return None
    raw = str(value).strip()
    if not raw:
        return None
    candidate = raw.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(candidate)
    except ValueError:
        try:
            parsed = datetime.strptime(raw, "%Y-%m-%d %H:%M:%S")
        except ValueError:
            return None
    assumed_timezone = parsed.tzinfo is None
    if assumed_timezone:
        parsed = parsed.replace(tzinfo=ZoneInfo(source_timezone))
    utc = parsed.astimezone(timezone.utc)
    local = utc.astimezone(ZoneInfo(source_timezone))
    return {
        "utc": utc.isoformat().replace("+00:00", "Z"),
        "local": local.isoformat(),
        "source_timezone": source_timezone,
        "assumed_timezone": assumed_timezone,
    }


def normalize_point(point: dict, index: int, source_timezone: str = "Africa/Johannesburg"):
    coordinate = normalize_coordinate(**point)
    timestamp = normalize_timestamp(point.get("timestamp") or point.get("time") or point.get("datetime") or point.get("captured_at"), source_timezone)
    if not coordinate or not timestamp:
        return None
    return {
        "id": str(point.get("id") or f"GPS-{index + 1:05d}"),
        "timestamp_utc": timestamp["utc"],
        "timestamp_local": timestamp["local"],
        "source_timezone": timestamp["source_timezone"],
        "assumed_timezone": timestamp["assumed_timezone"],
        "lat": coordinate["lat"],
        "lon": coordinate["lon"],
        "speed_kph": _number(point.get("speed_kph", point.get("speedKph", point.get("speed")))),
        "heading_deg": _number(point.get("heading_deg", point.get("headingDeg", point.get("heading")))),
        "accuracy_meters": _number(point.get("accuracy_meters", point.get("accuracyMeters", point.get("accuracy")))),
        "vehicle_id": point.get("vehicle_id", point.get("vehicleId")),
    }


def normalize_points(points: list[dict], source_timezone: str = "Africa/Johannesburg"):
    normalized = [item for index, point in enumerate(points) if (item := normalize_point(point, index, source_timezone))]
    return sorted(normalized, key=lambda item: item["timestamp_utc"])


def enrich_points(points: list[dict]):
    enriched = []
    previous = None
    for point in points:
        item = dict(point)
        item["segment_distance_meters"] = 0.0
        item["elapsed_seconds"] = 0.0
        item["derived_speed_kph"] = None
        if previous:
            lat1, lon1 = map(math.radians, (previous["lat"], previous["lon"]))
            lat2, lon2 = map(math.radians, (point["lat"], point["lon"]))
            dlat = lat2 - lat1
            dlon = lon2 - lon1
            a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
            distance = 6371008.8 * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
            elapsed = max(0.0, (datetime.fromisoformat(point["timestamp_utc"].replace("Z", "+00:00")) - datetime.fromisoformat(previous["timestamp_utc"].replace("Z", "+00:00"))).total_seconds())
            item["segment_distance_meters"] = round(distance, 2)
            item["elapsed_seconds"] = elapsed
            item["derived_speed_kph"] = round(distance / elapsed * 3.6, 2) if elapsed else None
        enriched.append(item)
        previous = item
    return enriched
