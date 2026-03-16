from __future__ import annotations

import csv
import json
import math
import os
import re
from collections import defaultdict
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import Any

import requests

from .pipeline import slugify_station_id


requests.packages.urllib3.disable_warnings()

EARTH_RADIUS_M = 6_371_000
OFFICIAL_BASE_URL = "https://sim.csb.gov.tr"
OFFICIAL_PAGE_URL = f"{OFFICIAL_BASE_URL}/STN/STN_Report/StationDataDownloadNew"
OFFICIAL_DEFAULTS_URL = (
    f"{OFFICIAL_BASE_URL}/STN/STN_Report/StationDataDownloadNewDefaults"
)
OFFICIAL_DATA_URL = f"{OFFICIAL_BASE_URL}/STN/STN_Report/StationDataDownloadNewData"
OVERPASS_ENDPOINTS = (
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
)
OPEN_METEO_ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
OPEN_METEO_AIR_QUALITY_URL = "https://air-quality-api.open-meteo.com/v1/air-quality"
OPEN_METEO_ELEVATION_URL = "https://api.open-meteo.com/v1/elevation"
AIRQOON_API_URL = "https://map.airqoon.com/bursa/api"
AIRQOON_V2_DEVICES_URL = f"{AIRQOON_API_URL}/v2/devices"
EONET_EVENTS_URL = "https://eonet.gsfc.nasa.gov/api/v3/events"
FIRMS_AREA_URL = "https://firms.modaps.eosdis.nasa.gov/api/area/csv"

BURSA_CITY_ID = "ceb44da3-7237-4daa-b69c-f1afc2f26a4f"
POLLUTANT_CODES = ("PM10", "PM25", "NO2", "SO2", "O3")
POLLUTANT_LABELS = {
    "PM10": "PM10",
    "PM25": "PM2.5",
    "NO2": "NO2",
    "SO2": "SO2",
    "O3": "O3",
}
ROAD_WIDTHS_M = {
    "motorway": 18.0,
    "trunk": 14.0,
    "primary": 12.0,
    "secondary": 10.0,
    "tertiary": 8.0,
    "residential": 6.0,
    "service": 5.0,
}

CURATED_BURSA_EVENTS: tuple[dict[str, Any], ...] = (
    {
        "eventId": "inegol-osb-fabrika-yangini-2023-08-01",
        "eventType": "industrial-fire",
        "analysisMode": "spatial",
        "name": "İnegöl OSB fabrika yangını",
        "startDate": "2023-08-01T15:30:00Z",
        "endDate": "2023-08-02T23:59:59Z",
        "center": {"lat": 40.0876, "lng": 29.514},
        "radiusKm": 8.0,
        "source": "Anadolu Ajansı",
        "confidence": 0.86,
        "hotspotCount": 1,
        "note": "İnegöl Organize Sanayi Bölgesi'nde başlayıp bitişik tesislere yayılan fabrika yangını.",
        "referenceUrl": "https://www.aa.com.tr/tr/gundem/bursadaki-fabrika-yangininda-10-fabrika-hasar-gordu/2959911",
    },
    {
        "eventId": "kuzey-afrika-toz-tasinimi-2024-04-24",
        "eventType": "dust-transport",
        "analysisMode": "temporal",
        "name": "Kuzey Afrika toz taşınımı",
        "startDate": "2024-04-24T00:00:00Z",
        "endDate": "2024-04-26T23:59:59Z",
        "center": {"lat": 40.195, "lng": 29.06},
        "radiusKm": 55.0,
        "source": "Anadolu Ajansı",
        "confidence": 0.74,
        "hotspotCount": 0,
        "note": "MGM uyarısına göre Marmara dahil geniş bölgede görüş mesafesi ve partikül yükünü etkileyen toz taşınımı.",
        "referenceUrl": "https://www.aa.com.tr/tr/yasam/meteorolojiden-kuzey-afrika-kaynakli-toz-tasinimi-uyarisi/3200922",
    },
    {
        "eventId": "lodos-ve-toz-savrulmasi-2024-06-14",
        "eventType": "wind-event",
        "analysisMode": "temporal",
        "name": "Lodos ve toz savrulması",
        "startDate": "2024-06-14T12:00:00Z",
        "endDate": "2024-06-14T22:00:00Z",
        "center": {"lat": 40.195, "lng": 29.06},
        "radiusKm": 50.0,
        "source": "Bursa Valiliği",
        "confidence": 0.78,
        "hotspotCount": 0,
        "note": "Bursa Valiliği'nin il geneli için yayımladığı kuvvetli rüzgâr, lodos ve toz savrulması uyarısı.",
        "referenceUrl": "https://www.bursa.gov.tr/meteorolojik-uyari-2024-25",
    },
    {
        "eventId": "nilufer-yolcati-orman-yangini-2024-06-30",
        "eventType": "fire",
        "analysisMode": "spatial",
        "name": "Nilüfer Yolçatı orman yangını",
        "startDate": "2024-06-30T14:26:00Z",
        "endDate": "2024-07-01T12:00:00Z",
        "center": {"lat": 40.214, "lng": 28.878},
        "radiusKm": 10.0,
        "source": "Bursa Büyükşehir Belediyesi İtfaiye",
        "confidence": 0.82,
        "hotspotCount": 1,
        "note": "30 Haziran 2024'te Nilüfer Yolçatı bölgesinde başlayan ve ekiplerin müdahale ettiği orman yangını.",
        "referenceUrl": "https://itfaiye.bursa.bel.tr/1440/Niluferde_orman_yangini.html",
    },
    {
        "eventId": "yenisehir-kavakli-yangini-2025-08-01",
        "eventType": "fire",
        "analysisMode": "spatial",
        "name": "Yenişehir Kavaklı yangını",
        "startDate": "2025-08-01T13:55:00Z",
        "endDate": "2025-08-02T12:00:00Z",
        "center": {"lat": 40.271, "lng": 29.6},
        "radiusKm": 12.0,
        "source": "Bursa Valiliği",
        "confidence": 0.8,
        "hotspotCount": 1,
        "note": "Yenişehir Kavaklı Mahallesi civarında başlayıp ormanlık alana sıçrayan yangın.",
        "referenceUrl": "https://www.bursa.gov.tr/yenisehir-kavakli-mahallesi-civarinda-cikan-yangin-kontrol-altina-alindi",
    },
    {
        "eventId": "gursu-kestel-orman-yangini-2025-07-26",
        "eventType": "fire",
        "analysisMode": "spatial",
        "name": "Gürsu-Kestel orman yangını",
        "startDate": "2025-07-26T12:00:00Z",
        "endDate": "2025-07-27T23:59:59Z",
        "center": {"lat": 40.222, "lng": 29.208},
        "radiusKm": 14.0,
        "source": "Anadolu Ajansı",
        "confidence": 0.88,
        "hotspotCount": 1,
        "note": "Gürsu ve Kestel ilçeleri arasındaki ormanlık alanda başlayan geniş çaplı yangın.",
        "referenceUrl": "https://www.aa.com.tr/tr/gundem/bursadaki-orman-yangininda-zarar-goren-kirsal-mahallelerde-hasarin-boyutu-gunun-agarmasiyla-ortaya-cikti/3643216",
    },
)


def safe_year_delta(reference: date, years: int) -> date:
    try:
        return reference.replace(year=reference.year - years)
    except ValueError:
        return reference.replace(year=reference.year - years, month=2, day=28)


