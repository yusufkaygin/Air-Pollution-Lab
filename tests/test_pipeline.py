from __future__ import annotations

import json
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from etl import (
    DATASET_CHUNK_MANIFEST_VERSION,
    SPATIAL_MANIFEST_VERSION,
    SPATIAL_PACKAGE_VERSION,
    build_dataset_chunk_artifacts,
    build_spatial_analysis_artifacts,
    convert_pollutant_unit,
    deduplicate_records,
    load_municipal_official_network,
    month_windows,
    parse_timestamp,
    safe_year_delta,
    slugify_station_id,
    write_dataset_chunk_artifacts,
    write_spatial_analysis_artifacts,
)


class PipelineTests(unittest.TestCase):
    def test_parse_timestamp_supports_turkish_datetime(self) -> None:
        parsed = parse_timestamp("15.03.2026 17:00")
        self.assertEqual(parsed.year, 2026)
        self.assertEqual(parsed.month, 3)
        self.assertEqual(parsed.day, 15)
        self.assertEqual(parsed.hour, 17)

    def test_convert_pollutant_unit_converts_mg_to_micrograms(self) -> None:
        value, unit = convert_pollutant_unit(0.032, "mg/m3", "PM10")
        self.assertEqual(unit, "ug/m3")
        self.assertAlmostEqual(value, 32.0)

    def test_deduplicate_records_averages_collisions(self) -> None:
        records = [
            {
                "stationId": "station-a",
                "timestamp": "2025-01-01T00:00:00Z",
                "pollutant": "PM10",
                "value": 20.0,
                "unit": "ug/m3",
                "qualityFlag": "valid",
                "source": "a.csv",
            },
            {
                "stationId": "station-a",
                "timestamp": "2025-01-01T00:00:00Z",
                "pollutant": "PM10",
                "value": 40.0,
                "unit": "ug/m3",
                "qualityFlag": "valid",
                "source": "b.csv",
            },
        ]

        deduped = deduplicate_records(records)
        self.assertEqual(len(deduped), 1)
        self.assertEqual(deduped[0]["qualityFlag"], "screened")
        self.assertAlmostEqual(deduped[0]["value"], 30.0)

    def test_slugify_station_id_handles_turkish_characters(self) -> None:
        self.assertEqual(slugify_station_id("Gursu / Hasankoy"), "gursu-hasankoy")

    def test_month_windows_cover_boundary_months(self) -> None:
        windows = month_windows(
            parse_timestamp("15.03.2021 00:00").date(),
            parse_timestamp("20.05.2021 00:00").date(),
        )
        self.assertEqual(windows[0][0].isoformat(), "2021-03-15")
        self.assertEqual(windows[0][1].isoformat(), "2021-03-31")
        self.assertEqual(windows[-1][0].isoformat(), "2021-05-01")
        self.assertEqual(windows[-1][1].isoformat(), "2021-05-20")

    def test_safe_year_delta_handles_leap_day(self) -> None:
        shifted = safe_year_delta(parse_timestamp("29.02.2024 00:00").date(), 1)
        self.assertEqual(shifted.isoformat(), "2023-02-28")

    def test_municipal_official_workbook_parses_daily_records(self) -> None:
        stations, records, issues, source_notes = load_municipal_official_network(
            Path("data/raw/municipal_official"),
            parse_timestamp("01.01.2025 00:00").date(),
            parse_timestamp("15.03.2026 00:00").date(),
        )

        self.assertGreaterEqual(len(stations), 10)
        self.assertGreater(len(records), 100)
        self.assertTrue(
            all(station["dataSource"] == "municipal-official" for station in stations)
        )
        self.assertIn("bbb-kent-meydani", {station["id"] for station in stations})
        self.assertTrue(
            all(record["timestamp"].endswith("T00:00:00Z") for record in records)
        )
        self.assertTrue(
            all(
                record["source"] == "Resmi Belediye Kaynağı"
                for record in records
            )
        )
        self.assertTrue(any(issue["id"] == "municipal-official-network-added" for issue in issues))
        self.assertIn("https://www.bursa.bel.tr/hava-kalitesi", source_notes)

    def test_public_dataset_is_real_and_non_demo(self) -> None:
        dataset_path = Path("public/data/bursa-air-quality-v1.json")
        self.assertTrue(dataset_path.exists())

        with dataset_path.open("r", encoding="utf-8") as handle:
            dataset = json.load(handle)

        metadata = dataset["metadata"]
        metadata_text = json.dumps(metadata, ensure_ascii=False).lower()

        self.assertTrue(metadata["version"].startswith("official-daily-"))
        self.assertNotIn("mock", metadata_text)
        self.assertNotIn("synthetic", metadata_text)
        self.assertNotIn("sentetik", metadata_text)
        self.assertNotIn("demo", metadata_text)

        self.assertGreater(len(dataset["stations"]), 0)
        self.assertGreater(len(dataset["stationTimeSeries"]), 0)
        self.assertGreater(len(dataset["meteoTimeSeries"]), 0)
        self.assertGreater(len(dataset["contextMetrics"]), 0)
        self.assertGreater(len(dataset["events"]), 0)

    def test_public_dataset_references_are_consistent(self) -> None:
        dataset_path = Path("public/data/bursa-air-quality-v1.json")

        with dataset_path.open("r", encoding="utf-8") as handle:
            dataset = json.load(handle)

        station_ids = {station["id"] for station in dataset["stations"]}
        station_sources = {row["source"] for row in dataset["stationTimeSeries"]}
        meteo_sources = {row["source"] for row in dataset["meteoTimeSeries"]}
        context_station_ids = {row["stationId"] for row in dataset["contextMetrics"]}
        municipal_official_station_ids = {
            station["id"]
            for station in dataset["stations"]
            if station.get("dataSource") == "municipal-official"
        }

        self.assertIn("Ulusal Hava Kalitesi İzleme Ağı", station_sources)
        self.assertIn("Resmi Belediye Kaynağı", station_sources)
        self.assertTrue(
            all(
                source == "Ulusal Hava Kalitesi İzleme Ağı"
                or source.startswith("Airqoon / ")
                or source == "Resmi Belediye Kaynağı"
                or source == "Open-Meteo Air Quality"
                for source in station_sources
            )
        )
        self.assertEqual(meteo_sources, {"Open-Meteo Archive"})
        self.assertTrue(all("sourceId" in station for station in dataset["stations"]))
        self.assertTrue(all("dataSource" in station for station in dataset["stations"]))
        self.assertTrue(
            all(row["stationId"] in station_ids for row in dataset["stationTimeSeries"])
        )
        self.assertTrue(
            all(row["stationIdOrGridId"] in station_ids for row in dataset["meteoTimeSeries"])
        )
        self.assertEqual(context_station_ids, station_ids)
        self.assertEqual(len(dataset["contextMetrics"]), len(dataset["stations"]) * 3)
        self.assertTrue(all(event["name"] for event in dataset["events"]))
        self.assertGreater(len(municipal_official_station_ids), 0)

    def test_dataset_chunk_artifacts_split_core_series_and_layers(self) -> None:
        dataset = build_spatial_fixture_dataset()

        artifacts = build_dataset_chunk_artifacts(dataset)
        manifest = artifacts["manifest"]
        files = artifacts["files"]

        self.assertEqual(manifest["manifestVersion"], DATASET_CHUNK_MANIFEST_VERSION)
        self.assertEqual(manifest["datasetVersion"], "test-dataset-1")
        self.assertEqual(files["core.json"]["roads"], [])
        self.assertEqual(files["core.json"]["greenAreas"], [])
        self.assertEqual(files["meteo.json"], dataset["meteoTimeSeries"])
        self.assertIn("PM10", manifest["stationSeriesPaths"])
        self.assertEqual(
            files[manifest["stationSeriesPaths"]["PM10"]],
            dataset["stationTimeSeries"],
        )
        self.assertEqual(files["roads.json"], dataset["roads"])
        self.assertEqual(files["industries.json"], dataset["industries"])
        self.assertEqual(files["greenAreas.json"], dataset["greenAreas"])
        self.assertEqual(files["elevationGrid.json"], dataset["elevationGrid"])

    def test_write_dataset_chunk_artifacts_creates_manifest_and_files(self) -> None:
        dataset = build_spatial_fixture_dataset()

        with TemporaryDirectory() as temp_dir:
            output_dir = Path(temp_dir)
            artifacts = write_dataset_chunk_artifacts(dataset, output_dir)

            manifest_path = output_dir / "manifest.json"
            core_path = output_dir / "core.json"
            series_path = output_dir / artifacts["manifest"]["stationSeriesPaths"]["PM10"]

            self.assertTrue(manifest_path.exists())
            self.assertTrue(core_path.exists())
            self.assertTrue(series_path.exists())

            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            core_payload = json.loads(core_path.read_text(encoding="utf-8"))

            self.assertEqual(manifest["manifestVersion"], DATASET_CHUNK_MANIFEST_VERSION)
            self.assertEqual(manifest["corePath"], "core.json")
            self.assertEqual(core_payload["metadata"]["version"], "test-dataset-1")
            self.assertEqual(core_payload["roads"], [])


