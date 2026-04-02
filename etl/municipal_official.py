from __future__ import annotations

import json
from collections import defaultdict
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import Any
from xml.etree import ElementTree as ET
from zipfile import ZipFile


CANONICAL_WORKBOOK_NAME = "bursa_buyuksehir_resmi_belediye_hava_kalitesi.xlsx"
WORKBOOK_GLOB = "*municipal_official*.xlsx"
STATION_METADATA_NAME = "station_locations.json"
EXCEL_EPOCH = datetime(1899, 12, 30)
NAMESPACES = {
    "main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
}
SOURCE_LABEL = "Resmi Belediye Kaynağı"
OPERATOR_LABEL = "Bursa Büyükşehir Belediyesi"
POLLUTANT_COLUMNS = {
    "pm10calibrated": "PM10",
    "pm25calibrated": "PM2.5",
    "no2ugm3calibratedfiltered": "NO2",
    "o3ugm3calibratedfiltered": "O3",
    "so2ugm3calibratedfiltered": "SO2",
}
POLLUTANT_ORDER = ["PM10", "PM2.5", "NO2", "SO2", "O3"]


def _resolve_workbook_path(raw_dir: Path) -> Path | None:
    canonical = raw_dir / CANONICAL_WORKBOOK_NAME
    if canonical.exists():
        return canonical

    workbook_candidates = sorted(raw_dir.glob(WORKBOOK_GLOB))
    if workbook_candidates:
        return workbook_candidates[-1]

    return None


def municipal_official_workbook_metadata(raw_dir: Path) -> dict[str, str] | None:
    workbook_path = _resolve_workbook_path(raw_dir)
    metadata_path = raw_dir / STATION_METADATA_NAME

    if workbook_path is None or not metadata_path.exists():
        return None

    return {
        "workbook": str(workbook_path.relative_to(raw_dir.parents[2])),
        "metadata": str(metadata_path.relative_to(raw_dir.parents[2])),
        "modifiedAt": datetime.fromtimestamp(
            workbook_path.stat().st_mtime,
            tz=UTC,
        ).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }


def _load_station_metadata(raw_dir: Path) -> dict[str, dict[str, Any]]:
    path = raw_dir / STATION_METADATA_NAME

    with path.open("r", encoding="utf-8") as handle:
        data = json.load(handle)

    return {
        str(item["sheetName"]): item
        for item in data
        if isinstance(item, dict) and item.get("sheetName")
    }


def _load_shared_strings(archive: ZipFile) -> list[str]:
    if "xl/sharedStrings.xml" not in archive.namelist():
        return []

    root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
    strings: list[str] = []

    for item in root.findall("main:si", NAMESPACES):
        strings.append(
            "".join(text.text or "" for text in item.iterfind(".//main:t", NAMESPACES))
        )

    return strings


def _cell_value(
    cell: ET.Element,
    shared_strings: list[str],
) -> tuple[str, str]:
    reference = cell.attrib.get("r", "")
    column = "".join(character for character in reference if character.isalpha())
    value_node = cell.find("main:v", NAMESPACES)
    value = value_node.text if value_node is not None else ""

    if cell.attrib.get("t") == "s" and value.isdigit():
        return column, shared_strings[int(value)]

    return column, value


def _iter_sheet_measurement_rows(
    archive: ZipFile,
    target: str,
    shared_strings: list[str],
):
    worksheet = ET.fromstring(archive.read(target))
    header_by_column: dict[str, str] = {}

    for row in worksheet.findall("main:sheetData/main:row", NAMESPACES):
        cells = dict(
            _cell_value(cell, shared_strings)
            for cell in row.findall("main:c", NAMESPACES)
        )

        if cells.get("A") == "device_id" and cells.get("B") == "calculateddatetime":
            header_by_column = {
                column: value.strip().lower()
                for column, value in cells.items()
                if value
            }
            continue

        if not header_by_column or not cells.get("A") or cells.get("A") == "device_id":
            continue

        yield {
            header_by_column[column]: value
            for column, value in cells.items()
            if column in header_by_column and value not in ("", None)
        }


def _excel_serial_to_utc(value: str) -> datetime:
    return EXCEL_EPOCH + timedelta(days=float(value))


def _coerce_float(value: str) -> float | None:
    normalized = str(value).strip().replace(",", ".")

    if normalized == "":
        return None

    try:
        return float(normalized)
    except ValueError:
        return None