def parse_iso_utc(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def curated_bursa_events(
    start_date: date,
    end_date: date,
) -> list[dict[str, Any]]:
    filtered: list[dict[str, Any]] = []

    for event in CURATED_BURSA_EVENTS:
        event_start = date.fromisoformat(event["startDate"][:10])
        event_end = date.fromisoformat(event["endDate"][:10])

        if event_end < start_date or event_start > end_date:
            continue

        filtered.append(
            {
                **event,
                "center": {
                    "lat": event["center"]["lat"],
                    "lng": event["center"]["lng"],
                },
            }
        )

    return filtered


def merge_event_catalogs(
    curated_events: list[dict[str, Any]],
    fetched_events: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    merged = list(curated_events)

    for fetched in fetched_events:
        duplicate = False

        for existing in curated_events:
            if (
                "fire" in existing["eventType"]
                and "fire" in fetched["eventType"]
                and abs(
                    (
                        parse_iso_utc(existing["startDate"])
                        - parse_iso_utc(fetched["startDate"])
                    ).days
                )
                <= 5
                and haversine_distance_m(
                    existing["center"]["lat"],
                    existing["center"]["lng"],
                    fetched["center"]["lat"],
                    fetched["center"]["lng"],
                )
                <= 35_000
            ):
                duplicate = True
                break

        if not duplicate:
            merged.append(fetched)

    merged.sort(key=lambda item: item["startDate"], reverse=True)
    return merged


def month_windows(start_date: date, end_date: date) -> list[tuple[date, date]]:
    windows: list[tuple[date, date]] = []
    cursor = date(start_date.year, start_date.month, 1)

    while cursor <= end_date:
        if cursor.month == 12:
            next_month = date(cursor.year + 1, 1, 1)
        else:
            next_month = date(cursor.year, cursor.month + 1, 1)

        window_start = max(start_date, cursor)
        window_end = min(end_date, next_month - timedelta(days=1))
        windows.append((window_start, window_end))
        cursor = next_month

    return windows


def format_official_datetime(value: date, hour: int) -> str:
    return value.strftime(f"%d.%m.%Y {hour:02d}:00")


def normalize_pollutant(value: str) -> str:
    return POLLUTANT_LABELS.get(value, value)


def canonical_unit(pollutant: str) -> str:
    if pollutant == "CO":
        return "mg/m3"
    return "ug/m3"


def timestamp_to_utc(value: str) -> str:
    if value.endswith("Z"):
        return value
    return f"{value}Z"


def parse_wkt_point(value: str) -> tuple[float, float]:
    match = re.search(r"POINT\s*\(([-0-9.]+)\s+([-0-9.]+)\)", value)

    if not match:
        raise ValueError(f"Unsupported WKT point: {value}")

    lng = float(match.group(1))
    lat = float(match.group(2))
    return lat, lng


def title_to_district(value: str) -> str:
    cleaned = value.replace("Bursa - ", "").replace("Bursa-", "").strip()
    cleaned = cleaned.replace("-MTHM", "").strip()
    if "(" in cleaned:
        return cleaned.split("(", 1)[0].strip()
    if cleaned == "Bursa":
        return "Nilüfer"
    return cleaned or "Bursa"


def source_area_to_station_type(source_type: int | None, area_type: int | None) -> str:
    if source_type == 1001:
        return "traffic"
    if source_type == 1002:
        return "industrial"
    if source_type == 1003:
        if area_type == 2000:
            return "rural-background"
        if area_type == 2002:
            return "suburban-background"
        return "urban-background"
    if area_type == 2002:
        return "suburban"
    if area_type == 2000:
        return "rural"
    return "urban"


def station_reference_lookup(
    station_rows: list[dict[str, Any]],
) -> tuple[dict[str, str], dict[str, dict[str, Any]]]:
    source_to_slug: dict[str, str] = {}
    slug_to_station: dict[str, dict[str, Any]] = {}

    for row in station_rows:
        slug = slugify_station_id(str(row["Station_Title"]))
        counter = 2
        original_slug = slug

        while slug in slug_to_station:
            slug = f"{original_slug}-{counter}"
            counter += 1

        lat, lng = parse_wkt_point(row["Location"])
        source_to_slug[row["id"]] = slug
        slug_to_station[slug] = {
            "id": slug,
            "sourceId": row["id"],
            "name": row["Station_Title"],
            "district": title_to_district(row["Station_Title"]),
            "stationType": source_area_to_station_type(
                row.get("SourceType"),
                row.get("AreaType"),
            ),
            "lat": lat,
            "lng": lng,
            "elevationM": 0,
            "pollutants": [],
            "dataSource": "official",
            "operator": "Ulusal Hava Kalitesi İzleme Ağı",
        }

    return source_to_slug, slug_to_station


def bbox_from_stations(stations: list[dict[str, Any]], padding_deg: float = 0.12) -> dict[str, float]:
    lats = [station["lat"] for station in stations]
    lngs = [station["lng"] for station in stations]
    return {
        "south": min(lats) - padding_deg,
        "west": min(lngs) - padding_deg,
        "north": max(lats) + padding_deg,
        "east": max(lngs) + padding_deg,
    }


def bbox_string(bbox: dict[str, float]) -> str:
    return f"{bbox['south']},{bbox['west']},{bbox['north']},{bbox['east']}"


def point_in_bbox(lat: float, lng: float, bbox: dict[str, float]) -> bool:
    return (
        bbox["south"] <= lat <= bbox["north"]
        and bbox["west"] <= lng <= bbox["east"]
    )


def haversine_distance_m(
    lat_a: float,
    lng_a: float,
    lat_b: float,
    lng_b: float,
) -> float:
    lat_a_rad = math.radians(lat_a)
    lat_b_rad = math.radians(lat_b)
    delta_lat = lat_b_rad - lat_a_rad
    delta_lng = math.radians(lng_b - lng_a)
    formula = (
        math.sin(delta_lat / 2) ** 2
        + math.cos(lat_a_rad)
        * math.cos(lat_b_rad)
        * math.sin(delta_lng / 2) ** 2
    )
    return 2 * EARTH_RADIUS_M * math.asin(math.sqrt(formula))


def offset_lat_lng(lat: float, lng: float, distance_m: float, bearing_deg: float) -> tuple[float, float]:
    bearing_rad = math.radians(bearing_deg)
    lat_rad = math.radians(lat)
    lng_rad = math.radians(lng)
    angular_distance = distance_m / EARTH_RADIUS_M

    target_lat = math.asin(
        math.sin(lat_rad) * math.cos(angular_distance)
        + math.cos(lat_rad) * math.sin(angular_distance) * math.cos(bearing_rad)
    )
    target_lng = lng_rad + math.atan2(
        math.sin(bearing_rad) * math.sin(angular_distance) * math.cos(lat_rad),
        math.cos(angular_distance) - math.sin(lat_rad) * math.sin(target_lat),
    )
    return math.degrees(target_lat), math.degrees(target_lng)


def project_to_meters(lat: float, lng: float, ref_lat: float) -> tuple[float, float]:
    ref_lat_rad = math.radians(ref_lat)
    x = math.radians(lng) * EARTH_RADIUS_M * math.cos(ref_lat_rad)
    y = math.radians(lat) * EARTH_RADIUS_M
    return x, y


def polygon_area_m2(coords: list[tuple[float, float]]) -> float:
    if len(coords) < 3:
        return 0.0

    ref_lat = sum(lat for lat, _ in coords) / len(coords)
    projected = [project_to_meters(lat, lng, ref_lat) for lat, lng in coords]
    area = 0.0

    for index, (x_a, y_a) in enumerate(projected):
        x_b, y_b = projected[(index + 1) % len(projected)]
        area += x_a * y_b - x_b * y_a

    return abs(area) / 2


def line_length_m(coords: list[tuple[float, float]]) -> float:
    total = 0.0
    for index in range(len(coords) - 1):
        lat_a, lng_a = coords[index]
        lat_b, lng_b = coords[index + 1]
        total += haversine_distance_m(lat_a, lng_a, lat_b, lng_b)
    return total


def centroid(coords: list[tuple[float, float]]) -> tuple[float, float]:
    lat = sum(point[0] for point in coords) / len(coords)
    lng = sum(point[1] for point in coords) / len(coords)
    return lat, lng


class CacheSession:
    def __init__(self, raw_dir: Path, force_refresh: bool = False) -> None:
        self.raw_dir = raw_dir
        self.raw_dir.mkdir(parents=True, exist_ok=True)
        self.force_refresh = force_refresh
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": "codex-bursa-air-quality/1.0"})

    def get_json(
        self,
        url: str,
        *,
        params: dict[str, Any] | None = None,
        cache_name: str,
        verify: bool = True,
        timeout: int = 180,
    ) -> Any:
        cache_path = self.raw_dir / cache_name

        if cache_path.exists() and not self.force_refresh:
            with cache_path.open("r", encoding="utf-8") as handle:
                return json.load(handle)

        response = self.session.get(url, params=params, timeout=timeout, verify=verify)
        response.raise_for_status()
        data = response.json()

        with cache_path.open("w", encoding="utf-8") as handle:
            json.dump(data, handle, ensure_ascii=False, indent=2)

        return data

    def get_text(
        self,
        url: str,
        *,
        params: dict[str, Any] | None = None,
        cache_name: str,
        verify: bool = True,
        timeout: int = 180,
    ) -> str:
        cache_path = self.raw_dir / cache_name

        if cache_path.exists() and not self.force_refresh:
            return cache_path.read_text(encoding="utf-8")

        response = self.session.get(url, params=params, timeout=timeout, verify=verify)
        response.raise_for_status()
        text = response.text
        cache_path.write_text(text, encoding="utf-8")
        return text


class OfficialAirQualityClient:
    def __init__(self, raw_dir: Path, force_refresh: bool = False) -> None:
        self.cache = CacheSession(raw_dir, force_refresh=force_refresh)
        self.force_refresh = force_refresh
        self._token: str | None = None

    def fetch_defaults(self) -> dict[str, Any]:
        cache_path = self.cache.raw_dir / "station_defaults.json"
        if cache_path.exists() and not self.force_refresh:
            with cache_path.open("r", encoding="utf-8") as handle:
                return json.load(handle)

        response = self.cache.session.post(
            OFFICIAL_DEFAULTS_URL,
            headers={"Content-Type": "application/json; charset=UTF-8"},
            data="{}",
            timeout=180,
            verify=False,
        )
        response.raise_for_status()
        data = response.json()

        with cache_path.open("w", encoding="utf-8") as handle:
            json.dump(data, handle, ensure_ascii=False, indent=2)

        return data

    def _token_value(self) -> str:
        if self._token:
            return self._token

        html = self.cache.get_text(
            OFFICIAL_PAGE_URL,
            cache_name="station_download_page.html",
            verify=False,
        )
        match = re.search(
            r'name="__RequestVerificationToken" type="hidden" value="([^"]+)"',
            html,
        )

        if not match:
            raise RuntimeError("Official station download page token could not be parsed.")

        self._token = match.group(1)
        return self._token

    def fetch_data(
        self,
        *,
        station_ids: list[str],
        parameters: list[str],
        start_date: date,
        end_date: date,
        data_period: str = "16",
    ) -> dict[str, Any]:
        cache_name = f"aq_{data_period}_{start_date.isoformat()}_{end_date.isoformat()}.json"
        cache_path = self.cache.raw_dir / cache_name

        if cache_path.exists() and not self.force_refresh:
            with cache_path.open("r", encoding="utf-8") as handle:
                return json.load(handle)

        payload: list[tuple[str, str]] = [
            ("__RequestVerificationToken", self._token_value()),
            ("StationType", "1"),
            ("GroupKey", "00000000-0000-0000-0000-000000000000"),
            ("StartDateTime", format_official_datetime(start_date, 0)),
            ("EndDateTime", format_official_datetime(end_date, 23)),
            ("DataPeriods", data_period),
            ("DataBank", "true"),
        ]

        for station_id in station_ids:
            payload.append(("StationIds", station_id))

        for parameter in parameters:
            payload.append(("Parameters", parameter))

        response = self.cache.session.post(
            OFFICIAL_DATA_URL,
            data=payload,
            timeout=180,
            verify=False,
        )
        response.raise_for_status()
        data = response.json()

        with cache_path.open("w", encoding="utf-8") as handle:
            json.dump(data, handle, ensure_ascii=False, indent=2)

        return data


def fetch_bursa_bbox(
    raw_dir: Path,
    stations: list[dict[str, Any]],
    force_refresh: bool = False,
) -> dict[str, float]:
    cache_path = raw_dir / "bursa_bbox.json"

    if cache_path.exists() and not force_refresh:
        with cache_path.open("r", encoding="utf-8") as handle:
            return json.load(handle)

    query = (
        '[out:json][timeout:60];'
        'relation["boundary"="administrative"]["admin_level"="4"]["name"="Bursa"];'
        "out ids bb;"
    )

    for endpoint in OVERPASS_ENDPOINTS:
        try:
            response = requests.post(
                endpoint,
                data={"data": query},
                headers={"User-Agent": "codex-bursa-air-quality/1.0"},
                timeout=180,
            )
            response.raise_for_status()
            payload = response.json()
            relation = (payload.get("elements") or [None])[0]
            if relation and "bounds" in relation:
                bounds = relation["bounds"]
                bbox = {
                    "south": float(bounds["minlat"]),
                    "west": float(bounds["minlon"]),
                    "north": float(bounds["maxlat"]),
                    "east": float(bounds["maxlon"]),
                }
                with cache_path.open("w", encoding="utf-8") as handle:
                    json.dump(bbox, handle, ensure_ascii=False, indent=2)
                return bbox
        except (requests.RequestException, ValueError):
            continue

    bbox = bbox_from_stations(stations, padding_deg=0.12)
    with cache_path.open("w", encoding="utf-8") as handle:
        json.dump(bbox, handle, ensure_ascii=False, indent=2)
    return bbox


def overpass_json(
    raw_dir: Path,
    cache_name: str,
    query: str,
    force_refresh: bool = False,
) -> dict[str, Any]:
    cache_path = raw_dir / cache_name

    if cache_path.exists() and not force_refresh:
        with cache_path.open("r", encoding="utf-8") as handle:
            return json.load(handle)

    last_error: Exception | None = None

    for endpoint in OVERPASS_ENDPOINTS:
        try:
            response = requests.post(
                endpoint,
                data={"data": query},
                headers={"User-Agent": "codex-bursa-air-quality/1.0"},
                timeout=180,
            )
            response.raise_for_status()
            data = response.json()
            with cache_path.open("w", encoding="utf-8") as handle:
                json.dump(data, handle, ensure_ascii=False, indent=2)
            return data
        except (requests.RequestException, ValueError) as exc:
            last_error = exc

    raise RuntimeError(f"Overpass request failed for {cache_name}") from last_error


def way_coordinates(element: dict[str, Any]) -> list[tuple[float, float]]:
    geometry = element.get("geometry") or []
    return [(float(point["lat"]), float(point["lon"])) for point in geometry]


def fetch_layers(
    raw_dir: Path,
    bbox: dict[str, float],
    force_refresh: bool = False,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    bbox_clause = bbox_string(bbox)

    road_query = (
        f"[out:json][timeout:180];"
        f'way["highway"~"motorway|trunk|primary|secondary"]({bbox_clause});'
        "out geom tags;"
    )
    green_query = (
        f"[out:json][timeout:180];("
        f'way["leisure"~"park|garden|nature_reserve"]({bbox_clause});'
        f'way["landuse"~"forest|grass|recreation_ground"]({bbox_clause});'
        f'way["natural"~"wood|grassland|scrub"]({bbox_clause});'
        ");out geom tags;"
    )
    industry_query = (
        f"[out:json][timeout:180];("
        f'way["landuse"="industrial"]({bbox_clause});'
        f'way["industrial"]({bbox_clause});'
        f'node["man_made"="works"]({bbox_clause});'
        ");out geom tags;"
    )

    road_payload = overpass_json(
        raw_dir,
        "roads_bbox_v2.json",
        road_query,
        force_refresh=force_refresh,
    )
    green_payload = overpass_json(
        raw_dir,
        "greens_bbox_v2.json",
        green_query,
        force_refresh=force_refresh,
    )
    industry_payload = overpass_json(
        raw_dir,
        "industries_bbox_v2.json",
        industry_query,
        force_refresh=force_refresh,
    )

    roads: list[dict[str, Any]] = []
    for element in road_payload.get("elements", []):
        coords = way_coordinates(element)
        if len(coords) < 2:
            continue
        tags = element.get("tags") or {}
        roads.append(
            {
                "id": f"road-{element['id']}",
                "name": tags.get("name") or tags.get("ref") or f"Road {element['id']}",
                "category": tags.get("highway", "road"),
                "coordinates": coords,
            }
        )

    green_areas: list[dict[str, Any]] = []
    for element in green_payload.get("elements", []):
        coords = way_coordinates(element)
        if len(coords) < 3:
            continue
        tags = element.get("tags") or {}
        if coords[0] != coords[-1]:
            coords.append(coords[0])
        area_m2 = polygon_area_m2(coords)
        if area_m2 < 20_000:
            continue
        green_areas.append(
            {
                "id": f"green-{element['id']}",
                "name": tags.get("name") or tags.get("landuse") or tags.get("natural") or f"Green {element['id']}",
                "category": tags.get("leisure")
                or tags.get("landuse")
                or tags.get("natural")
                or "green",
                "coordinates": coords,
            }
        )

    industries: list[dict[str, Any]] = []
    for element in industry_payload.get("elements", []):
        tags = element.get("tags") or {}
        if element["type"] == "node":
            lat = float(element["lat"])
            lng = float(element["lon"])
        else:
            coords = way_coordinates(element)
            if not coords:
                continue
            lat, lng = centroid(coords)
        industries.append(
            {
                "id": f"industry-{element['type']}-{element['id']}",
                "name": tags.get("name") or tags.get("industrial") or "Sanayi tesisi",
                "category": tags.get("landuse")
                or tags.get("industrial")
                or tags.get("man_made")
                or "industrial",
                "lat": lat,
                "lng": lng,
            }
        )

    return roads, industries, green_areas


def fetch_elevations(
    raw_dir: Path,
    cache_name: str,
    points: list[tuple[float, float]],
    force_refresh: bool = False,
) -> list[float]:
    cache_path = raw_dir / cache_name

    if cache_path.exists() and not force_refresh:
        with cache_path.open("r", encoding="utf-8") as handle:
            payload = json.load(handle)
            return [float(value) for value in payload["elevation"]]

    params = {
        "latitude": ",".join(f"{lat:.6f}" for lat, _ in points),
        "longitude": ",".join(f"{lng:.6f}" for _, lng in points),
    }
    response = requests.get(
        OPEN_METEO_ELEVATION_URL,
        params=params,
        headers={"User-Agent": "codex-bursa-air-quality/1.0"},
        timeout=180,
    )
    response.raise_for_status()
    payload = response.json()
    cache_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return [float(value) for value in payload["elevation"]]


def fetch_elevation_grid(
    raw_dir: Path,
    bbox: dict[str, float],
    force_refresh: bool = False,
) -> list[dict[str, Any]]:
    grid_size = 6
    lat_step = (bbox["north"] - bbox["south"]) / grid_size
    lng_step = (bbox["east"] - bbox["west"]) / grid_size
    centers: list[tuple[float, float]] = []

    for lat_index in range(grid_size):
        for lng_index in range(grid_size):
            south = bbox["south"] + lat_step * lat_index
            west = bbox["west"] + lng_step * lng_index
            north = south + lat_step
            east = west + lng_step
            centers.append(((south + north) / 2, (west + east) / 2))

    elevations = fetch_elevations(
        raw_dir,
        "elevation_grid.json",
        centers,
        force_refresh=force_refresh,
    )
    polygons: list[dict[str, Any]] = []

    for index, value in enumerate(elevations):
        lat_index = index // grid_size
        lng_index = index % grid_size
        south = bbox["south"] + lat_step * lat_index
        west = bbox["west"] + lng_step * lng_index
        north = south + lat_step
        east = west + lng_step
        polygons.append(
            {
                "id": f"elevation-{lat_index}-{lng_index}",
                "name": f"Elevation grid {lat_index + 1}-{lng_index + 1}",
                "category": "elevation",
                "value": round(float(value), 2),
                "coordinates": [
                    (south, west),
                    (south, east),
                    (north, east),
                    (north, west),
                    (south, west),
                ],
            }
        )

    return polygons


def station_feature_query(station: dict[str, Any]) -> str:
    lat = station["lat"]
    lng = station["lng"]
    return (
        "[out:json][timeout:180];("
        f'way["building"](around:1000,{lat},{lng});'
        f'way["highway"](around:1000,{lat},{lng});'
        f'way["landuse"="industrial"](around:1000,{lat},{lng});'
        f'way["industrial"](around:1000,{lat},{lng});'
        f'node["man_made"="works"](around:1000,{lat},{lng});'
        f'way["leisure"~"park|garden|nature_reserve"](around:1000,{lat},{lng});'
        f'way["landuse"~"forest|grass|meadow|recreation_ground|orchard|vineyard|farmland"](around:1000,{lat},{lng});'
        f'way["natural"~"wood|grassland|scrub"](around:1000,{lat},{lng});'
        ");out geom tags;"
    )


def sample_points_for_radius(lat: float, lng: float, radius_m: int) -> list[tuple[float, float]]:
    points = [(lat, lng)]
    for bearing in range(0, 360, 45):
        points.append(offset_lat_lng(lat, lng, radius_m * 0.7, bearing))
    return points


def compute_context_metrics(
    raw_dir: Path,
    stations: list[dict[str, Any]],
    force_refresh: bool = False,
) -> list[dict[str, Any]]:
    metrics: list[dict[str, Any]] = []

    for station in stations:
        payload = overpass_json(
            raw_dir,
            f"context_{station['id']}.json",
            station_feature_query(station),
            force_refresh=force_refresh,
        )
        building_polygons: list[tuple[list[tuple[float, float]], float, tuple[float, float]]] = []
        green_polygons: list[tuple[list[tuple[float, float]], float, tuple[float, float]]] = []
        industrial_polygons: list[tuple[list[tuple[float, float]], float, tuple[float, float]]] = []
        industrial_points: list[tuple[float, float]] = []
        road_segments: list[tuple[list[tuple[float, float]], str]] = []

        for element in payload.get("elements", []):
            tags = element.get("tags") or {}
            element_type = element.get("type")
            if element_type == "node":
                industrial_points.append((float(element["lat"]), float(element["lon"])))
                continue

            coords = way_coordinates(element)
            if not coords:
                continue

            if tags.get("building"):
                if coords[0] != coords[-1]:
                    coords.append(coords[0])
                building_polygons.append((coords, polygon_area_m2(coords), centroid(coords)))
                continue

            if tags.get("highway"):
                road_segments.append((coords, tags.get("highway", "road")))
                continue

            if tags.get("landuse") == "industrial" or tags.get("industrial"):
                if coords[0] != coords[-1]:
                    coords.append(coords[0])
                industrial_polygons.append((coords, polygon_area_m2(coords), centroid(coords)))
                continue

            if tags.get("leisure") or tags.get("natural") or tags.get("landuse"):
                if coords[0] != coords[-1]:
                    coords.append(coords[0])
                green_polygons.append((coords, polygon_area_m2(coords), centroid(coords)))

        elevation_lookup: dict[int, tuple[float, float]] = {}
        center_elevation = 0.0

        for radius in (250, 500, 1000):
            sample_points = sample_points_for_radius(station["lat"], station["lng"], radius)
            elevations = fetch_elevations(
                raw_dir,
                f"elevation_{station['id']}_{radius}.json",
                sample_points,
                force_refresh=force_refresh,
            )
            center_elevation = elevations[0]
            elevation_mean = sum(elevations) / len(elevations)
            slope_mean = sum(
                math.degrees(math.atan(abs(elevation - center_elevation) / (radius * 0.7)))
                for elevation in elevations[1:]
            ) / max(1, len(elevations) - 1)
            elevation_lookup[radius] = (elevation_mean, slope_mean)

        station["elevationM"] = round(center_elevation, 2)

        for radius in (250, 500, 1000):
            buffer_area = math.pi * radius * radius
            building_area = sum(
                area
                for _, area, center in building_polygons
                if haversine_distance_m(station["lat"], station["lng"], center[0], center[1]) <= radius
            )
            green_area = sum(
                area
                for _, area, center in green_polygons
                if haversine_distance_m(station["lat"], station["lng"], center[0], center[1]) <= radius
            )
            industrial_area = sum(
                area
                for _, area, center in industrial_polygons
                if haversine_distance_m(station["lat"], station["lng"], center[0], center[1]) <= radius
            )
            industry_count = sum(
                1
                for _, _, center in industrial_polygons
                if haversine_distance_m(station["lat"], station["lng"], center[0], center[1]) <= radius
            )
            industry_count += sum(
                1
                for lat, lng in industrial_points
                if haversine_distance_m(station["lat"], station["lng"], lat, lng) <= radius
            )

            road_length = 0.0
            road_area_proxy = 0.0
            for coords, highway in road_segments:
                for index in range(len(coords) - 1):
                    lat_a, lng_a = coords[index]
                    lat_b, lng_b = coords[index + 1]
                    mid_lat = (lat_a + lat_b) / 2
                    mid_lng = (lng_a + lng_b) / 2
                    if haversine_distance_m(station["lat"], station["lng"], mid_lat, mid_lng) > radius:
                        continue
                    segment_length = haversine_distance_m(lat_a, lng_a, lat_b, lng_b)
                    road_length += segment_length
                    road_area_proxy += segment_length * ROAD_WIDTHS_M.get(highway, 6.0)

            mean_elevation, slope_mean = elevation_lookup[radius]
            metrics.append(
                {
                    "stationId": station["id"],
                    "radiusM": radius,
                    "buildingDensity": round(building_area / buffer_area, 4),
                    "roadDensity": round(
                        (road_length / 1000.0) / (buffer_area / 1_000_000.0),
                        4,
                    ),
                    "greenRatio": round(min(1.0, green_area / buffer_area), 4),
                    "imperviousRatio": round(
                        min(1.0, (building_area + industrial_area + road_area_proxy) / buffer_area),
                        4,
                    ),
                    "industryCount": industry_count,
                    "meanElevation": round(mean_elevation, 2),
                    "slopeMean": round(slope_mean, 2),
                }
            )

    return metrics


def rolling_windows(
    start_date: date,
    end_date: date,
    *,
    days: int,
) -> list[tuple[date, date]]:
    windows: list[tuple[date, date]] = []
    cursor = start_date

    while cursor <= end_date:
        window_end = min(end_date, cursor + timedelta(days=days - 1))
        windows.append((cursor, window_end))
        cursor = window_end + timedelta(days=1)

    return windows


def normalize_airqoon_name(name: str, tenant_name: str) -> str:
    prefix = name.split(" - ", 1)[0].strip()

    if prefix and prefix != name:
        return prefix

    if tenant_name:
        return f"{tenant_name} / {name}".strip()

    return name


def fetch_airqoon_sensor_network(
    raw_dir: Path,
    bbox: dict[str, float],
    start_date: date,
    end_date: date,
    force_refresh: bool = False,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, str]]]:
    network_start = max(start_date, date(2024, 1, 1))

    if network_start > end_date:
        return [], [], []

    cache = CacheSession(raw_dir, force_refresh=force_refresh)
    issues: list[dict[str, str]] = []

    try:
        devices = cache.get_json(
            AIRQOON_V2_DEVICES_URL,
            cache_name="airqoon_devices_v2.json",
            timeout=25,
        )
    except requests.RequestException as exc:
        return (
            [],
            [],
            [
                {
                    "id": "airqoon-fetch-failed",
                    "severity": "warning",
                    "source": "Airqoon Bursa API",
                    "message": f"Belediye sensör ağı alınamadı: {exc}",
                }
            ],
        )

    stations: list[dict[str, Any]] = []
    device_id_to_station: dict[str, dict[str, Any]] = {}
    used_ids: set[str] = set()

    for device in devices:
        location = device.get("Location") or {}
        lat = location.get("Latitude")
        lng = location.get("Longitude")

        if lat is None or lng is None:
            continue
        if not point_in_bbox(float(lat), float(lng), bbox):
            continue

        tenant_name = str(device.get("TenantName") or "Airqoon")
        raw_name = str(device.get("Name") or device.get("Label") or device["DeviceId"])
        display_name = normalize_airqoon_name(raw_name, tenant_name)
        station_id = slugify_station_id(f"{tenant_name}-{display_name}")
        counter = 2
        original_station_id = station_id

        while station_id in used_ids:
            station_id = f"{original_station_id}-{counter}"
            counter += 1

        station = {
            "id": station_id,
            "sourceId": device["DeviceId"],
            "name": display_name,
            "district": tenant_name,
            "stationType": "sensor-network",
            "lat": float(lat),
            "lng": float(lng),
            "elevationM": 0,
            "pollutants": [],
            "dataSource": "municipal-sensor",
            "operator": tenant_name,
        }
        stations.append(station)
        device_id_to_station[device["DeviceId"]] = station
        used_ids.add(station_id)

    pollutant_keys = {
        "PM10": "PM10",
        "PM25": "PM2.5",
    }
    records: list[dict[str, Any]] = []
    station_pollutants: dict[str, set[str]] = defaultdict(set)
    network_failures = 0
    network_aborted = False

    for device_id, station in device_id_to_station.items():
        if network_aborted:
            break

        daily_accumulator: dict[tuple[str, str], list[float]] = defaultdict(list)

        for window_start, window_end in rolling_windows(network_start, end_date, days=90):
            start_ms = int(
                datetime.combine(window_start, datetime.min.time(), tzinfo=UTC).timestamp()
                * 1000
            )
            end_ms = int(
                datetime.combine(window_end, datetime.max.time(), tzinfo=UTC).timestamp() * 1000
            )
            cache_name = (
                f"airqoon_{station['id']}_{window_start.isoformat()}_{window_end.isoformat()}.json"
            )

            try:
                payload = cache.get_json(
                    f"{AIRQOON_API_URL}/v2/devices/{device_id}/telemetries",
                    params={"startTime": start_ms, "endTime": end_ms},
                    cache_name=cache_name,
                    timeout=25,
                )
            except requests.RequestException:
                network_failures += 1
                if network_failures >= 5:
                    network_aborted = True
                continue

            for source_key, pollutant in pollutant_keys.items():
                for item in payload.get(source_key) or []:
                    try:
                        value = float(item["Value"])
                    except (KeyError, TypeError, ValueError):
                        continue

                    if value < 0:
                        continue

                    timestamp = str(item.get("Date") or "")
                    if not timestamp:
                        continue

                    daily_accumulator[(timestamp[:10], pollutant)].append(value)

        for (day, pollutant), values in sorted(daily_accumulator.items()):
            records.append(
                {
                    "stationId": station["id"],
                    "timestamp": f"{day}T00:00:00Z",
                    "pollutant": pollutant,
                    "value": round(sum(values) / len(values), 4),
                    "unit": "ug/m3",
                    "qualityFlag": "screened",
                    "source": f"Airqoon / {station['operator']}",
                }
            )
            station_pollutants[station["id"]].add(pollutant)

    order = ["PM10", "PM2.5", "NO2", "SO2", "O3"]
    for station in stations:
        station["pollutants"] = sorted(station_pollutants.get(station["id"], set()), key=order.index)

    covered_stations = sum(1 for station in stations if station["pollutants"])
    if covered_stations:
        issues.append(
            {
                "id": "airqoon-network-added",
                "severity": "info",
                "source": "Airqoon Bursa API",
                "message": (
                    f"Belediye sensör ağından {covered_stations} yardımcı istasyon için "
                    "2024-01-01 sonrası günlük PM10 ve PM2.5 serisi eklendi."
                ),
            }
        )

    if network_aborted:
        issues.append(
            {
                "id": "airqoon-network-timeout",
                "severity": "warning",
                "source": "Airqoon Bursa API",
                "message": (
                    "Belediye sensör ağının tarihsel API'si yavaş yanıt verdiği için yalnızca "
                    "erişilebilen pencereler pakete eklendi."
                ),
            }
        )

    stations = [station for station in stations if station["pollutants"]]
    valid_station_ids = {station["id"] for station in stations}
    records = [record for record in records if record["stationId"] in valid_station_ids]

    return stations, records, issues


def fetch_modeled_air_quality_backfill(
    raw_dir: Path,
    reference_stations: list[dict[str, Any]],
    start_date: date,
    end_date: date,
    force_refresh: bool = False,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, str]]]:
    cache = CacheSession(raw_dir, force_refresh=force_refresh)
    issues: list[dict[str, str]] = []
    stations: list[dict[str, Any]] = []
    records: list[dict[str, Any]] = []

    pollutant_map = {
        "pm10": "PM10",
        "pm2_5": "PM2.5",
        "nitrogen_dioxide": "NO2",
        "sulphur_dioxide": "SO2",
        "ozone": "O3",
    }

    for station in reference_stations:
        modeled_station = {
            "id": f"modeled-{station['id']}",
            "sourceId": station["id"],
            "name": f"Model / {station['name']}",
            "district": station["district"],
            "stationType": "modeled-background",
            "lat": station["lat"],
            "lng": station["lng"],
            "elevationM": station.get("elevationM", 0),
            "pollutants": [],
            "dataSource": "modeled",
            "operator": "Open-Meteo Air Quality",
        }

        try:
            payload = cache.get_json(
                OPEN_METEO_AIR_QUALITY_URL,
                params={
                    "latitude": station["lat"],
                    "longitude": station["lng"],
                    "start_date": start_date.isoformat(),
                    "end_date": end_date.isoformat(),
                    "hourly": ",".join(pollutant_map.keys()),
                    "timezone": "GMT",
                },
                cache_name=(
                    f"modeled_air_quality_{station['id']}_{start_date.isoformat()}_"
                    f"{end_date.isoformat()}.json"
                ),
                timeout=60,
            )
        except requests.RequestException as exc:
            issues.append(
                {
                    "id": f"modeled-backfill-failed-{station['id']}",
                    "severity": "warning",
                    "source": "Open-Meteo Air Quality",
                    "message": f"{station['name']} için model tabanlı seri alınamadı: {exc}",
                }
            )
            continue

        hourly = payload.get("hourly") or {}
        daily_values: dict[tuple[str, str], list[float]] = defaultdict(list)

        for source_key, pollutant in pollutant_map.items():
            for timestamp, value in zip(hourly.get("time") or [], hourly.get(source_key) or []):
                if value is None:
                    continue
                daily_values[(str(timestamp)[:10], pollutant)].append(float(value))

        pollutant_set: set[str] = set()
        for (day, pollutant), values in sorted(daily_values.items()):
            if not values:
                continue

            records.append(
                {
                    "stationId": modeled_station["id"],
                    "timestamp": f"{day}T00:00:00Z",
                    "pollutant": pollutant,
                    "value": round(sum(values) / len(values), 4),
                    "unit": "ug/m3",
                    "qualityFlag": "estimated",
                    "source": "Open-Meteo Air Quality",
                }
            )
            pollutant_set.add(pollutant)

        if pollutant_set:
            order = ["PM10", "PM2.5", "NO2", "SO2", "O3"]
            modeled_station["pollutants"] = sorted(pollutant_set, key=order.index)
            stations.append(modeled_station)

    if stations:
        issues.append(
            {
                "id": "modeled-backfill-added",
                "severity": "info",
                "source": "Open-Meteo Air Quality",
                "message": (
                    f"Resmî istasyon koordinatları için {len(stations)} model tabanlı "
                    "yardımcı seri üretildi."
                ),
            }
        )

    return stations, records, issues


