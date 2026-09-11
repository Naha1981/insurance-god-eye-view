from __future__ import annotations

import csv
import io
from dataclasses import dataclass
from typing import Any

from . import telemetry

MAX_IMPORT_ROWS = 100_000


class TelemetryImportError(ValueError):
    """Raised when a raw telemetry file cannot be safely normalized."""


@dataclass(frozen=True)
class TelemetryImportResult:
    points: list[dict[str, Any]]
    rejected_rows: int
    source_timezone: str


def parse_csv(content: bytes, source_timezone: str = "Africa/Johannesburg", *, max_rows: int = MAX_IMPORT_ROWS) -> TelemetryImportResult:
    if not content:
        raise TelemetryImportError("Telemetry file is empty")
    if max_rows < 1:
        raise TelemetryImportError("max_rows must be positive")

    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise TelemetryImportError("Telemetry CSV must be UTF-8 encoded") from exc

    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        raise TelemetryImportError("Telemetry CSV must contain a header row")

    normalized_headers = {str(name).strip().lower() for name in reader.fieldnames if name}
    timestamp_headers = {"timestamp", "time", "datetime", "captured_at", "date_time"}
    lat_headers = {"lat", "latitude"}
    lon_headers = {"lon", "lng", "longitude"}
    if not normalized_headers & timestamp_headers:
        raise TelemetryImportError("Telemetry CSV is missing a timestamp column")
    if not normalized_headers & lat_headers:
        raise TelemetryImportError("Telemetry CSV is missing a latitude column")
    if not normalized_headers & lon_headers:
        raise TelemetryImportError("Telemetry CSV is missing a longitude column")

    normalized_points: list[dict[str, Any]] = []
    rejected = 0
    for row_number, row in enumerate(reader, start=2):
        if row_number > max_rows + 1:
            raise TelemetryImportError(f"Telemetry CSV exceeds the {max_rows:,} row limit")
        cleaned = {str(key).strip(): value.strip() if isinstance(value, str) else value for key, value in row.items() if key}
        point = telemetry.normalize_point(cleaned, row_number - 2, source_timezone)
        if point is None:
            rejected += 1
            continue
        normalized_points.append(point)

    if not normalized_points:
        raise TelemetryImportError("Telemetry CSV contained no valid coordinate/timestamp rows")

    return TelemetryImportResult(
        points=telemetry.enrich_points(sorted(normalized_points, key=lambda item: item["timestamp_utc"])),
        rejected_rows=rejected,
        source_timezone=source_timezone,
    )
