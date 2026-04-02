from __future__ import annotations

import argparse
import json
import sys
from datetime import date, timedelta
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]

if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from etl import (
    build_dataset_from_local_files,
    build_real_dataset,
    safe_year_delta,
    write_dataset_chunk_artifacts,
    write_spatial_analysis_artifacts,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build a static Bursa air-quality dataset for the frontend.",
    )
    parser.add_argument(
        "--mode",
        choices=["fetch", "local"],
        default="fetch",
        help="fetch real Bursa sources or import local normalized files",
    )
    parser.add_argument("--output", required=True, help="Output JSON path")
    parser.add_argument(
        "--raw-root",
        default="data/raw",
        help="Root directory for cached raw source files",
    )
    parser.add_argument(
        "--start-date",
        help="Coverage start date in YYYY-MM-DD format. Defaults to five years before end date.",
    )
    parser.add_argument(
        "--end-date",
        help="Coverage end date in YYYY-MM-DD format. Defaults to today.",
    )
    parser.add_argument(
        "--refresh",
        action="store_true",
        help="Ignore cached source files and fetch fresh responses where possible",
    )
    parser.add_argument("--air-quality-csv", help="Normalized or exported air quality CSV")
    parser.add_argument("--meteo-csv", help="Meteorology CSV")
    parser.add_argument("--context-csv", help="Precomputed station context metrics CSV")
    parser.add_argument("--events-csv", help="Event catalog CSV")
    parser.add_argument("--stations-json", help="Station metadata JSON")
    parser.add_argument("--roads-json", help="Road layer JSON")
    parser.add_argument("--industries-json", help="Industry point layer JSON")
    parser.add_argument("--green-areas-json", help="Green area polygon layer JSON")
    parser.add_argument("--elevation-json", help="Elevation polygon layer JSON")
    parser.add_argument(
        "--dataset-chunk-output-dir",
        default="public/data/dataset",
        help="Directory for lazy-loadable core/meteo/pollutant dataset chunks",
    )
    parser.add_argument(
        "--spatial-output-dir",
        default="public/data/spatial",
        help="Directory for lazy-loadable spatial analysis packages",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    if args.mode == "fetch":
        latest_complete_day = date.today() - timedelta(days=1)
        end_date = (
            date.fromisoformat(args.end_date) if args.end_date else latest_complete_day
        )
        if end_date > latest_complete_day:
            end_date = latest_complete_day
        start_date = (
            date.fromisoformat(args.start_date)
            if args.start_date
            else safe_year_delta(end_date, 5)
        )
        dataset = build_real_dataset(
            raw_root=Path(args.raw_root),
            start_date=start_date,
            end_date=end_date,
            force_refresh=args.refresh,
        )
    else:
        if not args.air_quality_csv:
            raise SystemExit("--air-quality-csv is required for --mode local")

        dataset = build_dataset_from_local_files(
            air_quality_csv=Path(args.air_quality_csv),
            meteo_csv=Path(args.meteo_csv) if args.meteo_csv else None,
            context_csv=Path(args.context_csv) if args.context_csv else None,
            events_csv=Path(args.events_csv) if args.events_csv else None,
            stations_json=Path(args.stations_json) if args.stations_json else None,
            roads_json=Path(args.roads_json) if args.roads_json else None,
            industries_json=Path(args.industries_json) if args.industries_json else None,
            green_areas_json=Path(args.green_areas_json) if args.green_areas_json else None,
            elevation_json=Path(args.elevation_json) if args.elevation_json else None,
        )

    with output_path.open("w", encoding="utf-8") as handle:
        json.dump(dataset, handle, ensure_ascii=False, separators=(",", ":"))

    dataset_chunk_output_dir = Path(args.dataset_chunk_output_dir)
    write_dataset_chunk_artifacts(dataset, dataset_chunk_output_dir)

    spatial_output_dir = Path(args.spatial_output_dir)
    write_spatial_analysis_artifacts(dataset, spatial_output_dir)


if __name__ == "__main__":
    main()