def fetch_meteo_series(
    raw_dir: Path,
    stations: list[dict[str, Any]],
    start_date: date,
    end_date: date,
    force_refresh: bool = False,
) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    cache = CacheSession(raw_dir, force_refresh=force_refresh)

    for station in stations:
        cache_name = f"meteo_{station['id']}_{start_date.isoformat()}_{end_date.isoformat()}.json"
        payload = cache.get_json(
            OPEN_METEO_ARCHIVE_URL,
            params={
                "latitude": station["lat"],
                "longitude": station["lng"],
                "start_date": start_date.isoformat(),
                "end_date": end_date.isoformat(),
                "daily": ",".join(
                    [
                        "temperature_2m_mean",
                        "relative_humidity_2m_mean",
                        "precipitation_sum",
                        "wind_speed_10m_mean",
                        "wind_direction_10m_dominant",
                    ]
                ),
                "timezone": "GMT",
            },
            cache_name=cache_name,
        )
        daily = payload.get("daily") or {}

        for index, day in enumerate(daily.get("time") or []):
            records.append(
                {
                    "stationIdOrGridId": station["id"],
                    "timestamp": f"{day}T00:00:00Z",
                    "temperatureC": float((daily.get("temperature_2m_mean") or [0])[index] or 0),
                    "humidityPct": float((daily.get("relative_humidity_2m_mean") or [0])[index] or 0),
                    "windSpeedMs": round(
                        float((daily.get("wind_speed_10m_mean") or [0])[index] or 0) / 3.6,
                        4,
                    ),
                    "windDirDeg": float((daily.get("wind_direction_10m_dominant") or [0])[index] or 0),
                    "precipitationMm": float((daily.get("precipitation_sum") or [0])[index] or 0),
                    "source": "Open-Meteo Archive",
                }
            )

    records.sort(key=lambda item: (item["stationIdOrGridId"], item["timestamp"]))
    return records