def build_spatial_fixture_dataset() -> dict[str, object]:
    stations = [
        {
            "id": "station-a",
            "name": "Station A",
            "district": "Osmangazi",
            "stationType": "urban",
            "lat": 40.05,
            "lng": 29.0,
            "elevationM": 120,
            "pollutants": ["PM10"],
            "dataSource": "official",
        },
        {
            "id": "station-b",
            "name": "Station B",
            "district": "Nilufer",
            "stationType": "traffic",
            "lat": 40.06,
            "lng": 29.08,
            "elevationM": 130,
            "pollutants": ["PM10"],
            "dataSource": "official",
        },
        {
            "id": "station-c",
            "name": "Station C",
            "district": "Kestel",
            "stationType": "urban",
            "lat": 40.1,
            "lng": 29.02,
            "elevationM": 140,
            "pollutants": ["PM10"],
            "dataSource": "municipal-official",
        },
        {
            "id": "station-d",
            "name": "Station D",
            "district": "Gursu",
            "stationType": "urban",
            "lat": 40.12,
            "lng": 29.07,
            "elevationM": 150,
            "pollutants": ["PM10"],
            "dataSource": "municipal-official",
        },
        {
            "id": "station-e",
            "name": "Station E",
            "district": "Yildirim",
            "stationType": "sensor",
            "lat": 40.08,
            "lng": 29.04,
            "elevationM": 125,
            "pollutants": ["PM10"],
            "dataSource": "municipal-sensor",
        },
        {
            "id": "station-f",
            "name": "Station F",
            "district": "Osmangazi",
            "stationType": "modeled",
            "lat": 40.14,
            "lng": 29.1,
            "elevationM": 160,
            "pollutants": ["PM10"],
            "dataSource": "modeled",
        },
    ]

    station_time_series: list[dict[str, object]] = []
    meteo_time_series: list[dict[str, object]] = []
    for month_index, (month, day_count) in enumerate(
        (("2024-01", 31), ("2024-02", 29), ("2024-03", 31), ("2024-04", 30))
    ):
        for day in range(1, day_count + 1):
            for station_index, station in enumerate(stations):
                station_time_series.append(
                    {
                        "stationId": station["id"],
                        "timestamp": f"{month}-{day:02d}T00:00:00Z",
                        "pollutant": "PM10",
                        "value": 20 + station_index * 2 + month_index * 5 + (day % 4),
                        "unit": "ug/m3",
                        "qualityFlag": "valid",
                        "source": "test",
                    }
                )
                meteo_time_series.append(
                    {
                        "stationIdOrGridId": station["id"],
                        "timestamp": f"{month}-{day:02d}T00:00:00Z",
                        "temperatureC": 14 + (day % 6),
                        "humidityPct": 55 + station_index,
                        "windSpeedMs": 2.1 + (station_index * 0.2),
                        "windDirDeg": 45 + (month_index * 12) + station_index,
                        "precipitationMm": 0.2 * (day % 3),
                        "source": "test-meteo",
                    }
                )

    return {
        "metadata": {
            "version": "test-dataset-1",
            "generatedAt": "2026-03-15T12:00:00Z",
            "coverageStart": "2024-01-01",
            "coverageEnd": "2024-04-30",
            "description": "Synthetic dataset for spatial analysis tests",
            "methods": [],
            "sourceNotes": [],
        },
        "stations": stations,
        "stationTimeSeries": station_time_series,
        "meteoTimeSeries": meteo_time_series,
        "contextMetrics": [],
        "events": [
            {
                "eventId": "event-1",
                "eventType": "fire",
                "analysisMode": "spatial",
                "name": "Test Event",
                "startDate": "2024-02-10T00:00:00Z",
                "endDate": "2024-02-12T00:00:00Z",
                "center": {"lat": 40.08, "lng": 29.05},
                "radiusKm": 8,
                "source": "test",
                "confidence": 0.9,
                "hotspotCount": 3,
                "note": "test event",
            }
        ],
        "roads": [
            {
                "id": "road-1",
                "name": "Primary Road",
                "category": "primary",
                "coordinates": [
                    [40.03, 28.99],
                    [40.09, 29.11],
                ],
            }
        ],
        "industries": [
            {
                "id": "industry-1",
                "name": "Industry A",
                "category": "industrial",
                "lat": 40.085,
                "lng": 29.06,
            }
        ],
        "greenAreas": [
            {
                "id": "green-1",
                "name": "Green A",
                "category": "park",
                "coordinates": [
                    [40.07, 29.01],
                    [40.07, 29.03],
                    [40.09, 29.03],
                    [40.09, 29.01],
                    [40.07, 29.01],
                ],
            }
        ],
        "elevationGrid": [
            {
                "id": "elev-1",
                "name": "Elevation 1",
                "category": "elevation",
                "value": 110,
                "coordinates": [
                    [40.02, 28.98],
                    [40.02, 29.04],
                    [40.08, 29.04],
                    [40.08, 28.98],
                    [40.02, 28.98],
                ],
            },
            {
                "id": "elev-2",
                "name": "Elevation 2",
                "category": "elevation",
                "value": 140,
                "coordinates": [
                    [40.02, 29.04],
                    [40.02, 29.10],
                    [40.08, 29.10],
                    [40.08, 29.04],
                    [40.02, 29.04],
                ],
            },
            {
                "id": "elev-3",
                "name": "Elevation 3",
                "category": "elevation",
                "value": 150,
                "coordinates": [
                    [40.08, 28.98],
                    [40.08, 29.04],
                    [40.14, 29.04],
                    [40.14, 28.98],
                    [40.08, 28.98],
                ],
            },
            {
                "id": "elev-4",
                "name": "Elevation 4",
                "category": "elevation",
                "value": 170,
                "coordinates": [
                    [40.08, 29.04],
                    [40.08, 29.10],
                    [40.14, 29.10],
                    [40.14, 29.04],
                    [40.08, 29.04],
                ],
            },
        ],
    }


