import pytest

from app.telemetry_import import TelemetryImportError, parse_csv


def test_parse_csv_normalizes_timezone_coordinates_and_derived_speed():
    csv_bytes = b"timestamp,latitude,longitude,speed_kph,vehicle_id\n2026-08-18 14:31:49,-26.24670,28.02040,36,VH-A\n2026-08-18 14:31:51,-26.24655,28.02060,42,VH-A\n"

    result = parse_csv(csv_bytes)

    assert result.rejected_rows == 0
    assert len(result.points) == 2
    assert result.points[0]["timestamp_utc"].endswith("Z")
    assert result.points[0]["assumed_timezone"] is True
    assert result.points[0]["lat"] == -26.2467
    assert result.points[1]["derived_speed_kph"] is not None
    assert result.points[1]["vehicle_id"] == "VH-A"


def test_parse_csv_accepts_explicit_utc_and_rejects_invalid_rows():
    csv_bytes = b"time,lat,lng\n2026-08-18T12:31:49Z,-26.24670,28.02040\nnot-a-time,-26.2,28.0\n"

    result = parse_csv(csv_bytes)

    assert len(result.points) == 1
    assert result.rejected_rows == 1
    assert result.points[0]["assumed_timezone"] is False


def test_parse_csv_requires_core_columns():
    with pytest.raises(TelemetryImportError, match="latitude"):
        parse_csv(b"timestamp,longitude\n2026-08-18T12:31:49Z,28.02\n")


def test_parse_csv_rejects_non_utf8():
    with pytest.raises(TelemetryImportError, match="UTF-8"):
        parse_csv(b"timestamp,lat,lon\n\xff,-26,28\n")