def read_csv_rows(text: str) -> list[dict[str, str]]:
    reader = csv.DictReader(text.splitlines())
    return [dict(row) for row in reader]


def cluster_fire_hotspots(rows: list[dict[str, str]]) -> list[dict[str, Any]]:
    hotspots: list[dict[str, Any]] = []
    for row in rows:
        try:
            latitude = float(row["latitude"])
            longitude = float(row["longitude"])
            acq_date = row["acq_date"]
            acq_time = row["acq_time"].zfill(4)
            timestamp = datetime.strptime(f"{acq_date} {acq_time}", "%Y-%m-%d %H%M")
            confidence_text = row.get("confidence", "")
            confidence = (
                float(confidence_text)
                if confidence_text.replace(".", "", 1).isdigit()
                else 60.0
            )
            frp = float(row.get("frp") or 0)
        except (KeyError, ValueError):
            continue

        hotspots.append(
            {
                "lat": latitude,
                "lng": longitude,
                "timestamp": timestamp,
                "confidence": confidence,
                "frp": frp,
            }
        )

    hotspots.sort(key=lambda item: item["timestamp"])
    clusters: list[list[dict[str, Any]]] = []

    for hotspot in hotspots:
        placed = False
        for cluster in clusters:
            latest = cluster[-1]
            if hotspot["timestamp"] - latest["timestamp"] > timedelta(days=3):
                continue
            if haversine_distance_m(
                hotspot["lat"],
                hotspot["lng"],
                latest["lat"],
                latest["lng"],
            ) > 20_000:
                continue
            cluster.append(hotspot)
            placed = True
            break

        if not placed:
            clusters.append([hotspot])

    events: list[dict[str, Any]] = []
    for index, cluster in enumerate(clusters, start=1):
        lat = sum(item["lat"] for item in cluster) / len(cluster)
        lng = sum(item["lng"] for item in cluster) / len(cluster)
        radius_km = max(
            2.0,
            max(
                haversine_distance_m(lat, lng, item["lat"], item["lng"]) / 1000
                for item in cluster
            ),
        )
        events.append(
            {
                "eventId": f"firms-fire-{index}",
                "eventType": "fire",
                "name": f"NASA FIRMS yangin kumesi {index}",
                "startDate": cluster[0]["timestamp"].strftime("%Y-%m-%dT%H:%M:%SZ"),
                "endDate": cluster[-1]["timestamp"].strftime("%Y-%m-%dT%H:%M:%SZ"),
                "center": {"lat": round(lat, 6), "lng": round(lng, 6)},
                "radiusKm": round(radius_km, 2),
                "source": "NASA FIRMS",
                "confidence": round(
                    sum(item["confidence"] for item in cluster) / len(cluster) / 100,
                    4,
                ),
                "hotspotCount": len(cluster),
                "note": "VIIRS historical hotspot cluster",
            }
        )

    return events


