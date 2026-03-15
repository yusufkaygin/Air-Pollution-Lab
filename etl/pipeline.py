from __future__ import annotations

import csv
import json
import re
import unicodedata
from collections import defaultdict
from datetime import UTC, datetime
from pathlib import Path
from typing import Any


TIMESTAMP_PATTERNS = (
    "%Y-%m-%dT%H:%M:%SZ",
    "%Y-%m-%d %H:%M:%S",
    "%Y-%m-%d %H:%M",
    "%d.%m.%Y %H:%M",
    "%d/%m/%Y %H:%M",
)


def parse_timestamp(value: str) -> datetime:
    stripped = value.strip()

    for pattern in TIMESTAMP_PATTERNS:
        try:
            return datetime.strptime(stripped, pattern)
        except ValueError:
            continue

    try:
        return datetime.fromisoformat(stripped.replace("Z", "+00:00")).replace(
            tzinfo=None
        )
    except ValueError as exc:
        raise ValueError(f"Unsupported timestamp: {value}") from exc


def slugify_station_id(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    lowered = normalized.encode("ascii", "ignore").decode("ascii").lower()
    lowered = lowered.replace("/", "-").replace(" ", "-")
    lowered = re.sub(r"[^a-z0-9-]+", "-", lowered)
    lowered = re.sub(r"-{2,}", "-", lowered)
    return lowered.strip("-")


def convert_pollutant_unit(
    value: float, unit: str, pollutant: str
) -> tuple[float, str]:
    normalized = (
        unit.strip()
        .lower()
        .replace("\u03bc", "u")
        .replace("\u00b5", "u")
        .replace("ug", "u")
    )

    if pollutant == "CO":
        if "u" in normalized:
            return round(value / 1000.0, 6), "mg/m3"
        return value, "mg/m3"

    if "mg" in normalized:
        return round(value * 1000.0, 6), "ug/m3"

    return value, "ug/m3"


def deduplicate_records(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[tuple[str, str, str], list[dict[str, Any]]] = defaultdict(list)

    for record in records:
        grouped[
            (
                record["stationId"],
                record["timestamp"],
                record["pollutant"],
            )
        ].append(record)

    deduplicated: list[dict[str, Any]] = []

    for group in grouped.values():
        if len(group) == 1:
            deduplicated.append(group[0])
            continue

        mean_value = sum(item["value"] for item in group) / len(group)
        merged = dict(group[-1])
        merged["value"] = round(mean_value, 4)
        merged["qualityFlag"] = "screened"
        deduplicated.append(merged)

    deduplicated.sort(
        key=lambda item: (item["stationId"], item["timestamp"], item["pollutant"])
    )
    return deduplicated


def _read_csv_rows(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def _pick(row: dict[str, str], *keys: str, default: str = "") -> str:
    for key in keys:
        if key in row and row[key] not in ("", None):
            return row[key]
    return default


def load_air_quality_csv(path: Path) -> list[dict[str, Any]]:
    rows = _read_csv_rows(path)
    records: list[dict[str, Any]] = []

    for row in rows:
        station_name = _pick(
            row,
            "station_id",
            "stationId",
            "station_name",
            "Station",
            "Station_Name",
        )
        pollutant = _pick(row, "pollutant", "parameter", "Parameter").replace(
            "PM2,5", "PM2.5"
        )
        raw_value = _pick(row, "value", "Value", "measurement")
        raw_timestamp = _pick(
            row, "timestamp", "Timestamp", "read_time", "ReadTime", "date"
        )

        if not station_name or not pollutant or not raw_value or not raw_timestamp:
            continue

        timestamp = parse_timestamp(raw_timestamp).strftime("%Y-%m-%dT%H:%M:%SZ")
        value, unit = convert_pollutant_unit(
            float(str(raw_value).replace(",", ".")),
            _pick(row, "unit", "Unit", default="ug/m3"),
            pollutant,
        )
        records.append(
            {
                "stationId": slugify_station_id(station_name),
                "timestamp": timestamp,
                "pollutant": pollutant,
                "value": round(value, 4),
                "unit": unit,
                "qualityFlag": _pick(
                    row, "quality_flag", "qualityFlag", default="valid"
                ),
                "source": _pick(row, "source", "Source", default=path.name),
            }
        )

    return deduplicate_records(records)


def load_meteo_csv(path: Path) -> list[dict[str, Any]]:
    rows = _read_csv_rows(path)
    records: list[dict[str, Any]] = []

    for row in rows:
        station_name = _pick(row, "station_id", "stationId", "station_name", "Station")
        raw_timestamp = _pick(row, "timestamp", "Timestamp", "read_time", "ReadTime")

        if not station_name or not raw_timestamp:
            continue

        records.append(
            {
                "stationIdOrGridId": slugify_station_id(station_name),
                "timestamp": parse_timestamp(raw_timestamp).strftime(
                    "%Y-%m-%dT%H:%M:%SZ"
                ),
                "temperatureC": float(
                    _pick(
                        row,
                        "temperature_c",
                        "temperature",
                        "Temperature",
                        default="0",
                    ).replace(",", ".")
                ),
                "humidityPct": float(
                    _pick(row, "humidity_pct", "humidity", "Humidity", default="0").replace(
                        ",", "."
                    )
                ),
                "windSpeedMs": float(
                    _pick(
                        row, "wind_speed_ms", "wind_speed", "WindSpeed", default="0"
                    ).replace(",", ".")
                ),
                "windDirDeg": float(
                    _pick(
                        row,
                        "wind_dir_deg",
                        "wind_direction",
                        "WindDirection",
                        default="0",
                    ).replace(",", ".")
                ),
                "precipitationMm": float(
                    _pick(
                        row,
                        "precipitation_mm",
                        "precipitation",
                        "Precipitation",
                        default="0",
                    ).replace(",", ".")
                ),
                "source": _pick(row, "source", "Source", default=path.name),
            }
        )

    return records


def load_context_csv(path: Path) -> list[dict[str, Any]]:
    rows = _read_csv_rows(path)
    metrics: list[dict[str, Any]] = []

    for row in rows:
        station_name = _pick(row, "station_id", "stationId", "station_name")

        if not station_name:
            continue

        metrics.append(
            {
                "stationId": slugify_station_id(station_name),
                "radiusM": int(float(_pick(row, "radius_m", "radiusM", default="500"))),
                "buildingDensity": float(
                    _pick(row, "building_density", "buildingDensity", default="0").replace(
                        ",", "."
                    )
                ),
                "roadDensity": float(
                    _pick(row, "road_density", "roadDensity", default="0").replace(
                        ",", "."
                    )
                ),
                "greenRatio": float(
                    _pick(row, "green_ratio", "greenRatio", default="0").replace(
                        ",", "."
                    )
                ),
                "imperviousRatio": float(
                    _pick(
                        row, "impervious_ratio", "imperviousRatio", default="0"
                    ).replace(",", ".")
                ),
                "industryCount": int(
                    float(_pick(row, "industry_count", "industryCount", default="0"))
                ),
                "meanElevation": float(
                    _pick(row, "mean_elevation", "meanElevation", default="0").replace(
                        ",", "."
                    )
                ),
                "slopeMean": float(
                    _pick(row, "slope_mean", "slopeMean", default="0").replace(
                        ",", "."
                    )
                ),
            }
        )

    return metrics


def load_events_csv(path: Path) -> list[dict[str, Any]]:
    rows = _read_csv_rows(path)
    events: list[dict[str, Any]] = []

    for row in rows:
        event_id = _pick(row, "event_id", "eventId", default=f"event-{len(events) + 1}")
        start = parse_timestamp(_pick(row, "start_date", "startDate")).strftime(
            "%Y-%m-%dT%H:%M:%SZ"
        )
        end = parse_timestamp(_pick(row, "end_date", "endDate")).strftime(
            "%Y-%m-%dT%H:%M:%SZ"
        )
        events.append(
            {
                "eventId": event_id,
                "eventType": _pick(row, "event_type", "eventType", default="fire"),
                "name": _pick(row, "name", "Name", default=event_id),
                "startDate": start,
                "endDate": end,
                "center": {
                    "lat": float(
                        _pick(row, "lat", "center_lat", "centerLat", default="0").replace(
                            ",", "."
                        )
                    ),
                    "lng": float(
                        _pick(row, "lng", "center_lng", "centerLng", default="0").replace(
                            ",", "."
                        )
                    ),
                },
                "radiusKm": float(
                    _pick(row, "radius_km", "radiusKm", default="10").replace(",", ".")
                ),
                "source": _pick(row, "source", "Source", default=path.name),
                "confidence": float(
                    _pick(row, "confidence", "Confidence", default="0.75").replace(
                        ",", "."
                    )
                ),
                "hotspotCount": int(
                    float(_pick(row, "hotspot_count", "hotspotCount", default="0"))
                ),
                "note": _pick(row, "note", "Note", default=""),
            }
        )

    return events


def _load_optional_json(path: Path | None) -> list[dict[str, Any]]:
    if path is None or not path.exists():
        return []

    with path.open("r", encoding="utf-8") as handle:
        data = json.load(handle)

    if not isinstance(data, list):
        raise ValueError(f"Expected a list in {path}")

    return data


def build_dataset_from_local_files(
    *,
    air_quality_csv: Path,
    meteo_csv: Path | None,
    context_csv: Path | None,
    events_csv: Path | None,
    stations_json: Path | None,
    roads_json: Path | None,
    industries_json: Path | None,
    green_areas_json: Path | None,
    elevation_json: Path | None,
) -> dict[str, Any]:
    station_series = load_air_quality_csv(air_quality_csv)
    meteo_series = load_meteo_csv(meteo_csv) if meteo_csv else []
    context_metrics = load_context_csv(context_csv) if context_csv else []
    events = load_events_csv(events_csv) if events_csv else []
    stations = _load_optional_json(stations_json)

    if not stations:
        unique_station_ids = sorted({record["stationId"] for record in station_series})
        stations = [
            {
                "id": station_id,
                "name": station_id.replace("-", " ").title(),
                "district": "Bursa",
                "stationType": "unspecified",
                "lat": 40.19,
                "lng": 29.06,
                "elevationM": 100,
                "pollutants": sorted(
                    {
                        record["pollutant"]
                        for record in station_series
                        if record["stationId"] == station_id
                    }
                ),
            }
            for station_id in unique_station_ids
        ]

    timestamps = [record["timestamp"] for record in station_series]
    coverage_start = min(timestamps) if timestamps else ""
    coverage_end = max(timestamps) if timestamps else ""

    return {
        "metadata": {
            "version": "local-import-v1",
            "generatedAt": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "coverageStart": coverage_start[:10],
            "coverageEnd": coverage_end[:10],
            "description": "Normalized Bursa air-quality package built from local raw files.",
            "methods": [
                "CSV normalization",
                "Unit conversion",
                "Record deduplication",
                "Static dataset packaging",
            ],
            "sourceNotes": [
                str(air_quality_csv),
                *(str(path) for path in [meteo_csv, context_csv, events_csv] if path),
            ],
            "dataIssues": [],
            "completenessOverview": [],
            "stationCoverage": [],
        },
        "stations": stations,
        "stationTimeSeries": station_series,
        "meteoTimeSeries": meteo_series,
        "contextMetrics": context_metrics,
        "events": events,
        "roads": _load_optional_json(roads_json),
        "industries": _load_optional_json(industries_json),
        "greenAreas": _load_optional_json(green_areas_json),
        "elevationGrid": _load_optional_json(elevation_json),
    }