def load_municipal_official_network(
    raw_dir: Path,
    start_date: date,
    end_date: date,
) -> tuple[
    list[dict[str, Any]],
    list[dict[str, Any]],
    list[dict[str, str]],
    list[str],
]:
    workbook_info = municipal_official_workbook_metadata(raw_dir)

    if workbook_info is None:
        return [], [], [], []

    workbook_path = _resolve_workbook_path(raw_dir)
    if workbook_path is None:
        return [], [], [], []

    station_metadata = _load_station_metadata(raw_dir)
    source_start = max(start_date, end_date - timedelta(days=365))

    stations: list[dict[str, Any]] = []
    records: list[dict[str, Any]] = []
    issues: list[dict[str, str]] = []
    station_pollutants: dict[str, set[str]] = defaultdict(set)
    station_device_ids: dict[str, set[str]] = defaultdict(set)
    coverage_days: list[str] = []

    with ZipFile(workbook_path) as archive:
        workbook = ET.fromstring(archive.read("xl/workbook.xml"))
        rels = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        rel_map = {rel.attrib["Id"]: rel.attrib["Target"] for rel in rels}
        shared_strings = _load_shared_strings(archive)

        for sheet in workbook.findall("main:sheets/main:sheet", NAMESPACES):
            sheet_name = sheet.attrib["name"]
            metadata = station_metadata.get(sheet_name)

            if not metadata:
                issues.append(
                    {
                        "id": f"municipal-official-location-missing-{sheet_name}",
                        "severity": "warning",
                        "source": SOURCE_LABEL,
                        "message": f"{sheet_name} için istasyon konum eşleşmesi bulunamadığı için sayfa atlandı.",
                    }
                )
                continue

            relationship_id = sheet.attrib[
                "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"
            ]
            target = f"xl/{rel_map[relationship_id]}"
            hourly_values: dict[tuple[str, str], list[float]] = defaultdict(list)

            for row in _iter_sheet_measurement_rows(archive, target, shared_strings):
                timestamp_raw = row.get("calculateddatetime")
                device_id = str(row.get("device_id") or "").strip()

                if device_id:
                    station_device_ids[metadata["id"]].add(device_id)

                if not timestamp_raw:
                    continue

                timestamp = _excel_serial_to_utc(timestamp_raw)
                current_day = timestamp.date()

                if current_day < source_start or current_day > end_date:
                    continue

                timestamp_key = timestamp.strftime("%Y-%m-%dT%H:%M:%SZ")

                for column, pollutant in POLLUTANT_COLUMNS.items():
                    value = _coerce_float(str(row.get(column, "")))

                    if value is None or value < 0:
                        continue

                    hourly_values[(timestamp_key, pollutant)].append(value)

            if not hourly_values:
                issues.append(
                    {
                        "id": f"municipal-official-empty-{metadata['id']}",
                        "severity": "warning",
                        "source": SOURCE_LABEL,
                        "message": f"{metadata['name']} sayfasında son 1 yıl penceresinde kullanılabilir kayıt bulunamadı.",
                    }
                )
                continue

            daily_values: dict[tuple[str, str], list[float]] = defaultdict(list)
            for (timestamp_key, pollutant), values in hourly_values.items():
                hourly_mean = sum(values) / len(values)
                daily_values[(timestamp_key[:10], pollutant)].append(hourly_mean)

            stations.append(
                {
                    "id": metadata["id"],
                    "sourceId": ",".join(sorted(station_device_ids.get(metadata["id"]) or []))
                    or metadata["id"],
                    "name": metadata["name"],
                    "district": metadata["district"],
                    "stationType": metadata.get("stationType", "municipal-reference"),
                    "lat": float(metadata["lat"]),
                    "lng": float(metadata["lng"]),
                    "elevationM": float(metadata.get("elevationM", 0)),
                    "pollutants": [],
                    "dataSource": "municipal-official",
                    "operator": metadata.get("operator", OPERATOR_LABEL),
                    "locationApproximate": True,
                    "locationConfidence": metadata.get("locationConfidence", "medium"),
                    "locationBasis": metadata.get("locationNote", ""),
                    "locationSourceUrl": metadata.get("locationSourceUrl", ""),
                }
            )

            for (day, pollutant), values in sorted(daily_values.items()):
                records.append(
                    {
                        "stationId": metadata["id"],
                        "timestamp": f"{day}T00:00:00Z",
                        "pollutant": pollutant,
                        "value": round(sum(values) / len(values), 4),
                        "unit": "ug/m3",
                        "qualityFlag": "screened",
                        "source": SOURCE_LABEL,
                    }
                )
                station_pollutants[metadata["id"]].add(pollutant)
                coverage_days.append(day)

    for station in stations:
        station["pollutants"] = sorted(
            station_pollutants.get(station["id"], set()),
            key=POLLUTANT_ORDER.index,
        )

    stations = [station for station in stations if station["pollutants"]]
    valid_station_ids = {station["id"] for station in stations}
    records = [record for record in records if record["stationId"] in valid_station_ids]

    if stations and coverage_days:
        issues.extend(
            [
                {
                    "id": "municipal-official-network-added",
                    "severity": "info",
                    "source": SOURCE_LABEL,
                    "message": (
                        f"Resmi belediye kaynağından {len(stations)} istasyon için "
                        f"{min(coverage_days)} ile {max(coverage_days)} arasında günlük seri üretildi."
                    ),
                },
                {
                    "id": "municipal-official-locations-approximate",
                    "severity": "info",
                    "source": SOURCE_LABEL,
                    "message": (
                        "Excel dosyasında koordinat paylaşılmadığı için istasyonlar yer adı ve "
                        "mahalle/merkez eşlemesiyle yaklaşık konumlara yerleştirildi."
                    ),
                },
            ]
        )

    source_notes = [
        "https://www.bursa.bel.tr/hava-kalitesi",
        f"Yerel resmi belediye ölçüm dosyası: {workbook_info['workbook']}",
        f"İstasyon konum eşlemesi: {workbook_info['metadata']}",
    ]
    return stations, records, issues, source_notes