def fetch_fire_events(
    raw_dir: Path,
    bbox: dict[str, float],
    start_date: date,
    end_date: date,
    force_refresh: bool = False,
) -> tuple[list[dict[str, Any]], list[dict[str, str]]]:
    firms_key = os.getenv("FIRMS_MAP_KEY", "").strip()
    issues: list[dict[str, str]] = []

    if firms_key:
        bbox_fragment = f"{bbox['west']},{bbox['south']},{bbox['east']},{bbox['north']}"
        all_rows: list[dict[str, str]] = []
        cursor = start_date
        window_index = 1

        while cursor <= end_date:
            window_end = min(end_date, cursor + timedelta(days=9))
            cache_path = raw_dir / f"fires_firms_{window_index:03d}.csv"

            if cache_path.exists() and not force_refresh:
                text = cache_path.read_text(encoding="utf-8")
            else:
                url = (
                    f"{FIRMS_AREA_URL}/{firms_key}/VIIRS_SNPP_SP/"
                    f"{bbox_fragment}/10/{window_end.isoformat()}"
                )
                response = requests.get(
                    url,
                    headers={"User-Agent": "codex-bursa-air-quality/1.0"},
                    timeout=180,
                )
                response.raise_for_status()
                text = response.text
                cache_path.write_text(text, encoding="utf-8")

            all_rows.extend(read_csv_rows(text))
            cursor = window_end + timedelta(days=1)
            window_index += 1

        events = cluster_fire_hotspots(all_rows)
        if not events:
            issues.append(
                {
                    "id": "fires-empty",
                    "severity": "warning",
                    "source": "NASA FIRMS",
                    "message": "FIRMS sorgusu tamamlandı ancak seçili 5 yılda Bursa kutusu içinde hotspot bulunamadı.",
                }
            )
        return events, issues

    payload = CacheSession(raw_dir, force_refresh=force_refresh).get_json(
        EONET_EVENTS_URL,
        params={"status": "all", "category": "wildfires", "days": 3650, "limit": 500},
        cache_name="fires_eonet.json",
    )

    events: list[dict[str, Any]] = []
    for event in payload.get("events", []):
        geometries = event.get("geometry") or []
        if not geometries:
            continue
        geometry = geometries[-1]
        coordinates = geometry.get("coordinates") or []
        if len(coordinates) < 2:
            continue
        lng = float(coordinates[0])
        lat = float(coordinates[1])
        if not point_in_bbox(lat, lng, bbox):
            continue
        timestamp = geometry.get("date")
        if not timestamp:
            continue
        events.append(
            {
                "eventId": event["id"].lower(),
                "eventType": "fire",
                "name": event["title"],
                "startDate": timestamp,
                "endDate": event.get("closed") or timestamp,
                "center": {"lat": lat, "lng": lng},
                "radiusKm": 10,
                "source": "NASA EONET",
                "confidence": 0.55,
                "hotspotCount": len(geometries),
                "note": "FIRMS_MAP_KEY tanımlı olmadığı için EONET wildfire fallback kullanıldı.",
            }
        )

    return events, issues


