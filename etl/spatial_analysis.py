from __future__ import annotations

import json
import math
import random
from collections import defaultdict
from datetime import date, datetime
from functools import lru_cache
from pathlib import Path
from typing import Any

import numpy as np

GRID_RESOLUTION_KM = 5.0
ANALYSIS_RADIUS_M = 3_000.0
IDW_POWER = 2.0
MIN_IDW_OBSERVATIONS = 4
MIN_KRIGING_OBSERVATIONS = 10
MIN_BUCKET_COMPLETENESS = 0.7

SPATIAL_MANIFEST_VERSION = "spatial-analysis-manifest-v1"
SPATIAL_PACKAGE_VERSION = "spatial-analysis-v1"
BOUNDARY_PATH = Path(__file__).resolve().parents[1] / "public" / "data" / "bursa-boundary.json"

SCOPES: dict[str, tuple[str, ...]] = {
    "measured": ("official", "municipal-official"),
    "measured-plus-sensor": (
        "official",
        "municipal-official",
        "municipal-sensor",
    ),
}

POLLUTANT_ORDER = ("PM10", "PM2.5", "NO2", "SO2", "O3", "CO")
SCREENING_THRESHOLDS = {
    "PM10": 50.0,
    "PM2.5": 25.0,
    "NO2": 100.0,
    "SO2": 125.0,
    "O3": 120.0,
    "CO": 10.0,
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
SOURCE_DRIVER_LABELS = {
    "roadDensity": "Yol yogunlugu",
    "industryProximity": "Sanayi yakinligi",
    "greenRatio": "Yesil oran",
    "imperviousRatio": "Gecirimsiz yuzey",
    "meanElevation": "Ortalama yukseklik",
    "slopeMean": "Eğim",
    "windAlignment": "Ruzgar hizalanmasi",
}
SOURCE_DRIVER_KEYS = tuple(SOURCE_DRIVER_LABELS.keys())
MAX_INDUSTRY_INFLUENCE_DISTANCE_M = 10_000.0


def _round(value: float | int | None, digits: int = 3) -> float | None:
    if value is None:
        return None
    return round(float(value), digits)


def _mean(values: list[float]) -> float:
    if not values:
        return 0.0
    return sum(values) / len(values)


def _median(values: list[float]) -> float:
    if not values:
        return 0.0

    sorted_values = sorted(values)
    middle = len(sorted_values) // 2

    if len(sorted_values) % 2 == 0:
        return (sorted_values[middle - 1] + sorted_values[middle]) / 2

    return sorted_values[middle]


def _standard_deviation(values: list[float]) -> float:
    if len(values) < 2:
        return 0.0

    average = _mean(values)
    variance = sum((value - average) ** 2 for value in values) / (len(values) - 1)
    return math.sqrt(variance)


def _year_month_key(value: str) -> str:
    return value[:7]


def _iter_months(start_date: date, end_date: date):
    cursor = date(start_date.year, start_date.month, 1)

    while cursor <= end_date:
        yield cursor.strftime("%Y-%m")
        if cursor.month == 12:
            cursor = date(cursor.year + 1, 1, 1)
        else:
            cursor = date(cursor.year, cursor.month + 1, 1)


def _parse_date(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _station_scope(station: dict[str, Any]) -> str:
    return str(station.get("dataSource") or "official")


def _station_is_in_scope(station: dict[str, Any], source_scope: str) -> bool:
    return _station_scope(station) in SCOPES[source_scope]


@lru_cache(maxsize=1)
def _load_boundary_geometry() -> dict[str, Any] | None:
    if not BOUNDARY_PATH.exists():
        return None

    with BOUNDARY_PATH.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)

    if payload.get("type") in {"Polygon", "MultiPolygon"}:
        return payload

    geometry = payload.get("geometry")
    if isinstance(geometry, dict) and geometry.get("type") in {"Polygon", "MultiPolygon"}:
        return geometry

    features = payload.get("features")
    if isinstance(features, list):
        for feature in features:
            geometry = feature.get("geometry")
            if isinstance(geometry, dict) and geometry.get("type") in {"Polygon", "MultiPolygon"}:
                return geometry

    return None


def _iter_boundary_coordinates(
    boundary_geometry: dict[str, Any],
) -> list[tuple[float, float]]:
    boundary_type = str(boundary_geometry.get("type") or "")
    coordinates = boundary_geometry.get("coordinates") or []

    if boundary_type == "Polygon":
        return [
            (float(lat), float(lng))
            for ring in coordinates
            for lng, lat in ring
        ]

    if boundary_type == "MultiPolygon":
        return [
            (float(lat), float(lng))
            for polygon in coordinates
            for ring in polygon
            for lng, lat in ring
        ]

    return []


def _boundary_extent(boundary_geometry: dict[str, Any]) -> dict[str, float] | None:
    points = _iter_boundary_coordinates(boundary_geometry)
    if not points:
        return None

    latitudes = [lat for lat, _ in points]
    longitudes = [lng for _, lng in points]
    return {
        "south": round(min(latitudes), 6),
        "west": round(min(longitudes), 6),
        "north": round(max(latitudes), 6),
        "east": round(max(longitudes), 6),
    }


def _point_in_ring(
    lat: float,
    lng: float,
    ring: list[list[float]],
) -> bool:
    if len(ring) < 3:
        return False

    closed_ring = ring if ring[0] == ring[-1] else [*ring, ring[0]]
    inside = False
    point_x = lng
    point_y = lat

    for index in range(len(closed_ring) - 1):
        x1 = float(closed_ring[index][0])
        y1 = float(closed_ring[index][1])
        x2 = float(closed_ring[index + 1][0])
        y2 = float(closed_ring[index + 1][1])

        intersects = ((y1 > point_y) != (y2 > point_y)) and (
            point_x < ((x2 - x1) * (point_y - y1) / ((y2 - y1) or 1e-12)) + x1
        )
        if intersects:
            inside = not inside

    return inside


def _point_in_boundary(
    lat: float,
    lng: float,
    boundary_geometry: dict[str, Any],
) -> bool:
    boundary_type = str(boundary_geometry.get("type") or "")
    coordinates = boundary_geometry.get("coordinates") or []

    if boundary_type == "Polygon":
        if not coordinates:
            return False
        if not _point_in_ring(lat, lng, coordinates[0]):
            return False
        return not any(_point_in_ring(lat, lng, hole) for hole in coordinates[1:])

    if boundary_type == "MultiPolygon":
        for polygon in coordinates:
            if not polygon:
                continue
            if not _point_in_ring(lat, lng, polygon[0]):
                continue
            if any(_point_in_ring(lat, lng, hole) for hole in polygon[1:]):
                continue
            return True

    return False


def _extract_points(dataset: dict[str, Any]) -> tuple[list[tuple[float, float]], list[tuple[float, float]], list[tuple[float, float]]]:
    road_points: list[tuple[float, float]] = []
    green_points: list[tuple[float, float]] = []
    polygon_points: list[tuple[float, float]] = []

    for line in dataset.get("roads", []):
        for lat, lng in line.get("coordinates", []):
            road_points.append((float(lat), float(lng)))

    for polygon in dataset.get("greenAreas", []):
        for lat, lng in polygon.get("coordinates", []):
            green_points.append((float(lat), float(lng)))

    for polygon in dataset.get("elevationGrid", []):
        for lat, lng in polygon.get("coordinates", []):
            polygon_points.append((float(lat), float(lng)))

    return road_points, green_points, polygon_points


def _dataset_extent(
    dataset: dict[str, Any],
    boundary_geometry: dict[str, Any] | None = None,
) -> dict[str, float]:
    if boundary_geometry is not None:
        boundary_extent = _boundary_extent(boundary_geometry)
        if boundary_extent is not None:
            return boundary_extent

    latitudes: list[float] = []
    longitudes: list[float] = []

    for station in dataset.get("stations", []):
        latitudes.append(float(station["lat"]))
        longitudes.append(float(station["lng"]))

    road_points, green_points, polygon_points = _extract_points(dataset)
    for lat, lng in (*road_points, *green_points, *polygon_points):
        latitudes.append(float(lat))
        longitudes.append(float(lng))

    if not latitudes or not longitudes:
        return {
            "south": 39.55,
            "west": 28.05,
            "north": 40.8,
            "east": 29.95,
        }

    padding = 0.05
    return {
        "south": round(min(latitudes) - padding, 6),
        "west": round(min(longitudes) - padding, 6),
        "north": round(max(latitudes) + padding, 6),
        "east": round(max(longitudes) + padding, 6),
    }


def _project(
    lat: float,
    lng: float,
    *,
    origin_lat: float,
    origin_lng: float,
) -> tuple[float, float]:
    x = math.radians(lng - origin_lng) * 6_371_000 * math.cos(math.radians(origin_lat))
    y = math.radians(lat - origin_lat) * 6_371_000
    return x, y


def _distance(
    left: tuple[float, float],
    right: tuple[float, float],
) -> float:
    return math.sqrt((left[0] - right[0]) ** 2 + (left[1] - right[1]) ** 2)


def _point_to_segment_distance(
    point: tuple[float, float],
    start: tuple[float, float],
    end: tuple[float, float],
) -> float:
    start_x, start_y = start
    end_x, end_y = end
    point_x, point_y = point
    dx = end_x - start_x
    dy = end_y - start_y

    if dx == 0 and dy == 0:
        return _distance(point, start)

    projection = ((point_x - start_x) * dx + (point_y - start_y) * dy) / (dx * dx + dy * dy)
    projection = max(0.0, min(1.0, projection))
    closest = (start_x + projection * dx, start_y + projection * dy)
    return _distance(point, closest)


def _polygon_area(points: list[tuple[float, float]]) -> float:
    if len(points) < 3:
        return 0.0

    area = 0.0
    for index in range(len(points)):
        x1, y1 = points[index]
        x2, y2 = points[(index + 1) % len(points)]
        area += x1 * y2 - x2 * y1
    return abs(area) / 2


def _polygon_centroid(points: list[tuple[float, float]]) -> tuple[float, float]:
    if not points:
        return 0.0, 0.0

    area = _polygon_area(points)
    if area == 0:
        return sum(point[0] for point in points) / len(points), sum(point[1] for point in points) / len(points)

    centroid_x = 0.0
    centroid_y = 0.0
    for index in range(len(points)):
        x1, y1 = points[index]
        x2, y2 = points[(index + 1) % len(points)]
        cross = x1 * y2 - x2 * y1
        centroid_x += (x1 + x2) * cross
        centroid_y += (y1 + y2) * cross

    factor = 1 / (6 * area)
    return centroid_x * factor, centroid_y * factor


def _point_in_radius(point: tuple[float, float], center: tuple[float, float], radius_m: float) -> bool:
    return _distance(point, center) <= radius_m


def _build_grid_cells(
    dataset: dict[str, Any],
    boundary_geometry: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    extent = _dataset_extent(dataset, boundary_geometry)
    origin_lat = extent["south"]
    origin_lng = extent["west"]
    reference_lat = (extent["south"] + extent["north"]) / 2
    lat_step = GRID_RESOLUTION_KM / 110.574
    lng_denominator = 111.320 * max(math.cos(math.radians(reference_lat)), 0.25)
    lng_step = GRID_RESOLUTION_KM / lng_denominator

    lat_centers: list[float] = []
    lng_centers: list[float] = []

    lat = extent["south"] + (lat_step / 2)
    while lat <= extent["north"]:
        lat_centers.append(lat)
        lat += lat_step

    lng = extent["west"] + (lng_step / 2)
    while lng <= extent["east"]:
        lng_centers.append(lng)
        lng += lng_step

    cells: list[dict[str, Any]] = []

    for row_index, center_lat in enumerate(lat_centers):
        for col_index, center_lng in enumerate(lng_centers):
            if boundary_geometry is not None and not _point_in_boundary(
                center_lat,
                center_lng,
                boundary_geometry,
            ):
                continue

            center_xy = _project(
                center_lat,
                center_lng,
                origin_lat=origin_lat,
                origin_lng=origin_lng,
            )
            half_lat = lat_step / 2
            half_lng = lng_step / 2
            polygon = [
                [round(center_lat - half_lat, 6), round(center_lng - half_lng, 6)],
                [round(center_lat - half_lat, 6), round(center_lng + half_lng, 6)],
                [round(center_lat + half_lat, 6), round(center_lng + half_lng, 6)],
                [round(center_lat + half_lat, 6), round(center_lng - half_lng, 6)],
                [round(center_lat - half_lat, 6), round(center_lng - half_lng, 6)],
            ]

            cells.append(
                {
                    "cellId": f"r{row_index:03d}c{col_index:03d}",
                    "row": row_index,
                    "col": col_index,
                    "center": {
                        "lat": round(center_lat, 6),
                        "lng": round(center_lng, 6),
                    },
                    "centerProjected": {
                        "x": round(center_xy[0], 3),
                        "y": round(center_xy[1], 3),
                    },
                    "polygon": polygon,
                }
            )

    if not cells and boundary_geometry is not None:
        return _build_grid_cells(dataset, None)

    return cells


def _road_segments(
    dataset: dict[str, Any],
    *,
    origin_lat: float,
    origin_lng: float,
) -> list[dict[str, Any]]:
    segments: list[dict[str, Any]] = []

    for line in dataset.get("roads", []):
        coordinates = [
            _project(float(lat), float(lng), origin_lat=origin_lat, origin_lng=origin_lng)
            for lat, lng in line.get("coordinates", [])
        ]
        if len(coordinates) < 2:
            continue

        for index in range(len(coordinates) - 1):
            start = coordinates[index]
            end = coordinates[index + 1]
            segments.append(
                {
                    "start": start,
                    "end": end,
                    "category": str(line.get("category") or "residential"),
                    "length": _distance(start, end),
                }
            )

    return segments


def _green_polygons(
    dataset: dict[str, Any],
    *,
    origin_lat: float,
    origin_lng: float,
) -> list[dict[str, Any]]:
    polygons: list[dict[str, Any]] = []

    for polygon in dataset.get("greenAreas", []):
        coordinates = [
            _project(float(lat), float(lng), origin_lat=origin_lat, origin_lng=origin_lng)
            for lat, lng in polygon.get("coordinates", [])
        ]
        if len(coordinates) < 3:
            continue
        if coordinates[0] != coordinates[-1]:
            coordinates.append(coordinates[0])
        area = _polygon_area(coordinates)
        centroid = _polygon_centroid(coordinates)
        polygons.append(
            {
                "area": area,
                "centroid": centroid,
            }
        )

    return polygons


def _industrial_features(
    dataset: dict[str, Any],
    *,
    origin_lat: float,
    origin_lng: float,
) -> list[dict[str, Any]]:
    features: list[dict[str, Any]] = []

    for industry in dataset.get("industries", []):
        projected = _project(
            float(industry["lat"]),
            float(industry["lng"]),
            origin_lat=origin_lat,
            origin_lng=origin_lng,
        )
        features.append(
            {
                "point": projected,
                "category": str(industry.get("category") or "industrial"),
            }
        )

    return features


def _elevation_points(
    dataset: dict[str, Any],
    *,
    origin_lat: float,
    origin_lng: float,
) -> list[dict[str, Any]]:
    points: list[dict[str, Any]] = []

    for polygon in dataset.get("elevationGrid", []):
        coordinates = [
            _project(float(lat), float(lng), origin_lat=origin_lat, origin_lng=origin_lng)
            for lat, lng in polygon.get("coordinates", [])
        ]
        if len(coordinates) < 3:
            continue
        centroid = _polygon_centroid(coordinates)
        points.append(
            {
                "centroid": centroid,
                "value": float(polygon.get("value") or 0.0),
            }
        )

    return points


def _cell_contexts(
    cells: list[dict[str, Any]],
    *,
    origin_lat: float,
    origin_lng: float,
    roads: list[dict[str, Any]],
    green_polygons: list[dict[str, Any]],
    industries: list[dict[str, Any]],
    elevation_points: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    contexts: list[dict[str, Any]] = []

    buffer_area = math.pi * ANALYSIS_RADIUS_M * ANALYSIS_RADIUS_M

    for cell in cells:
        center_lat = float(cell["center"]["lat"])
        center_lng = float(cell["center"]["lng"])
        center = _project(center_lat, center_lng, origin_lat=origin_lat, origin_lng=origin_lng)

        nearest_road_distance = min(
            (
                _point_to_segment_distance(center, road["start"], road["end"])
                for road in roads
            ),
            default=0.0,
        )
        nearest_industry_distance = min(
            (_distance(center, industry["point"]) for industry in industries),
            default=0.0,
        )

        road_length = 0.0
        road_area_proxy = 0.0
        for road in roads:
            midpoint = ((road["start"][0] + road["end"][0]) / 2, (road["start"][1] + road["end"][1]) / 2)
            if _distance(center, midpoint) <= ANALYSIS_RADIUS_M:
                road_length += road["length"]
                road_area_proxy += road["length"] * ROAD_WIDTHS_M.get(road["category"], 6.0)

        green_area = sum(
            green_polygon["area"]
            for green_polygon in green_polygons
            if _distance(center, green_polygon["centroid"]) <= ANALYSIS_RADIUS_M
        )
        industrial_area = sum(
            400.0
            for industry in industries
            if _distance(center, industry["point"]) <= ANALYSIS_RADIUS_M
        )
        industry_count = sum(
            1
            for industry in industries
            if _distance(center, industry["point"]) <= ANALYSIS_RADIUS_M
        )

        road_density = (road_length / 1_000.0) / (buffer_area / 1_000_000.0)
        green_ratio = min(1.0, green_area / buffer_area)
        impervious_ratio = min(1.0, (road_area_proxy + industrial_area) / buffer_area)
        road_signal = max(0.0, 1.0 - (nearest_road_distance / 5_000.0))
        industry_signal = max(0.0, 1.0 - (nearest_industry_distance / 5_000.0))
        proximity_index = (
            road_signal * 0.45
            + industry_signal * 0.35
            + min(road_density / 4.0, 1.0) * 0.2
        )

        elevation_weights: list[float] = []
        elevation_values: list[float] = []
        for point in elevation_points:
            distance = max(_distance(center, point["centroid"]), 1.0)
            elevation_weights.append(1 / (distance ** 2))
            elevation_values.append(point["value"])

        if elevation_weights:
            weighted_total = sum(
                value * weight for value, weight in zip(elevation_values, elevation_weights)
            )
            mean_elevation = weighted_total / sum(elevation_weights)
            slope_mean = _mean(
                [
                    abs(value - mean_elevation) / max(_distance(center, point["centroid"]), 1.0)
                    for value, point in zip(elevation_values, elevation_points)
                ]
            )
        else:
            mean_elevation = 0.0
            slope_mean = 0.0

        contexts.append(
            {
                "cellId": cell["cellId"],
                "nearestRoadDistanceM": _round(nearest_road_distance, 2),
                "nearestPrimaryRoadM": _round(nearest_road_distance, 2),
                "nearestIndustryDistanceM": _round(nearest_industry_distance, 2),
                "nearestIndustryM": _round(nearest_industry_distance, 2),
                "roadDensity": _round(road_density, 4),
                "greenRatio": _round(green_ratio, 4),
                "imperviousRatio": _round(impervious_ratio, 4),
                "industryCount": industry_count,
                "proximityIndex": _round(proximity_index, 4),
                "meanElevation": _round(mean_elevation, 2),
                "slopeMean": _round(slope_mean, 2),
            }
        )

    return contexts


def _station_monthly_observations(
    dataset: dict[str, Any],
    pollutant: str,
    source_scope: str,
) -> dict[str, tuple[list[dict[str, Any]], float, int]]:
    daily_values, station_lookup = _daily_station_values(dataset, pollutant, source_scope)
    threshold = SCREENING_THRESHOLDS.get(pollutant, float("inf"))
    coverage_start = date.fromisoformat(str(dataset["metadata"]["coverageStart"]))
    coverage_end = date.fromisoformat(str(dataset["metadata"]["coverageEnd"]))
    observations_by_month: dict[str, tuple[list[dict[str, Any]], float, int]] = {}

    for month in _iter_months(coverage_start, coverage_end):
        month_start = date.fromisoformat(f"{month}-01")
        if month_start.month == 12:
            next_month = date(month_start.year + 1, 1, 1)
        else:
            next_month = date(month_start.year, month_start.month + 1, 1)
        month_end = min(
            date.fromordinal(next_month.toordinal() - 1),
            coverage_end,
        )
        month_start = max(month_start, coverage_start)
        observations_by_month[month] = _station_observations_for_range(
            daily_values,
            station_lookup,
            start_date=month_start,
            end_date=month_end,
            threshold=threshold,
        )

    return observations_by_month


def _station_lookup_for_pollutant(
    dataset: dict[str, Any],
    pollutant: str,
    source_scope: str,
) -> dict[str, dict[str, Any]]:
    return {
        station["id"]: station
        for station in dataset.get("stations", [])
        if _station_is_in_scope(station, source_scope)
        and pollutant in (station.get("pollutants") or [])
    }


def _daily_station_values(
    dataset: dict[str, Any],
    pollutant: str,
    source_scope: str,
) -> tuple[dict[str, dict[date, float]], dict[str, dict[str, Any]]]:
    station_lookup = _station_lookup_for_pollutant(dataset, pollutant, source_scope)
    buckets: dict[tuple[str, date], list[float]] = defaultdict(list)

    for record in dataset.get("stationTimeSeries", []):
        if record.get("pollutant") != pollutant:
            continue
        station = station_lookup.get(str(record.get("stationId")))
        if not station:
            continue
        timestamp = _parse_date(str(record.get("timestamp")))
        buckets[(station["id"], timestamp.date())].append(float(record.get("value") or 0.0))

    daily_values: dict[str, dict[date, float]] = defaultdict(dict)
    for (station_id, observation_date), values in buckets.items():
        daily_values[station_id][observation_date] = _mean(values)

    return daily_values, station_lookup


def _station_observations_for_range(
    daily_values: dict[str, dict[date, float]],
    station_lookup: dict[str, dict[str, Any]],
    *,
    start_date: date,
    end_date: date,
    threshold: float,
) -> tuple[list[dict[str, Any]], float, int]:
    calendar_days = max((end_date - start_date).days + 1, 0)
    observations: list[dict[str, Any]] = []
    completeness_values: list[float] = []
    observation_count = 0

    for station_id, station in station_lookup.items():
        values_in_range = [
            value
            for observation_date, value in daily_values.get(station_id, {}).items()
            if start_date <= observation_date <= end_date
        ]
        available_days = len(values_in_range)
        completeness = (available_days / calendar_days) if calendar_days else 0.0
        if available_days == 0:
            continue

        completeness_values.append(completeness)
        observation_count += available_days
        exceedance_days = sum(1 for value in values_in_range if value > threshold)
        observations.append(
            {
                "stationId": station_id,
                "stationName": str(station.get("name") or station_id),
                "lat": float(station["lat"]),
                "lng": float(station["lng"]),
                "value": _mean(values_in_range),
                "exceedanceRatio": exceedance_days / available_days,
                "completeness": completeness,
            }
        )

    observations.sort(key=lambda item: str(item["stationId"]))
    mean_completeness = _mean(completeness_values) if completeness_values else 0.0
    return observations, mean_completeness, observation_count


def _observations_for_range(
    dataset: dict[str, Any],
    pollutant: str,
    source_scope: str,
    start_date: date,
    end_date: date,
) -> tuple[list[dict[str, Any]], float, int]:
    daily_values, station_lookup = _daily_station_values(dataset, pollutant, source_scope)
    threshold = SCREENING_THRESHOLDS.get(pollutant, float("inf"))
    return _station_observations_for_range(
        daily_values,
        station_lookup,
        start_date=start_date,
        end_date=end_date,
        threshold=threshold,
    )


def _idw_value(
    point: tuple[float, float],
    observations: list[dict[str, Any]],
    *,
    origin_lat: float,
    origin_lng: float,
    value_key: str = "value",
) -> float:
    numerator = 0.0
    denominator = 0.0
    projected_point = point

    for observation in observations:
        projected_observation = _project(
            float(observation["lat"]),
            float(observation["lng"]),
            origin_lat=origin_lat,
            origin_lng=origin_lng,
        )
        distance = max(_distance(projected_point, projected_observation), 1.0)
        weight = 1 / (distance**IDW_POWER)
        numerator += float(observation[value_key]) * weight
        denominator += weight

    return numerator / denominator if denominator else 0.0


def _idw_loocv_rmse(
    observations: list[dict[str, Any]],
    *,
    origin_lat: float,
    origin_lng: float,
    value_key: str = "value",
) -> float | None:
    if len(observations) < 2:
        return None

    squared_errors: list[float] = []
    for index, observation in enumerate(observations):
        training = observations[:index] + observations[index + 1 :]
        if not training:
            continue
        point = _project(
            float(observation["lat"]),
            float(observation["lng"]),
            origin_lat=origin_lat,
            origin_lng=origin_lng,
        )
        predicted = _idw_value(
            point,
            training,
            origin_lat=origin_lat,
            origin_lng=origin_lng,
            value_key=value_key,
        )
        squared_errors.append((predicted - float(observation[value_key])) ** 2)

    if not squared_errors:
        return None

    return math.sqrt(sum(squared_errors) / len(squared_errors))


def _variogram_parameters(distance_matrix: list[list[float]], values: list[float]) -> dict[str, float] | None:
    nonzero_distances = sorted(
        distance
        for row in distance_matrix
        for distance in row
        if distance > 0
    )
    if not nonzero_distances:
        return None

    variance = np.var(values, ddof=1) if len(values) > 1 else 0.0
    sill = max(float(variance), 1e-6)
    median_distance = nonzero_distances[len(nonzero_distances) // 2]
    max_distance = max(nonzero_distances)
    range_m = max(1_000.0, min(max_distance, median_distance * 1.75))
    nugget = sill * 0.05
    return {
        "nugget": nugget,
        "sill": sill,
        "range_m": range_m,
    }


def _semivariogram(distance: float, *, nugget: float, sill: float, range_m: float) -> float:
    if distance <= 0:
        return 0.0
    partial_sill = max(sill - nugget, 1e-6)
    return nugget + partial_sill * (1.0 - math.exp(-distance / max(range_m, 1.0)))


def _ordinary_kriging_weights(
    observations: list[dict[str, Any]],
    target_point: tuple[float, float],
    variogram_params: dict[str, float],
) -> np.ndarray | None:
    station_count = len(observations)
    if station_count == 0:
        return None

    kriging_matrix = np.zeros((station_count + 1, station_count + 1), dtype=float)
    for left_index, left in enumerate(observations):
        for right_index, right in enumerate(observations):
            if left_index == right_index:
                continue
            kriging_matrix[left_index, right_index] = _semivariogram(
                _distance(left["projected"], right["projected"]),
                **variogram_params,
            )
        kriging_matrix[left_index, station_count] = 1.0
        kriging_matrix[station_count, left_index] = 1.0

    rhs = np.zeros(station_count + 1, dtype=float)
    for index, observation in enumerate(observations):
        rhs[index] = _semivariogram(
            _distance(observation["projected"], target_point),
            **variogram_params,
        )
    rhs[station_count] = 1.0

    try:
        solution = np.linalg.solve(kriging_matrix, rhs)
    except np.linalg.LinAlgError:
        try:
            solution = np.linalg.lstsq(kriging_matrix, rhs, rcond=None)[0]
        except np.linalg.LinAlgError:
            return None

    return solution[:station_count]


def _ordinary_kriging_predict(
    observations: list[dict[str, Any]],
    target_point: tuple[float, float],
    variogram_params: dict[str, float],
    *,
    value_key: str = "value",
) -> float | None:
    weights = _ordinary_kriging_weights(observations, target_point, variogram_params)
    if weights is None:
        return None

    values = np.asarray([float(observation[value_key]) for observation in observations], dtype=float)
    prediction = float(np.dot(weights, values))
    return prediction


def _kriging_loocv_rmse(
    observations: list[dict[str, Any]],
    variogram_params: dict[str, float],
    *,
    value_key: str = "value",
) -> float | None:
    if len(observations) < 3:
        return None

    squared_errors: list[float] = []
    for index, observation in enumerate(observations):
        training = observations[:index] + observations[index + 1 :]
        if len(training) < 2:
            continue
        prediction = _ordinary_kriging_predict(
            training,
            observation["projected"],
            variogram_params,
            value_key=value_key,
        )
        if prediction is None:
            return None
        squared_errors.append((prediction - float(observation[value_key])) ** 2)

    if not squared_errors:
        return None

    return math.sqrt(sum(squared_errors) / len(squared_errors))


def _kriging_support(
    observations: list[dict[str, Any]],
    *,
    origin_lat: float,
    origin_lng: float,
) -> dict[str, Any]:
    station_count = len({observation["stationId"] for observation in observations})
    if station_count < MIN_KRIGING_OBSERVATIONS:
        return {
            "supported": False,
            "reason": f"Kriging icin en az {MIN_KRIGING_OBSERVATIONS} istasyon gerekir.",
            "variogram": None,
            "idwRmse": None,
            "krigingRmse": None,
        }

    projected_observations = _project_observations(
        observations,
        origin_lat=origin_lat,
        origin_lng=origin_lng,
    )
    distance_matrix = _distance_matrix(projected_observations)
    variogram = _variogram_parameters(
        distance_matrix,
        [float(observation["value"]) for observation in projected_observations],
    )
    if variogram is None:
        return {
            "supported": False,
            "reason": "Kriging variogram parametreleri kurulamadigi icin desteklenmiyor.",
            "variogram": None,
            "idwRmse": None,
            "krigingRmse": None,
        }

    idw_rmse = _idw_loocv_rmse(
        observations,
        origin_lat=origin_lat,
        origin_lng=origin_lng,
    )
    kriging_rmse = _kriging_loocv_rmse(projected_observations, variogram)
    if idw_rmse is None or kriging_rmse is None:
        return {
            "supported": False,
            "reason": "Kriging LOOCV hesaplanamadigi icin desteklenmiyor.",
            "variogram": variogram,
            "idwRmse": _round(idw_rmse, 4),
            "krigingRmse": _round(kriging_rmse, 4),
        }

    if kriging_rmse >= idw_rmse:
        return {
            "supported": False,
            "reason": "Kriging LOOCV hatasi IDW'den dusuk degil.",
            "variogram": variogram,
            "idwRmse": _round(idw_rmse, 4),
            "krigingRmse": _round(kriging_rmse, 4),
        }

    return {
        "supported": True,
        "reason": None,
        "variogram": variogram,
        "idwRmse": _round(idw_rmse, 4),
        "krigingRmse": _round(kriging_rmse, 4),
    }


def _normal_two_tailed_p(z_score: float | None) -> float | None:
    if z_score is None:
        return None
    return math.erfc(abs(z_score) / math.sqrt(2.0))


def _project_observations(
    observations: list[dict[str, Any]],
    *,
    origin_lat: float,
    origin_lng: float,
) -> list[dict[str, Any]]:
    return [
        {
            **observation,
            "projected": _project(
                float(observation["lat"]),
                float(observation["lng"]),
                origin_lat=origin_lat,
                origin_lng=origin_lng,
            ),
        }
        for observation in observations
    ]


def _distance_matrix(observations: list[dict[str, Any]]) -> list[list[float]]:
    matrix: list[list[float]] = []
    for left_index, left in enumerate(observations):
        row: list[float] = []
        for right_index, right in enumerate(observations):
            if left_index == right_index:
                row.append(0.0)
                continue
            row.append(_distance(left["projected"], right["projected"]))
        matrix.append(row)
    return matrix


def _adaptive_neighborhood_radius(distance_matrix: list[list[float]]) -> float | None:
    if len(distance_matrix) < 2:
        return None

    neighbor_rank = min(3, len(distance_matrix) - 1)
    kth_distances: list[float] = []
    for row in distance_matrix:
        neighbor_distances = sorted(distance for distance in row if distance > 0)
        if len(neighbor_distances) < neighbor_rank:
            return None
        kth_distances.append(neighbor_distances[neighbor_rank - 1])

    return max(kth_distances) if kth_distances else None


def _global_moran_from_values(
    values: list[float],
    distance_matrix: list[list[float]],
    neighborhood_radius_m: float,
) -> float | None:
    station_count = len(values)
    if station_count < 2:
        return None

    mean_value = _mean(values)
    deviations = [value - mean_value for value in values]
    denominator = sum(deviation * deviation for deviation in deviations)
    if denominator == 0:
        return 0.0

    numerator = 0.0
    weight_sum = 0.0
    for left_index in range(station_count):
        for right_index in range(station_count):
            if left_index == right_index:
                continue
            if distance_matrix[left_index][right_index] > neighborhood_radius_m:
                continue
            numerator += deviations[left_index] * deviations[right_index]
            weight_sum += 1.0

    if weight_sum == 0:
        return None

    return (station_count / weight_sum) * (numerator / denominator)


def _estimate_global_moran(
    observations: list[dict[str, Any]],
    *,
    label_seed: str,
) -> dict[str, Any]:
    station_count = len(observations)
    if station_count < 6:
        return {
            "neighborhoodRadiusM": None,
            "globalMoranI": None,
            "globalMoranZScore": None,
            "globalMoranPValue": None,
            "hotspots": [],
            "qualityGateFailure": "Moran ve Gi* icin en az 6 olculmus istasyon gerekir.",
        }

    distance_matrix = _distance_matrix(observations)
    neighborhood_radius_m = _adaptive_neighborhood_radius(distance_matrix)
    if neighborhood_radius_m is None:
        return {
            "neighborhoodRadiusM": None,
            "globalMoranI": None,
            "globalMoranZScore": None,
            "globalMoranPValue": None,
            "hotspots": [],
            "qualityGateFailure": "Istasyon komsuluk matrisi kurulamadigi icin Moran hesabi yapilamadi.",
        }

    values = [float(observation["value"]) for observation in observations]
    observed_moran = _global_moran_from_values(values, distance_matrix, neighborhood_radius_m)
    if observed_moran is None:
        return {
            "neighborhoodRadiusM": _round(neighborhood_radius_m, 2),
            "globalMoranI": None,
            "globalMoranZScore": None,
            "globalMoranPValue": None,
            "hotspots": [],
            "qualityGateFailure": "Moran hesabi icin yeterli degiskenlik bulunmuyor.",
        }

    rng = random.Random(label_seed)
    permutation_values = values[:]
    permutations: list[float] = []
    permutation_count = 59

    for _ in range(permutation_count):
        rng.shuffle(permutation_values)
        permutation_moran = _global_moran_from_values(
            permutation_values,
            distance_matrix,
            neighborhood_radius_m,
        )
        if permutation_moran is not None:
            permutations.append(permutation_moran)

    permutation_mean = _mean(permutations) if permutations else 0.0
    permutation_std = _standard_deviation(permutations) if len(permutations) > 1 else 0.0
    moran_z_score = (
        (observed_moran - permutation_mean) / permutation_std
        if permutation_std > 0
        else None
    )
    if permutations:
        extreme_count = sum(
            1
            for value in permutations
            if abs(value) >= abs(observed_moran)
        )
        moran_p_value = (extreme_count + 1) / (len(permutations) + 1)
    else:
        moran_p_value = None

    hotspots = _local_getis_ord_hotspots(
        observations,
        distance_matrix,
        neighborhood_radius_m,
    )
    return {
        "neighborhoodRadiusM": _round(neighborhood_radius_m, 2),
        "globalMoranI": _round(observed_moran, 4),
        "globalMoranZScore": _round(moran_z_score, 4),
        "globalMoranPValue": _round(moran_p_value, 4),
        "hotspots": hotspots,
        "qualityGateFailure": None,
    }


def _hotspot_classification(z_score: float) -> str:
    if z_score >= 2.58:
        return "hotspot-99"
    if z_score >= 1.96:
        return "hotspot-95"
    if z_score >= 1.65:
        return "hotspot-90"
    if z_score <= -2.58:
        return "coldspot-99"
    if z_score <= -1.96:
        return "coldspot-95"
    if z_score <= -1.65:
        return "coldspot-90"
    return "not-significant"


def _local_getis_ord_hotspots(
    observations: list[dict[str, Any]],
    distance_matrix: list[list[float]],
    neighborhood_radius_m: float,
) -> list[dict[str, Any]]:
    station_count = len(observations)
    values = [float(observation["value"]) for observation in observations]
    mean_value = _mean(values)
    std_value = _standard_deviation(values)
    if station_count < 2 or std_value == 0:
        return []

    hotspots: list[dict[str, Any]] = []
    for index, observation in enumerate(observations):
        weights = [
            1.0 if index == neighbor_index or distance_matrix[index][neighbor_index] <= neighborhood_radius_m else 0.0
            for neighbor_index in range(station_count)
        ]
        sum_weights = sum(weights)
        sum_squared_weights = sum(weight * weight for weight in weights)
        denominator_root = (
            (station_count * sum_squared_weights - (sum_weights * sum_weights))
            / max(station_count - 1, 1)
        )
        denominator = std_value * math.sqrt(max(denominator_root, 0.0))
        if denominator == 0:
            z_score = 0.0
        else:
            weighted_sum = sum(weight * value for weight, value in zip(weights, values))
            numerator = weighted_sum - (mean_value * sum_weights)
            z_score = numerator / denominator

        p_value = _normal_two_tailed_p(z_score)
        classification = _hotspot_classification(z_score)
        hotspots.append(
            {
                "stationId": observation["stationId"],
                "stationName": observation.get("stationName") or observation["stationId"],
                "lat": _round(float(observation["lat"]), 6),
                "lng": _round(float(observation["lng"]), 6),
                "value": _round(float(observation["value"]), 2),
                "zScore": _round(z_score, 4),
                "pValue": _round(p_value, 4),
                "significance": _round(max(0.0, 1.0 - (p_value or 1.0)), 4),
                "classification": classification,
            }
        )

    hotspots.sort(
        key=lambda item: (
            abs(float(item["zScore"] or 0.0)),
            float(item["value"] or 0.0),
            str(item["stationId"]),
        ),
        reverse=True,
    )
    return hotspots


def _risk_label(score: float) -> str:
    if score >= 0.75:
        return "Cok yuksek"
    if score >= 0.55:
        return "Yuksek"
    if score >= 0.35:
        return "Orta"
    return "Dusuk"


def _normalize_series(value_map: dict[str, float], *, invert: bool = False) -> dict[str, float]:
    if not value_map:
        return {}

    minimum = min(value_map.values())
    maximum = max(value_map.values())
    if math.isclose(minimum, maximum):
        return {key: 0.0 for key in value_map}

    normalized = {
        key: (value - minimum) / (maximum - minimum)
        for key, value in value_map.items()
    }
    if invert:
        return {key: 1.0 - value for key, value in normalized.items()}
    return normalized


def _hotspot_component_by_cell(
    cells: list[dict[str, Any]],
    hotspots: list[dict[str, Any]],
    *,
    origin_lat: float,
    origin_lng: float,
    neighborhood_radius_m: float | None,
) -> dict[str, float]:
    positive_hotspots = [
        {
            **hotspot,
            "projected": _project(
                float(hotspot["lat"]),
                float(hotspot["lng"]),
                origin_lat=origin_lat,
                origin_lng=origin_lng,
            ),
            "strength": max(0.0, min(float(hotspot["zScore"]) / 2.58, 1.0)),
        }
        for hotspot in hotspots
        if float(hotspot.get("zScore") or 0.0) > 0
    ]
    if not positive_hotspots:
        return {cell["cellId"]: 0.0 for cell in cells}

    influence_radius_m = max(neighborhood_radius_m or 0.0, 10_000.0)
    scores: dict[str, float] = {}
    for cell in cells:
        center_projected = cell.get("centerProjected") or {}
        center = (
            float(center_projected.get("x", 0.0)),
            float(center_projected.get("y", 0.0)),
        )
        numerator = 0.0
        denominator = 0.0
        for hotspot in positive_hotspots:
            distance = max(_distance(center, hotspot["projected"]), 1.0)
            if distance > influence_radius_m:
                continue
            weight = 1 / (distance ** 2)
            numerator += float(hotspot["strength"]) * weight
            denominator += weight
        scores[cell["cellId"]] = numerator / denominator if denominator else 0.0

    return scores


def _risk_overlay_slice(
    *,
    cells: list[dict[str, Any]],
    cell_context_lookup: dict[str, dict[str, Any]],
    surface_slice: dict[str, Any],
    stats_slice: dict[str, Any],
    pollutant: str,
    origin_lat: float,
    origin_lng: float,
) -> dict[str, Any]:
    if surface_slice["status"] != "ok":
        return {
            "label": surface_slice["label"],
            "sliceKind": surface_slice["sliceKind"],
            "status": surface_slice["status"],
            "stationCount": surface_slice["stationCount"],
            "observationCount": surface_slice["observationCount"],
            "meanStationCompleteness": surface_slice.get("meanStationCompleteness"),
            "qualityGateFailure": surface_slice.get("qualityGateFailure"),
            "cells": [],
            "topCells": [],
        }

    threshold = SCREENING_THRESHOLDS.get(pollutant, 1.0)
    pollution_component_by_cell = {}
    surface_values = surface_slice.get("surfaceValues") or []
    for cell, value in zip(cells, surface_values):
        pollution_component_by_cell[cell["cellId"]] = min(
            max(float(value) / max(threshold * 1.5, 1.0), 0.0),
            1.0,
        )

    context_by_cell = {
        cell_id: cell_context_lookup[cell_id]
        for cell_id in pollution_component_by_cell
        if cell_id in cell_context_lookup
    }
    green_deficit_by_cell = {
        cell_id: 1.0 - min(max(float(context.get("greenRatio") or 0.0), 0.0), 1.0)
        for cell_id, context in context_by_cell.items()
    }
    slope_inverse_by_cell = _normalize_series(
        {
            cell_id: float(context.get("slopeMean") or 0.0)
            for cell_id, context in context_by_cell.items()
        },
        invert=True,
    )
    elevation_inverse_by_cell = _normalize_series(
        {
            cell_id: float(context.get("meanElevation") or 0.0)
            for cell_id, context in context_by_cell.items()
        },
        invert=True,
    )
    topo_component_by_cell = {
        cell_id: (slope_inverse_by_cell.get(cell_id, 0.0) * 0.6)
        + (elevation_inverse_by_cell.get(cell_id, 0.0) * 0.4)
        for cell_id in pollution_component_by_cell
    }

    hotspot_component_lookup = _hotspot_component_by_cell(
        cells,
        stats_slice.get("hotspots") or [],
        origin_lat=origin_lat,
        origin_lng=origin_lng,
        neighborhood_radius_m=stats_slice.get("neighborhoodRadiusM"),
    )

    overlay_cells: list[dict[str, Any]] = []
    for cell in cells:
        cell_id = cell["cellId"]
        context = cell_context_lookup.get(cell_id, {})
        pollution_component = pollution_component_by_cell.get(cell_id, 0.0)
        hotspot_component = hotspot_component_lookup.get(cell_id, 0.0)
        proximity_component = min(max(float(context.get("proximityIndex") or 0.0), 0.0), 1.0)
        green_deficit = green_deficit_by_cell.get(cell_id, 0.0)
        topo_component = topo_component_by_cell.get(cell_id, 0.0)
        score = (
            pollution_component * 0.40
            + hotspot_component * 0.20
            + proximity_component * 0.20
            + green_deficit * 0.10
            + topo_component * 0.10
        )
        overlay_cells.append(
            {
                "cellId": cell_id,
                "score": _round(score, 4),
                "label": _risk_label(score),
                "pollutionComponent": _round(pollution_component, 4),
                "hotspotComponent": _round(hotspot_component, 4),
                "proximityComponent": _round(proximity_component, 4),
                "greenDeficit": _round(green_deficit, 4),
                "topographicCompression": _round(topo_component, 4),
            }
        )

    overlay_cells.sort(
        key=lambda item: (float(item["score"] or 0.0), str(item["cellId"])),
        reverse=True,
    )
    return {
        "label": surface_slice["label"],
        "sliceKind": surface_slice["sliceKind"],
        "status": "ok",
        "stationCount": surface_slice["stationCount"],
        "observationCount": surface_slice["observationCount"],
        "meanStationCompleteness": surface_slice.get("meanStationCompleteness"),
        "cells": overlay_cells,
        "topCells": overlay_cells[:8],
    }


def _surface_slice(
    *,
    cells: list[dict[str, Any]],
    observations: list[dict[str, Any]],
    origin_lat: float,
    origin_lng: float,
    label: str,
    slice_kind: str,
    mean_station_completeness: float,
    observation_count: int,
    minimum_observations: int = MIN_IDW_OBSERVATIONS,
) -> dict[str, Any]:
    station_count = len({observation["stationId"] for observation in observations})

    if station_count < minimum_observations:
        return {
            "label": label,
            "sliceKind": slice_kind,
            "status": "insufficient-observations",
            "stationCount": station_count,
            "observationCount": observation_count,
            "meanStationCompleteness": _round(mean_station_completeness, 4),
            "surfaceValues": None,
            "surfaceExceedanceRatios": None,
            "qualityGateFailure": f"En az {minimum_observations} olculmus istasyon gerekir.",
            "statistics": {
                "mean": None,
                "min": None,
                "max": None,
                "median": None,
                "standardDeviation": None,
            },
            "topCells": [],
        }

    if mean_station_completeness < MIN_BUCKET_COMPLETENESS:
        return {
            "label": label,
            "sliceKind": slice_kind,
            "status": "insufficient-completeness",
            "stationCount": station_count,
            "observationCount": observation_count,
            "meanStationCompleteness": _round(mean_station_completeness, 4),
            "surfaceValues": None,
            "surfaceExceedanceRatios": None,
            "qualityGateFailure": (
                f"Bucket butunlugu en az %{int(MIN_BUCKET_COMPLETENESS * 100)} olmalidir."
            ),
            "statistics": {
                "mean": None,
                "min": None,
                "max": None,
                "median": None,
                "standardDeviation": None,
            },
            "topCells": [],
        }

    kriging_support = _kriging_support(
        observations,
        origin_lat=origin_lat,
        origin_lng=origin_lng,
    )
    projected_observations = _project_observations(
        observations,
        origin_lat=origin_lat,
        origin_lng=origin_lng,
    )
    surface_values: list[float] = []
    surface_exceedance_ratios: list[float] = []
    kriging_surface_values: list[float] | None = [] if kriging_support["supported"] else None
    kriging_surface_exceedance_ratios: list[float] | None = [] if kriging_support["supported"] else None
    for cell in cells:
        center_projected = cell.get("centerProjected") or {}
        center = (
            float(center_projected.get("x", 0.0)),
            float(center_projected.get("y", 0.0)),
        )
        surface_values.append(
            _round(_idw_value(center, observations, origin_lat=origin_lat, origin_lng=origin_lng), 2)
            or 0.0
        )
        surface_exceedance_ratios.append(
            _round(
                _idw_value(
                    center,
                    observations,
                    origin_lat=origin_lat,
                    origin_lng=origin_lng,
                    value_key="exceedanceRatio",
                ),
                4,
            )
            or 0.0
        )
        if kriging_surface_values is not None and kriging_surface_exceedance_ratios is not None:
            kriging_value = _ordinary_kriging_predict(
                projected_observations,
                center,
                kriging_support["variogram"],
            )
            kriging_exceedance = _ordinary_kriging_predict(
                projected_observations,
                center,
                kriging_support["variogram"],
                value_key="exceedanceRatio",
            )
            if kriging_value is None or kriging_exceedance is None:
                kriging_surface_values = None
                kriging_surface_exceedance_ratios = None
                kriging_support["supported"] = False
                kriging_support["reason"] = "Kriging yuzeyi sayisal olarak stabil cozulmedi."
            else:
                kriging_surface_values.append(_round(kriging_value, 2) or 0.0)
                kriging_surface_exceedance_ratios.append(_round(kriging_exceedance, 4) or 0.0)

    cell_values = list(zip((cell["cellId"] for cell in cells), surface_values))
    ordered = sorted(cell_values, key=lambda item: item[1], reverse=True)

    return {
        "label": label,
        "sliceKind": slice_kind,
        "status": "ok",
        "stationCount": station_count,
        "observationCount": observation_count,
        "meanStationCompleteness": _round(mean_station_completeness, 4),
        "surfaceValues": surface_values,
        "surfaceExceedanceRatios": surface_exceedance_ratios,
        "krigingSurfaceValues": kriging_surface_values,
        "krigingSurfaceExceedanceRatios": kriging_surface_exceedance_ratios,
        "krigingUnavailableReason": kriging_support["reason"],
        "idwRmse": kriging_support["idwRmse"],
        "krigingRmse": kriging_support["krigingRmse"],
        "statistics": {
            "mean": _round(_mean(surface_values), 2),
            "min": _round(min(surface_values), 2),
            "max": _round(max(surface_values), 2),
            "median": _round(_median(surface_values), 2),
            "standardDeviation": _round(_standard_deviation(surface_values), 2),
        },
        "topCells": [
            {
                "cellId": cell_id,
                "value": _round(value, 2),
            }
            for cell_id, value in ordered[:5]
        ],
    }


def _event_slices(
    *,
    dataset: dict[str, Any],
    cells: list[dict[str, Any]],
    pollutant: str,
    source_scope: str,
    origin_lat: float,
    origin_lng: float,
    start_date: date,
    end_date: date,
) -> list[dict[str, Any]]:
    slices: list[dict[str, Any]] = []

    for event in sorted(
        dataset.get("events", []),
        key=lambda item: (str(item.get("startDate") or ""), str(item.get("eventId") or "")),
    ):
        event_start = _parse_date(str(event["startDate"])).date()
        event_end = _parse_date(str(event["endDate"])).date()

        if event_end < start_date or event_start > end_date:
            continue

        observations, mean_station_completeness, observation_count = _observations_for_range(
            dataset,
            pollutant,
            source_scope,
            max(event_start, start_date),
            min(event_end, end_date),
        )

        slice_data = _surface_slice(
            cells=cells,
            observations=observations,
            origin_lat=origin_lat,
            origin_lng=origin_lng,
            label=event["eventId"],
            slice_kind="event",
            mean_station_completeness=mean_station_completeness,
            observation_count=observation_count,
        )
        slice_data.update(
            {
                "eventId": event["eventId"],
                "eventName": event["name"],
                "eventType": event["eventType"],
                "analysisMode": event.get("analysisMode"),
                "startDate": event["startDate"],
                "endDate": event["endDate"],
                "monthsCovered": [
                    month
                    for month in _iter_months(event_start, event_end)
                    if start_date <= date.fromisoformat(f"{month}-01") <= end_date
                ],
            }
        )
        slices.append(slice_data)

    return slices


def _monthly_slices(
    *,
    dataset: dict[str, Any],
    cells: list[dict[str, Any]],
    pollutant: str,
    source_scope: str,
    origin_lat: float,
    origin_lng: float,
) -> list[dict[str, Any]]:
    observations_by_month = _station_monthly_observations(dataset, pollutant, source_scope)
    coverage_start = date.fromisoformat(str(dataset["metadata"]["coverageStart"]))
    coverage_end = date.fromisoformat(str(dataset["metadata"]["coverageEnd"]))

    slices: list[dict[str, Any]] = []
    for month in _iter_months(coverage_start, coverage_end):
        observations, mean_station_completeness, observation_count = observations_by_month.get(
            month,
            ([], 0.0, 0),
        )
        slice_data = _surface_slice(
            cells=cells,
            observations=observations,
            origin_lat=origin_lat,
            origin_lng=origin_lng,
            label=month,
            slice_kind="month",
            mean_station_completeness=mean_station_completeness,
            observation_count=observation_count,
        )
        slice_data["month"] = month
        slices.append(slice_data)

    return slices


def _spatial_stats_slice(
    *,
    observations: list[dict[str, Any]],
    origin_lat: float,
    origin_lng: float,
    label: str,
    slice_kind: str,
    mean_station_completeness: float,
    observation_count: int,
) -> dict[str, Any]:
    station_count = len({observation["stationId"] for observation in observations})

    if station_count < 6:
        return {
            "label": label,
            "sliceKind": slice_kind,
            "status": "insufficient-observations",
            "stationCount": station_count,
            "observationCount": observation_count,
            "meanStationCompleteness": _round(mean_station_completeness, 4),
            "globalMoranI": None,
            "globalMoranZScore": None,
            "globalMoranPValue": None,
            "neighborhoodRadiusM": None,
            "hotspots": [],
            "qualityGateFailure": "Moran ve Gi* icin en az 6 olculmus istasyon gerekir.",
        }

    if mean_station_completeness < MIN_BUCKET_COMPLETENESS:
        return {
            "label": label,
            "sliceKind": slice_kind,
            "status": "insufficient-completeness",
            "stationCount": station_count,
            "observationCount": observation_count,
            "meanStationCompleteness": _round(mean_station_completeness, 4),
            "globalMoranI": None,
            "globalMoranZScore": None,
            "globalMoranPValue": None,
            "neighborhoodRadiusM": None,
            "hotspots": [],
            "qualityGateFailure": (
                f"Bucket butunlugu en az %{int(MIN_BUCKET_COMPLETENESS * 100)} olmalidir."
            ),
        }

    projected_observations = _project_observations(
        observations,
        origin_lat=origin_lat,
        origin_lng=origin_lng,
    )
    estimate = _estimate_global_moran(projected_observations, label_seed=label)
    status = "ok" if not estimate["qualityGateFailure"] else "insufficient-observations"
    return {
        "label": label,
        "sliceKind": slice_kind,
        "status": status,
        "stationCount": station_count,
        "observationCount": observation_count,
        "meanStationCompleteness": _round(mean_station_completeness, 4),
        "globalMoranI": estimate["globalMoranI"],
        "globalMoranZScore": estimate["globalMoranZScore"],
        "globalMoranPValue": estimate["globalMoranPValue"],
        "neighborhoodRadiusM": estimate["neighborhoodRadiusM"],
        "hotspots": estimate["hotspots"],
        "qualityGateFailure": estimate["qualityGateFailure"],
    }


def _event_stats_slices(
    *,
    dataset: dict[str, Any],
    pollutant: str,
    source_scope: str,
    origin_lat: float,
    origin_lng: float,
    start_date: date,
    end_date: date,
) -> list[dict[str, Any]]:
    slices: list[dict[str, Any]] = []

    for event in sorted(
        dataset.get("events", []),
        key=lambda item: (str(item.get("startDate") or ""), str(item.get("eventId") or "")),
    ):
        event_start = _parse_date(str(event["startDate"])).date()
        event_end = _parse_date(str(event["endDate"])).date()

        if event_end < start_date or event_start > end_date:
            continue

        observations, mean_station_completeness, observation_count = _observations_for_range(
            dataset,
            pollutant,
            source_scope,
            max(event_start, start_date),
            min(event_end, end_date),
        )
        slice_data = _spatial_stats_slice(
            observations=observations,
            origin_lat=origin_lat,
            origin_lng=origin_lng,
            label=event["eventId"],
            slice_kind="event",
            mean_station_completeness=mean_station_completeness,
            observation_count=observation_count,
        )
        slice_data.update(
            {
                "eventId": event["eventId"],
                "eventName": event["name"],
                "eventType": event["eventType"],
                "analysisMode": event.get("analysisMode"),
                "startDate": event["startDate"],
                "endDate": event["endDate"],
                "monthsCovered": [
                    month
                    for month in _iter_months(event_start, event_end)
                    if start_date <= date.fromisoformat(f"{month}-01") <= end_date
                ],
            }
        )
        slices.append(slice_data)

    return slices


def _monthly_stats_slices(
    *,
    dataset: dict[str, Any],
    pollutant: str,
    source_scope: str,
    origin_lat: float,
    origin_lng: float,
) -> list[dict[str, Any]]:
    observations_by_month = _station_monthly_observations(dataset, pollutant, source_scope)
    coverage_start = date.fromisoformat(str(dataset["metadata"]["coverageStart"]))
    coverage_end = date.fromisoformat(str(dataset["metadata"]["coverageEnd"]))
    slices: list[dict[str, Any]] = []

    for month in _iter_months(coverage_start, coverage_end):
        observations, mean_station_completeness, observation_count = observations_by_month.get(
            month,
            ([], 0.0, 0),
        )
        slice_data = _spatial_stats_slice(
            observations=observations,
            origin_lat=origin_lat,
            origin_lng=origin_lng,
            label=month,
            slice_kind="month",
            mean_station_completeness=mean_station_completeness,
            observation_count=observation_count,
        )
        slice_data["month"] = month
        slices.append(slice_data)

    return slices


def _risk_overlay_slices(
    *,
    cells: list[dict[str, Any]],
    cell_context_lookup: dict[str, dict[str, Any]],
    surface_slices: list[dict[str, Any]],
    stats_slices: list[dict[str, Any]],
    pollutant: str,
    origin_lat: float,
    origin_lng: float,
) -> list[dict[str, Any]]:
    stats_by_label = {
        (slice_["sliceKind"], slice_["label"]): slice_
        for slice_ in stats_slices
    }
    overlays: list[dict[str, Any]] = []

    for surface_slice in surface_slices:
        stats_slice = stats_by_label.get((surface_slice["sliceKind"], surface_slice["label"]))
        if not stats_slice:
            stats_slice = {
                "status": "insufficient-observations",
                "hotspots": [],
                "neighborhoodRadiusM": None,
            }
        overlay = _risk_overlay_slice(
            cells=cells,
            cell_context_lookup=cell_context_lookup,
            surface_slice=surface_slice,
            stats_slice=stats_slice,
            pollutant=pollutant,
            origin_lat=origin_lat,
            origin_lng=origin_lng,
        )
        for key in (
            "month",
            "eventId",
            "eventName",
            "eventType",
            "analysisMode",
            "startDate",
            "endDate",
            "monthsCovered",
        ):
            if key in surface_slice:
                overlay[key] = surface_slice[key]
        overlays.append(overlay)

    return overlays


def _slice_date_window(slice_data: dict[str, Any]) -> tuple[date, date]:
    if slice_data.get("sliceKind") == "month" and slice_data.get("month"):
        year, month = map(int, str(slice_data["month"]).split("-"))
        start = date(year, month, 1)
        if month == 12:
            end = date(year + 1, 1, 1)
        else:
            end = date(year, month + 1, 1)
        return start, date.fromordinal(end.toordinal() - 1)

    return (
        _parse_date(str(slice_data["startDate"])).date(),
        _parse_date(str(slice_data["endDate"])).date(),
    )


def _mean_scope_wind_direction(
    dataset: dict[str, Any],
    source_scope: str,
    start_date: date,
    end_date: date,
) -> float | None:
    scoped_station_ids = {
        str(station["id"])
        for station in dataset.get("stations", [])
        if _station_is_in_scope(station, source_scope)
    }
    if not scoped_station_ids:
        return None

    sin_sum = 0.0
    cos_sum = 0.0
    sample_count = 0

    for record in dataset.get("meteoTimeSeries", []):
        station_id = str(record.get("stationIdOrGridId") or "")
        if station_id not in scoped_station_ids:
            continue
        timestamp = str(record.get("timestamp") or "")
        if not timestamp:
            continue
        observed_date = _parse_date(timestamp).date()
        if observed_date < start_date or observed_date > end_date:
            continue

        wind_direction = record.get("windDirDeg")
        if wind_direction is None:
            continue

        angle = math.radians(float(wind_direction))
        sin_sum += math.sin(angle)
        cos_sum += math.cos(angle)
        sample_count += 1

    if sample_count == 0:
        return None

    mean_angle = math.degrees(math.atan2(sin_sum, cos_sum))
    return (mean_angle + 360.0) % 360.0


def _bearing_degrees(
    from_lat: float,
    from_lng: float,
    to_lat: float,
    to_lng: float,
) -> float:
    lat1 = math.radians(from_lat)
    lat2 = math.radians(to_lat)
    delta_lng = math.radians(to_lng - from_lng)
    x = math.sin(delta_lng) * math.cos(lat2)
    y = (
        math.cos(lat1) * math.sin(lat2)
        - math.sin(lat1) * math.cos(lat2) * math.cos(delta_lng)
    )
    return (math.degrees(math.atan2(x, y)) + 360.0) % 360.0


def _wind_alignment_score(
    *,
    industry_lat: float,
    industry_lng: float,
    target_lat: float,
    target_lng: float,
    prevailing_wind_from_deg: float | None,
) -> float:
    if prevailing_wind_from_deg is None:
        return 0.0

    wind_to_deg = (prevailing_wind_from_deg + 180.0) % 360.0
    industry_bearing = _bearing_degrees(industry_lat, industry_lng, target_lat, target_lng)
    delta = abs(((industry_bearing - wind_to_deg + 180.0) % 360.0) - 180.0)
    return max(0.0, math.cos(math.radians(delta)))


def _fit_standardized_regression(
    rows: list[dict[str, float]],
    predictors: tuple[str, ...],
) -> tuple[dict[str, float], float | None]:
    if len(rows) < 4:
        return {predictor: 0.0 for predictor in predictors}, None

    x_matrix = np.asarray(
        [[float(row[predictor]) for predictor in predictors] for row in rows],
        dtype=float,
    )
    y_vector = np.asarray([float(row["target"]) for row in rows], dtype=float)

    y_std = float(np.std(y_vector))
    if y_std <= 1e-9:
        return {predictor: 0.0 for predictor in predictors}, None

    x_means = np.mean(x_matrix, axis=0)
    x_stds = np.std(x_matrix, axis=0)
    active_columns = [index for index, std in enumerate(x_stds) if std > 1e-9]
    if not active_columns:
        return {predictor: 0.0 for predictor in predictors}, None

    x_standardized = (x_matrix[:, active_columns] - x_means[active_columns]) / x_stds[active_columns]
    y_standardized = (y_vector - float(np.mean(y_vector))) / y_std

    coefficients, _, _, _ = np.linalg.lstsq(x_standardized, y_standardized, rcond=None)
    fitted = x_standardized @ coefficients
    total_sum_squares = float(np.sum((y_standardized - float(np.mean(y_standardized))) ** 2))
    residual_sum_squares = float(np.sum((y_standardized - fitted) ** 2))
    model_score = (
        1.0 - (residual_sum_squares / total_sum_squares)
        if total_sum_squares > 1e-9
        else None
    )

    full_coefficients = {predictor: 0.0 for predictor in predictors}
    for active_index, predictor_index in enumerate(active_columns):
        full_coefficients[predictors[predictor_index]] = float(coefficients[active_index])

    return full_coefficients, model_score


def _source_summary_slice(
    *,
    cells: list[dict[str, Any]],
    cell_context_lookup: dict[str, dict[str, Any]],
    dataset: dict[str, Any],
    source_scope: str,
    surface_slice: dict[str, Any],
    origin_lat: float,
    origin_lng: float,
) -> dict[str, Any]:
    if surface_slice["status"] != "ok":
        return {
            "label": surface_slice["label"],
            "sliceKind": surface_slice["sliceKind"],
            "status": surface_slice["status"],
            "stationCount": surface_slice["stationCount"],
            "observationCount": surface_slice["observationCount"],
            "meanStationCompleteness": surface_slice.get("meanStationCompleteness"),
            "qualityGateFailure": surface_slice.get("qualityGateFailure"),
            "sampleCount": 0,
            "modelScore": None,
            "prevailingWindDirection": None,
            "coefficients": [],
        }

    start_date, end_date = _slice_date_window(surface_slice)
    prevailing_wind_direction = _mean_scope_wind_direction(
        dataset,
        source_scope,
        start_date,
        end_date,
    )
    projected_industries = [
        {
            "lat": float(industry["lat"]),
            "lng": float(industry["lng"]),
            "projected": _project(
                float(industry["lat"]),
                float(industry["lng"]),
                origin_lat=origin_lat,
                origin_lng=origin_lng,
            ),
        }
        for industry in dataset.get("industries", [])
        if industry.get("lat") is not None and industry.get("lng") is not None
    ]

    rows: list[dict[str, float]] = []
    for cell, target_value in zip(cells, surface_slice.get("surfaceValues") or []):
        cell_id = cell["cellId"]
        context = cell_context_lookup.get(cell_id)
        if context is None:
            continue

        center = cell.get("center") or {}
        lat = float(center.get("lat") or 0.0)
        lng = float(center.get("lng") or 0.0)
        center_projected = cell.get("centerProjected") or {}
        projected_center = (
            float(center_projected.get("x", 0.0)),
            float(center_projected.get("y", 0.0)),
        )

        nearest_industry_distance = float(context.get("nearestIndustryM") or 0.0)
        nearest_industry = None
        if projected_industries:
            nearest_industry = min(
                projected_industries,
                key=lambda industry: _distance(projected_center, industry["projected"]),
            )
            nearest_industry_distance = _distance(
                projected_center,
                nearest_industry["projected"],
            )

        wind_alignment = 0.0
        if (
            nearest_industry is not None
            and nearest_industry_distance <= MAX_INDUSTRY_INFLUENCE_DISTANCE_M
        ):
            wind_alignment = _wind_alignment_score(
                industry_lat=float(nearest_industry["lat"]),
                industry_lng=float(nearest_industry["lng"]),
                target_lat=lat,
                target_lng=lng,
                prevailing_wind_from_deg=prevailing_wind_direction,
            )

        industry_proximity = max(0.0, 1.0 - (nearest_industry_distance / 5_000.0))
        rows.append(
            {
                "target": float(target_value),
                "roadDensity": float(context.get("roadDensity") or 0.0),
                "industryProximity": industry_proximity,
                "greenRatio": float(context.get("greenRatio") or 0.0),
                "imperviousRatio": float(context.get("imperviousRatio") or 0.0),
                "meanElevation": float(context.get("meanElevation") or 0.0),
                "slopeMean": float(context.get("slopeMean") or 0.0),
                "windAlignment": wind_alignment,
            }
        )

    coefficients, model_score = _fit_standardized_regression(rows, SOURCE_DRIVER_KEYS)
    coefficient_rows = [
        {
            "key": key,
            "label": SOURCE_DRIVER_LABELS[key],
            "coefficient": _round(coefficients.get(key), 4) or 0.0,
        }
        for key in SOURCE_DRIVER_KEYS
    ]
    coefficient_rows.sort(
        key=lambda item: abs(float(item["coefficient"])),
        reverse=True,
    )

    return {
        "label": surface_slice["label"],
        "sliceKind": surface_slice["sliceKind"],
        "status": "ok",
        "stationCount": surface_slice["stationCount"],
        "observationCount": surface_slice["observationCount"],
        "meanStationCompleteness": surface_slice.get("meanStationCompleteness"),
        "sampleCount": len(rows),
        "modelScore": _round(model_score, 4),
        "prevailingWindDirection": _round(prevailing_wind_direction, 2),
        "coefficients": coefficient_rows,
    }


def _source_summary_slices(
    *,
    cells: list[dict[str, Any]],
    cell_context_lookup: dict[str, dict[str, Any]],
    surface_slices: list[dict[str, Any]],
    dataset: dict[str, Any],
    source_scope: str,
    origin_lat: float,
    origin_lng: float,
) -> list[dict[str, Any]]:
    summaries: list[dict[str, Any]] = []
    for surface_slice in surface_slices:
        summary = _source_summary_slice(
            cells=cells,
            cell_context_lookup=cell_context_lookup,
            dataset=dataset,
            source_scope=source_scope,
            surface_slice=surface_slice,
            origin_lat=origin_lat,
            origin_lng=origin_lng,
        )
        for key in (
            "month",
            "eventId",
            "eventName",
            "eventType",
            "analysisMode",
            "startDate",
            "endDate",
            "monthsCovered",
        ):
            if key in surface_slice:
                summary[key] = surface_slice[key]
        summaries.append(summary)

    return summaries


def _daily_network_series(
    dataset: dict[str, Any],
    pollutant: str,
    source_scope: str,
) -> dict[str, Any]:
    daily_values, station_lookup = _daily_station_values(dataset, pollutant, source_scope)
    coverage_start = date.fromisoformat(str(dataset["metadata"]["coverageStart"]))
    coverage_end = date.fromisoformat(str(dataset["metadata"]["coverageEnd"]))
    observed: dict[date, float] = {}

    current = coverage_start
    while current <= coverage_end:
        values = [
            station_series[current]
            for station_series in daily_values.values()
            if current in station_series
        ]
        if len(values) >= 2:
            observed[current] = _mean(values)
        current = date.fromordinal(current.toordinal() + 1)

    total_days = max((coverage_end - coverage_start).days + 1, 0)
    observed_ratio = (len(observed) / total_days) if total_days else 0.0
    return {
        "coverageStart": coverage_start,
        "coverageEnd": coverage_end,
        "observedRatio": observed_ratio,
        "stationCount": len(station_lookup),
        "observed": observed,
    }


def _filled_series(network_series: dict[str, Any]) -> tuple[list[date], list[float], float]:
    coverage_start: date = network_series["coverageStart"]
    coverage_end: date = network_series["coverageEnd"]
    observed: dict[date, float] = network_series["observed"]
    dates: list[date] = []
    raw_values: list[float] = []
    current = coverage_start

    while current <= coverage_end:
        dates.append(current)
        raw_values.append(float(observed[current]) if current in observed else math.nan)
        current = date.fromordinal(current.toordinal() + 1)

    values = np.asarray(raw_values, dtype=float)
    missing = np.isnan(values)
    if missing.all():
        return dates, [], 0.0

    known_indices = np.flatnonzero(~missing)
    interpolated = np.interp(np.arange(len(values)), known_indices, values[known_indices])
    return dates, interpolated.tolist(), network_series["observedRatio"]


def _seasonal_naive_forecast(series: list[float], horizon: int, seasonal_period: int = 7) -> list[float]:
    if not series:
        return []
    tail = series[-seasonal_period:] if len(series) >= seasonal_period else series[:]
    predictions: list[float] = []
    for step in range(horizon):
        predictions.append(float(tail[step % len(tail)]))
    return predictions


def _damped_trend_forecast(
    series: list[float],
    horizon: int,
    *,
    lookback: int = 28,
    damping: float = 0.82,
) -> list[float]:
    if not series:
        return []

    training = series[-min(len(series), lookback) :]
    if len(training) < 2:
        return [float(series[-1])] * horizon

    x = np.arange(len(training), dtype=float)
    y = np.asarray(training, dtype=float)
    slope, intercept = np.polyfit(x, y, 1)
    last_value = float(y[-1])
    predictions: list[float] = []
    for step in range(1, horizon + 1):
        damped_multiplier = (1.0 - (damping**step)) / max(1.0 - damping, 1e-6)
        predictions.append(last_value + float(slope) * damped_multiplier)
    return predictions


def _ensemble_forecast(series: list[float], horizon: int) -> list[float]:
    seasonal = _seasonal_naive_forecast(series, horizon)
    damped = _damped_trend_forecast(series, horizon)
    return [
        (seasonal_value + damped_value) / 2.0
        for seasonal_value, damped_value in zip(seasonal, damped)
    ]


def _forecast_metrics(actual: list[float], predicted: list[float]) -> tuple[float | None, float | None]:
    if not actual or not predicted or len(actual) != len(predicted):
        return None, None

    errors = [pred - obs for pred, obs in zip(predicted, actual)]
    mae = sum(abs(error) for error in errors) / len(errors)
    rmse = math.sqrt(sum(error * error for error in errors) / len(errors))
    return mae, rmse


def _forecast_slice(
    *,
    dataset: dict[str, Any],
    pollutant: str,
    source_scope: str,
    generated_at: str,
    horizon_days: int,
) -> dict[str, Any]:
    network_series = _daily_network_series(dataset, pollutant, source_scope)
    dates, values, observed_ratio = _filled_series(network_series)
    if len(values) < max(90, horizon_days * 3):
        return {
            "sliceId": f"forecast-{source_scope}-{horizon_days}",
            "trainingScope": source_scope,
            "generatedAt": generated_at,
            "horizonDays": horizon_days,
            "supported": False,
            "unavailableReason": "Forecast icin en az 90 gunluk gunluk seri gerekir.",
            "mae": None,
            "rmse": None,
            "points": [],
        }

    if observed_ratio < 0.75:
        return {
            "sliceId": f"forecast-{source_scope}-{horizon_days}",
            "trainingScope": source_scope,
            "generatedAt": generated_at,
            "horizonDays": horizon_days,
            "supported": False,
            "unavailableReason": "Forecast icin gunluk seri dolulugu en az %75 olmalidir.",
            "mae": None,
            "rmse": None,
            "points": [],
        }

    holdout = horizon_days
    training_values = values[:-holdout]
    actual = values[-holdout:]
    predicted_backtest = _ensemble_forecast(training_values, holdout)
    mae, rmse = _forecast_metrics(actual, predicted_backtest)
    future_predictions = _ensemble_forecast(values, horizon_days)
    coverage_end: date = network_series["coverageEnd"]
    interval_width = (rmse or 0.0) * 1.64
    points = []
    for step, forecast_value in enumerate(future_predictions, start=1):
        forecast_date = date.fromordinal(coverage_end.toordinal() + step)
        points.append(
            {
                "timestamp": f"{forecast_date.isoformat()}T00:00:00Z",
                "value": _round(forecast_value, 3),
                "lower": _round(forecast_value - interval_width, 3),
                "upper": _round(forecast_value + interval_width, 3),
            }
        )

    return {
        "sliceId": f"forecast-{source_scope}-{horizon_days}",
        "trainingScope": source_scope,
        "generatedAt": generated_at,
        "horizonDays": horizon_days,
        "supported": True,
        "unavailableReason": None,
        "mae": _round(mae, 3),
        "rmse": _round(rmse, 3),
        "points": points,
    }


def _available_pollutants(dataset: dict[str, Any]) -> list[str]:
    observed = {
        str(record.get("pollutant"))
        for record in dataset.get("stationTimeSeries", [])
        if str(record.get("pollutant") or "") in POLLUTANT_ORDER
    }
    return [pollutant for pollutant in POLLUTANT_ORDER if pollutant in observed]


def build_spatial_analysis_artifacts(
    dataset: dict[str, Any],
    *,
    generated_at: str | None = None,
) -> dict[str, Any]:
    boundary_geometry = _load_boundary_geometry()
    extent = _dataset_extent(dataset, boundary_geometry)
    origin_lat = extent["south"]
    origin_lng = extent["west"]
    cells = _build_grid_cells(dataset, boundary_geometry)
    roads = _road_segments(dataset, origin_lat=origin_lat, origin_lng=origin_lng)
    green_polygons = _green_polygons(dataset, origin_lat=origin_lat, origin_lng=origin_lng)
    industries = _industrial_features(dataset, origin_lat=origin_lat, origin_lng=origin_lng)
    elevation_points = _elevation_points(dataset, origin_lat=origin_lat, origin_lng=origin_lng)
    contexts = _cell_contexts(
        cells,
        origin_lat=origin_lat,
        origin_lng=origin_lng,
        roads=roads,
        green_polygons=green_polygons,
        industries=industries,
        elevation_points=elevation_points,
    )

    cell_lookup = {context["cellId"]: context for context in contexts}
    grid_cells = [
        {
            **cell,
            "coordinates": cell["polygon"],
            "context": cell_lookup[cell["cellId"]],
        }
        for cell in cells
    ]

    manifest_generated_at = generated_at or datetime.utcnow().replace(microsecond=0).isoformat() + "Z"
    coverage_start = str(dataset["metadata"]["coverageStart"])
    coverage_end = str(dataset["metadata"]["coverageEnd"])
    dataset_version = str(dataset["metadata"].get("version") or "unknown")
    package_descriptors: list[dict[str, Any]] = []
    package_payloads: dict[str, dict[str, Any]] = {}

    for pollutant in _available_pollutants(dataset):
        for source_scope in SCOPES:
            monthly_slices = _monthly_slices(
                dataset=dataset,
                cells=cells,
                pollutant=pollutant,
                source_scope=source_scope,
                origin_lat=origin_lat,
                origin_lng=origin_lng,
            )
            event_slices = _event_slices(
                dataset=dataset,
                cells=cells,
                pollutant=pollutant,
                source_scope=source_scope,
                origin_lat=origin_lat,
                origin_lng=origin_lng,
                start_date=date.fromisoformat(coverage_start),
                end_date=date.fromisoformat(coverage_end),
            )
            monthly_stats_slices = _monthly_stats_slices(
                dataset=dataset,
                pollutant=pollutant,
                source_scope=source_scope,
                origin_lat=origin_lat,
                origin_lng=origin_lng,
            )
            event_stats_slices = _event_stats_slices(
                dataset=dataset,
                pollutant=pollutant,
                source_scope=source_scope,
                origin_lat=origin_lat,
                origin_lng=origin_lng,
                start_date=date.fromisoformat(coverage_start),
                end_date=date.fromisoformat(coverage_end),
            )
            monthly_risk_overlays = _risk_overlay_slices(
                cells=cells,
                cell_context_lookup=cell_lookup,
                surface_slices=monthly_slices,
                stats_slices=monthly_stats_slices,
                pollutant=pollutant,
                origin_lat=origin_lat,
                origin_lng=origin_lng,
            )
            event_risk_overlays = _risk_overlay_slices(
                cells=cells,
                cell_context_lookup=cell_lookup,
                surface_slices=event_slices,
                stats_slices=event_stats_slices,
                pollutant=pollutant,
                origin_lat=origin_lat,
                origin_lng=origin_lng,
            )
            monthly_source_summaries = _source_summary_slices(
                cells=cells,
                cell_context_lookup=cell_lookup,
                surface_slices=monthly_slices,
                dataset=dataset,
                source_scope=source_scope,
                origin_lat=origin_lat,
                origin_lng=origin_lng,
            )
            event_source_summaries = _source_summary_slices(
                cells=cells,
                cell_context_lookup=cell_lookup,
                surface_slices=event_slices,
                dataset=dataset,
                source_scope=source_scope,
                origin_lat=origin_lat,
                origin_lng=origin_lng,
            )
            forecasts = [
                _forecast_slice(
                    dataset=dataset,
                    pollutant=pollutant,
                    source_scope=source_scope,
                    generated_at=manifest_generated_at,
                    horizon_days=horizon_days,
                )
                for horizon_days in (7, 30)
            ]
            usable_monthly_slices = sum(1 for slice_ in monthly_slices if slice_["status"] == "ok")
            if not monthly_slices and not event_slices:
                continue

            file_name = f"{pollutant.lower().replace('.', '')}-{source_scope}.json"
            package_payloads[file_name] = {
                "packageVersion": SPATIAL_PACKAGE_VERSION,
                "manifestVersion": SPATIAL_MANIFEST_VERSION,
                "datasetVersion": dataset_version,
                "datasetCoverageStart": coverage_start,
                "datasetCoverageEnd": coverage_end,
                "gridResolutionKm": GRID_RESOLUTION_KM,
                "pollutant": pollutant,
                "sourceScope": source_scope,
                "sliceMode": "monthly",
                "stationCount": len(
                    [
                        station
                        for station in dataset.get("stations", [])
                        if _station_is_in_scope(station, source_scope)
                        and pollutant in (station.get("pollutants") or [])
                    ]
                ),
                "monthlySlices": monthly_slices,
                "eventSlices": event_slices,
                "spatialStats": {
                    "monthlySlices": monthly_stats_slices,
                    "eventSlices": event_stats_slices,
                },
                "riskOverlays": {
                    "monthlySlices": monthly_risk_overlays,
                    "eventSlices": event_risk_overlays,
                },
                "sourceSummaries": {
                    "monthlySlices": monthly_source_summaries,
                    "eventSlices": event_source_summaries,
                },
                "forecasts": forecasts,
                "summary": {
                    "monthlySliceCount": len(monthly_slices),
                    "usableMonthlySliceCount": usable_monthly_slices,
                    "eventSliceCount": len(event_slices),
                },
            }
            package_descriptors.append(
                {
                    "pollutant": pollutant,
                    "sourceScope": source_scope,
                    "path": file_name,
                    "monthlySliceCount": len(monthly_slices),
                    "usableMonthlySliceCount": usable_monthly_slices,
                    "eventSliceCount": len(event_slices),
                }
            )

    package_descriptors.sort(key=lambda item: (POLLUTANT_ORDER.index(item["pollutant"]), item["sourceScope"]))

    manifest = {
        "manifestVersion": SPATIAL_MANIFEST_VERSION,
        "analysisVersion": SPATIAL_PACKAGE_VERSION,
        "datasetVersion": dataset_version,
        "datasetCoverageStart": coverage_start,
        "datasetCoverageEnd": coverage_end,
        "generatedAt": manifest_generated_at,
        "gridResolutionKm": GRID_RESOLUTION_KM,
        "surfaceMethods": ["idw", "kriging"],
        "sourceScopes": list(SCOPES.keys()),
        "availablePollutants": list(dict.fromkeys(item["pollutant"] for item in package_descriptors)),
        "grid": {
            "extent": extent,
            "cellCount": len(grid_cells),
            "boundaryApproximate": boundary_geometry is not None,
            "cells": grid_cells,
        },
        "packages": package_descriptors,
        "qualityGates": {
            "minimumIdwObservations": MIN_IDW_OBSERVATIONS,
            "minimumBucketCompleteness": MIN_BUCKET_COMPLETENESS,
            "minimumMoranObservations": 6,
            "minimumKrigingObservations": MIN_KRIGING_OBSERVATIONS,
            "krigingRequiresLoocvAdvantage": True,
            "analysisRadiusM": ANALYSIS_RADIUS_M,
        },
    }

    return {
        "manifest": manifest,
        "packages": package_payloads,
    }


def write_spatial_analysis_artifacts(
    dataset: dict[str, Any],
    output_dir: Path,
    *,
    generated_at: str | None = None,
) -> dict[str, Any]:
    artifacts = build_spatial_analysis_artifacts(dataset, generated_at=generated_at)
    output_dir.mkdir(parents=True, exist_ok=True)

    manifest_path = output_dir / "manifest.json"
    with manifest_path.open("w", encoding="utf-8") as handle:
        json.dump(artifacts["manifest"], handle, ensure_ascii=False, separators=(",", ":"))

    for file_name, payload in artifacts["packages"].items():
        package_path = output_dir / file_name
        with package_path.open("w", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=False, separators=(",", ":"))

    return artifacts
