from __future__ import annotations

import unittest

from etl import (
    convert_pollutant_unit,
    deduplicate_records,
    month_windows,
    parse_timestamp,
    safe_year_delta,
    slugify_station_id,
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


if __name__ == "__main__":
    unittest.main()