def build_real_dataset(
    *,
    raw_root: Path,
    start_date: date,
    end_date: date,
    force_refresh: bool = False,
) -> dict[str, Any]:
    latest_complete_day = date.today() - timedelta(days=1)
    if end_date > latest_complete_day:
        end_date = latest_complete_day

    airqoon_dir = raw_root / "airqoon"
    modeled_dir = raw_root / "modeled"
    official_dir = raw_root / "official"
    layers_dir = raw_root / "layers"
    meteo_dir = raw_root / "meteo"
    context_dir = raw_root / "context"
    elevation_dir = raw_root / "elevation"
    fire_dir = raw_root / "fires"

    for directory in (
        official_dir,
        airqoon_dir,
        modeled_dir,
        layers_dir,
        meteo_dir,
        context_dir,
        elevation_dir,
        fire_dir,
    ):
        directory.mkdir(parents=True, exist_ok=True)

    official_client = OfficialAirQualityClient(
        official_dir,
        force_refresh=force_refresh,
    )
    defaults = official_client.fetch_defaults()["Object"]
    station_rows = [
        station
        for station in defaults["StationIds"]
        if station["CityId"] == BURSA_CITY_ID
    ]
    source_to_slug, slug_to_station = station_reference_lookup(station_rows)
    station_ids = [station["id"] for station in station_rows]
    official_stations = list(slug_to_station.values())
    stations = list(official_stations)
    bbox = fetch_bursa_bbox(
        layers_dir,
        stations,
        force_refresh=force_refresh,
    )

    completeness_by_station_pollutant: dict[tuple[str, str], dict[str, Any]] = defaultdict(
        lambda: {"actualCount": 0, "expectedCount": 0}
    )
    station_series: list[dict[str, Any]] = []

    for window_start, window_end in month_windows(start_date, end_date):
        payload = official_client.fetch_data(
            station_ids=station_ids,
            parameters=list(POLLUTANT_CODES),
            start_date=window_start,
            end_date=window_end,
            data_period="16",
        )
        response_object = payload.get("Object") or {}

        for summary in response_object.get("Summaries") or []:
            pollutant = normalize_pollutant(summary["Parameter"])
            station_slug = source_to_slug.get(summary["Stationid"])
            if not station_slug:
                continue
            item = completeness_by_station_pollutant[(station_slug, pollutant)]
            item["actualCount"] += int(summary.get("Count") or 0)
            item["expectedCount"] += int(float(summary.get("MustBeCount") or 0))

        for row in response_object.get("Data") or []:
            station_slug = source_to_slug.get(row["Stationid"])
            if not station_slug:
                continue
            timestamp = timestamp_to_utc(row["ReadTime"])
            for code in POLLUTANT_CODES:
                value = row.get(code)
                if value is None:
                    continue
                station_series.append(
                    {
                        "stationId": station_slug,
                        "timestamp": timestamp,
                        "pollutant": normalize_pollutant(code),
                        "value": round(float(value), 4),
                        "unit": canonical_unit(normalize_pollutant(code)),
                        "qualityFlag": "valid",
                        "source": "Ulusal Hava Kalitesi İzleme Ağı",
                    }
                )

    station_series.sort(
        key=lambda item: (item["stationId"], item["timestamp"], item["pollutant"])
    )

    station_pollutants: dict[str, set[str]] = defaultdict(set)
    for record in station_series:
        station_pollutants[record["stationId"]].add(record["pollutant"])

    order = ["PM10", "PM2.5", "NO2", "SO2", "O3"]
    for station in official_stations:
        station["pollutants"] = sorted(
            station_pollutants.get(station["id"], set()),
            key=order.index,
        )

    supplemental_stations, supplemental_series, airqoon_issues = fetch_airqoon_sensor_network(
        airqoon_dir,
        bbox,
        start_date,
        end_date,
        force_refresh=force_refresh,
    )
    modeled_stations, modeled_series, modeled_issues = fetch_modeled_air_quality_backfill(
        modeled_dir,
        official_stations,
        start_date,
        end_date,
        force_refresh=force_refresh,
    )
    base_stations = [*official_stations, *supplemental_stations]
    stations.extend(supplemental_stations)
    stations.extend(modeled_stations)
    station_series.extend(supplemental_series)
    station_series.extend(modeled_series)
    station_series.sort(
        key=lambda item: (item["stationId"], item["timestamp"], item["pollutant"])
    )

    meteo_series = fetch_meteo_series(
        meteo_dir,
        base_stations,
        start_date,
        end_date,
        force_refresh=force_refresh,
    )
    modeled_station_lookup = {station["id"]: station for station in modeled_stations}
    for record in list(meteo_series):
        modeled_station = modeled_station_lookup.get(f"modeled-{record['stationIdOrGridId']}")
        if not modeled_station:
            continue
        meteo_series.append(
            {
                **record,
                "stationIdOrGridId": modeled_station["id"],
            }
        )

    roads, industries, green_areas = fetch_layers(
        layers_dir,
        bbox,
        force_refresh=force_refresh,
    )
    context_metrics = compute_context_metrics(
        context_dir,
        base_stations,
        force_refresh=force_refresh,
    )
    modeled_context_metrics: list[dict[str, Any]] = []
    context_by_station_radius = {
        (metric["stationId"], metric["radiusM"]): metric for metric in context_metrics
    }
    for modeled_station in modeled_stations:
        reference_station_id = modeled_station["sourceId"]
        for radius in (250, 500, 1000):
            reference = context_by_station_radius.get((reference_station_id, radius))
            if not reference:
                continue
            modeled_context_metrics.append(
                {
                    **reference,
                    "stationId": modeled_station["id"],
                }
            )
    context_metrics.extend(modeled_context_metrics)

    elevation_grid = fetch_elevation_grid(
        elevation_dir,
        bbox,
        force_refresh=force_refresh,
    )
    fetched_events, fire_issues = fetch_fire_events(
        fire_dir,
        bbox,
        start_date,
        end_date,
        force_refresh=force_refresh,
    )
    curated_events = curated_bursa_events(start_date, end_date)
    events = merge_event_catalogs(curated_events, fetched_events)
    event_source_notes = sorted(
        {
            event["referenceUrl"]
            for event in events
            if isinstance(event, dict) and event.get("referenceUrl")
        }
    )

    if any(event.get("source") == "NASA FIRMS" for event in events):
        event_source_notes.append("https://firms.modaps.eosdis.nasa.gov/api/")
    elif any(event.get("source") == "NASA EONET" for event in events):
        event_source_notes.append(EONET_EVENTS_URL)

    coverage_rows: list[dict[str, Any]] = []
    completeness_overview: dict[str, dict[str, Any]] = defaultdict(
        lambda: {"actualCount": 0, "expectedCount": 0}
    )

    for (station_id, pollutant), values in completeness_by_station_pollutant.items():
        supported = pollutant in station_pollutants.get(station_id, set())
        expected = values["expectedCount"] if supported else 0
        actual = values["actualCount"]
        ratio = (actual / expected) if expected else 0.0
        coverage_rows.append(
            {
                "stationId": station_id,
                "pollutant": pollutant,
                "supported": supported,
                "actualCount": actual,
                "expectedCount": expected,
                "completenessRatio": round(ratio, 4),
                "missingCount": max(expected - actual, 0),
            }
        )
        if supported:
            completeness_overview[pollutant]["actualCount"] += actual
            completeness_overview[pollutant]["expectedCount"] += expected

    coverage_rows.sort(key=lambda item: (item["stationId"], item["pollutant"]))

    completeness_cards: list[dict[str, Any]] = []
    issues: list[dict[str, str]] = []

    for pollutant in ["PM10", "PM2.5", "NO2", "SO2", "O3"]:
        totals = completeness_overview[pollutant]
        expected = totals["expectedCount"]
        actual = totals["actualCount"]
        ratio = (actual / expected) if expected else 0.0
        completeness_cards.append(
            {
                "pollutant": pollutant,
                "actualCount": actual,
                "expectedCount": expected,
                "completenessRatio": round(ratio, 4),
            }
        )
        if expected and ratio < 0.75:
            issues.append(
                {
                    "id": f"coverage-{slugify_station_id(pollutant)}",
                    "severity": "warning",
                    "source": "Ulusal Hava Kalitesi İzleme Ağı",
                    "message": f"{pollutant} için 5 yıllık genel veri bütünlüğü %{round(ratio * 100, 1)} seviyesinde.",
                }
            )

    weakest_rows = sorted(
        [row for row in coverage_rows if row.get("supported", True)],
        key=lambda item: item["completenessRatio"],
    )[:8]
    for row in weakest_rows:
        if row["expectedCount"] == 0:
            continue
        if row["completenessRatio"] >= 0.55:
            break
        station_name = next(
            (station["name"] for station in stations if station["id"] == row["stationId"]),
            row["stationId"],
        )
        issues.append(
            {
                "id": f"station-gap-{row['stationId']}-{slugify_station_id(row['pollutant'])}",
                "severity": "warning",
                "source": "Ulusal Hava Kalitesi İzleme Ağı",
                "message": f"{station_name} istasyonunda {row['pollutant']} bütünlüğü %{round(row['completenessRatio'] * 100, 1)} seviyesinde.",
            }
        )

    issues.extend(airqoon_issues)
    issues.extend(modeled_issues)
    issues.extend(fire_issues)

    return {
        "metadata": {
            "version": f"official-daily-{end_date.isoformat()}",
            "generatedAt": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "coverageStart": start_date.isoformat(),
            "coverageEnd": end_date.isoformat(),
            "description": "Bursa için son 5 yıllık resmî günlük hava kalitesi arşivi, meteoroloji bağlamı ve statik mekânsal katman paketi.",
            "methods": [
                "Resmî günlük istasyon verisi aylık chunk sorguları",
                "Airqoon / belediye sensör ağı günlük PM10-PM2.5 yardımcı serisi",
                "Open-Meteo Air Quality model tabanlı günlük yardımcı seri",
                "Open-Meteo günlük meteoroloji arşivi",
                "OSM/Overpass tabanlı yol, yeşil alan ve sanayi katmanları",
                "Buffer bazlı bağlamsal özet metrikler",
                "Open-Meteo elevation endpoint ile yükseklik ve eğim kestirimi",
            ],
            "sourceNotes": [
                OFFICIAL_PAGE_URL,
                AIRQOON_V2_DEVICES_URL,
                OPEN_METEO_AIR_QUALITY_URL,
                OPEN_METEO_ARCHIVE_URL,
                "https://overpass-api.de/api/interpreter",
                *event_source_notes,
            ],
            "dataIssues": issues,
            "completenessOverview": completeness_cards,
            "stationCoverage": coverage_rows,
        },
        "stations": stations,
        "stationTimeSeries": station_series,
        "meteoTimeSeries": meteo_series,
        "contextMetrics": context_metrics,
        "events": events,
        "roads": roads,
        "industries": industries,
        "greenAreas": green_areas,
        "elevationGrid": elevation_grid,
    }