class SpatialAnalysisTests(unittest.TestCase):
    def test_build_spatial_artifacts_is_deterministic_and_scope_aware(self) -> None:
        dataset = build_spatial_fixture_dataset()
        generated_at = "2026-03-15T12:00:00Z"

        artifacts_a = build_spatial_analysis_artifacts(dataset, generated_at=generated_at)
        artifacts_b = build_spatial_analysis_artifacts(dataset, generated_at=generated_at)

        self.assertEqual(
            json.dumps(artifacts_a, sort_keys=True),
            json.dumps(artifacts_b, sort_keys=True),
        )

        manifest = artifacts_a["manifest"]
        packages = artifacts_a["packages"]

        self.assertEqual(manifest["manifestVersion"], SPATIAL_MANIFEST_VERSION)
        self.assertEqual(manifest["analysisVersion"], SPATIAL_PACKAGE_VERSION)
        self.assertEqual(manifest["gridResolutionKm"], 5.0)
        self.assertEqual(manifest["availablePollutants"], ["PM10"])
        self.assertGreater(manifest["grid"]["cellCount"], 0)
        self.assertTrue(manifest["grid"]["boundaryApproximate"])
        self.assertEqual(manifest["surfaceMethods"], ["idw", "kriging"])
        self.assertEqual(manifest["qualityGates"]["minimumBucketCompleteness"], 0.7)
        self.assertEqual(len(manifest["packages"]), 2)

        measured_package = packages["pm10-measured.json"]
        sensor_package = packages["pm10-measured-plus-sensor.json"]

        self.assertEqual(measured_package["sourceScope"], "measured")
        self.assertEqual(sensor_package["sourceScope"], "measured-plus-sensor")
        self.assertGreater(sensor_package["stationCount"], measured_package["stationCount"])
        self.assertIsNotNone(measured_package["monthlySlices"][0]["surfaceValues"])
        self.assertEqual(
            len(measured_package["monthlySlices"][0]["surfaceValues"]),
            manifest["grid"]["cellCount"],
        )
        self.assertEqual(
            len(measured_package["monthlySlices"][0]["surfaceExceedanceRatios"]),
            manifest["grid"]["cellCount"],
        )
        self.assertGreater(
            measured_package["monthlySlices"][0]["meanStationCompleteness"],
            0.7,
        )
        self.assertIn("spatialStats", measured_package)
        self.assertIn("riskOverlays", measured_package)
        self.assertIn("sourceSummaries", measured_package)
        self.assertIn("forecasts", measured_package)
        self.assertGreaterEqual(
            measured_package["spatialStats"]["monthlySlices"][0]["globalMoranI"] or 0,
            0,
        )
        self.assertEqual(
            len(measured_package["riskOverlays"]["monthlySlices"][0]["cells"]),
            manifest["grid"]["cellCount"],
        )
        self.assertEqual(
            len(measured_package["sourceSummaries"]["monthlySlices"][0]["coefficients"]),
            7,
        )
        self.assertEqual(
            measured_package["forecasts"][0]["horizonDays"],
            7,
        )
        self.assertTrue(measured_package["forecasts"][0]["supported"])
        self.assertEqual(len(measured_package["eventSlices"]), 1)
        self.assertEqual(measured_package["eventSlices"][0]["status"], "ok")
        self.assertEqual(measured_package["summary"]["usableMonthlySliceCount"], 4)

    def test_spatial_artifacts_write_manifest_and_packages(self) -> None:
        dataset = build_spatial_fixture_dataset()
        generated_at = "2026-03-15T12:00:00Z"

        with TemporaryDirectory() as temp_dir:
            output_dir = Path(temp_dir)
            artifacts = write_spatial_analysis_artifacts(
                dataset,
                output_dir,
                generated_at=generated_at,
            )

            manifest_path = output_dir / "manifest.json"
            package_path = output_dir / "pm10-measured.json"

            self.assertTrue(manifest_path.exists())
            self.assertTrue(package_path.exists())

            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            package = json.loads(package_path.read_text(encoding="utf-8"))

            self.assertEqual(manifest["manifestVersion"], SPATIAL_MANIFEST_VERSION)
            self.assertEqual(manifest["packages"][0]["path"], "pm10-measured.json")
            self.assertTrue(manifest["grid"]["boundaryApproximate"])
            self.assertEqual(package["packageVersion"], SPATIAL_PACKAGE_VERSION)
            self.assertEqual(package["datasetVersion"], "test-dataset-1")
            self.assertIn("sourceSummaries", package)
            self.assertIn("forecasts", package)
            self.assertEqual(artifacts["manifest"]["generatedAt"], generated_at)


if __name__ == "__main__":
    unittest.main()
