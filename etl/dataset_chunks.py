from __future__ import annotations

import json
from pathlib import Path
from typing import Any

DATASET_CHUNK_MANIFEST_VERSION = "dataset-chunk-manifest-v1"
MAP_LAYER_KEYS = ("roads", "industries", "greenAreas", "elevationGrid")


def _pollutant_chunk_name(pollutant: str) -> str:
    return f"station-series-{pollutant.lower().replace('.', '')}.json"


def build_dataset_chunk_artifacts(dataset: dict[str, Any]) -> dict[str, Any]:
    metadata = dict(dataset.get("metadata") or {})
    station_series_paths: dict[str, str] = {}
    files: dict[str, Any] = {
        "core.json": {
            "metadata": metadata,
            "stations": dataset.get("stations", []),
            "contextMetrics": dataset.get("contextMetrics", []),
            "events": dataset.get("events", []),
            "roads": [],
            "industries": [],
            "greenAreas": [],
            "elevationGrid": [],
        },
        "meteo.json": dataset.get("meteoTimeSeries", []),
    }

    pollutants = {
        str(record.get("pollutant") or "")
        for record in dataset.get("stationTimeSeries", [])
        if record.get("pollutant")
    }
    for pollutant in sorted(pollutants):
        file_name = _pollutant_chunk_name(pollutant)
        station_series_paths[pollutant] = file_name
        files[file_name] = [
            record
            for record in dataset.get("stationTimeSeries", [])
            if str(record.get("pollutant") or "") == pollutant
        ]

    layer_paths: dict[str, str] = {}
    for key in MAP_LAYER_KEYS:
        file_name = f"{key}.json"
        layer_paths[key] = file_name
        files[file_name] = dataset.get(key, [])

    manifest = {
        "manifestVersion": DATASET_CHUNK_MANIFEST_VERSION,
        "datasetVersion": metadata.get("version") or "unknown",
        "generatedAt": metadata.get("generatedAt"),
        "corePath": "core.json",
        "stationSeriesPaths": station_series_paths,
        "meteoPath": "meteo.json",
        "layerPaths": layer_paths,
    }

    return {
        "manifest": manifest,
        "files": files,
    }


def write_dataset_chunk_artifacts(
    dataset: dict[str, Any],
    output_dir: Path,
) -> dict[str, Any]:
    artifacts = build_dataset_chunk_artifacts(dataset)
    output_dir.mkdir(parents=True, exist_ok=True)

    manifest_path = output_dir / "manifest.json"
    with manifest_path.open("w", encoding="utf-8") as handle:
        json.dump(artifacts["manifest"], handle, ensure_ascii=False, separators=(",", ":"))

    for file_name, payload in artifacts["files"].items():
        chunk_path = output_dir / file_name
        with chunk_path.open("w", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=False, separators=(",", ":"))

    return artifacts
