import { describe, expect, it } from 'vitest'

import { DEFAULT_FILTERS } from '../constants'
import type { BursaDataset } from '../types'
import { analyzeDataset } from './analytics'

const testDataset: BursaDataset = {
  metadata: {
    version: 'test',
    generatedAt: '2026-03-15T12:00:00Z',
    coverageStart: '2024-01-01',
    coverageEnd: '2024-03-31',
    description: 'Unit test dataset',
    methods: [],
    sourceNotes: [],
  },
  stations: [
    {
      id: 'a',
      name: 'A',
      district: 'Osmangazi',
      stationType: 'urban',
      lat: 40.1,
      lng: 29.0,
      elevationM: 120,
      pollutants: ['PM10', 'PM2.5'],
    },
    {
      id: 'b',
      name: 'B',
      district: 'Kestel',
      stationType: 'traffic',
      lat: 40.2,
      lng: 29.15,
      elevationM: 180,
      pollutants: ['PM10', 'PM2.5'],
    },
  ],
  stationTimeSeries: [
    { stationId: 'a', timestamp: '2024-01-15T00:00:00Z', pollutant: 'PM10', value: 20, unit: 'ug/m3', qualityFlag: 'valid', source: 'test' },
    { stationId: 'a', timestamp: '2024-02-15T00:00:00Z', pollutant: 'PM10', value: 40, unit: 'ug/m3', qualityFlag: 'valid', source: 'test' },
    { stationId: 'a', timestamp: '2024-03-15T00:00:00Z', pollutant: 'PM10', value: 60, unit: 'ug/m3', qualityFlag: 'valid', source: 'test' },
    { stationId: 'b', timestamp: '2024-01-15T00:00:00Z', pollutant: 'PM10', value: 35, unit: 'ug/m3', qualityFlag: 'valid', source: 'test' },
    { stationId: 'b', timestamp: '2024-02-15T00:00:00Z', pollutant: 'PM10', value: 45, unit: 'ug/m3', qualityFlag: 'valid', source: 'test' },
    { stationId: 'b', timestamp: '2024-03-15T00:00:00Z', pollutant: 'PM10', value: 75, unit: 'ug/m3', qualityFlag: 'valid', source: 'test' },
  ],
  meteoTimeSeries: [
    { stationIdOrGridId: 'a', timestamp: '2024-01-15T00:00:00Z', temperatureC: 10, humidityPct: 70, windSpeedMs: 2, windDirDeg: 180, precipitationMm: 0, source: 'test' },
    { stationIdOrGridId: 'a', timestamp: '2024-02-15T00:00:00Z', temperatureC: 12, humidityPct: 65, windSpeedMs: 3, windDirDeg: 200, precipitationMm: 0, source: 'test' },
    { stationIdOrGridId: 'a', timestamp: '2024-03-15T00:00:00Z', temperatureC: 15, humidityPct: 60, windSpeedMs: 4, windDirDeg: 210, precipitationMm: 0, source: 'test' },
    { stationIdOrGridId: 'b', timestamp: '2024-01-15T00:00:00Z', temperatureC: 8, humidityPct: 72, windSpeedMs: 3, windDirDeg: 170, precipitationMm: 1, source: 'test' },
    { stationIdOrGridId: 'b', timestamp: '2024-02-15T00:00:00Z', temperatureC: 11, humidityPct: 68, windSpeedMs: 4, windDirDeg: 195, precipitationMm: 0, source: 'test' },
    { stationIdOrGridId: 'b', timestamp: '2024-03-15T00:00:00Z', temperatureC: 14, humidityPct: 62, windSpeedMs: 5, windDirDeg: 205, precipitationMm: 0, source: 'test' },
  ],
  contextMetrics: [
    { stationId: 'a', radiusM: 500, buildingDensity: 0.45, roadDensity: 2.1, greenRatio: 0.22, imperviousRatio: 0.58, industryCount: 2, meanElevation: 140, slopeMean: 3.2 },
    { stationId: 'b', radiusM: 500, buildingDensity: 0.35, roadDensity: 1.4, greenRatio: 0.34, imperviousRatio: 0.46, industryCount: 1, meanElevation: 160, slopeMean: 4.1 },
  ],
  events: [
    {
      eventId: 'fire-test',
      eventType: 'fire',
      name: 'Test Fire',
      startDate: '2024-02-15T00:00:00Z',
      endDate: '2024-02-16T00:00:00Z',
      center: { lat: 40.12, lng: 29.03 },
      radiusKm: 8,
      source: 'test',
      confidence: 0.8,
      hotspotCount: 10,
      note: 'test',
    },
  ],
  roads: [],
  industries: [],
  greenAreas: [],
  elevationGrid: [],
}

describe('analyzeDataset', () => {
  it('aggregates monthly records and builds overview cards', () => {
    const result = analyzeDataset(testDataset, {
      ...DEFAULT_FILTERS,
      pollutant: 'PM10',
      resolution: 'month',
      bufferRadius: 500,
      startDate: '2024-01-01',
      endDate: '2024-03-31',
    })

    expect(result.aggregateSeries).toHaveLength(3)
    expect(result.aggregateSeries[0].value).toBeCloseTo(27.5)
    expect(result.overviewCards).toHaveLength(5)
    expect(result.overviewCards[2]?.value).toBe('1')
    expect(result.scientificDiagnostics).toHaveLength(4)
    expect(result.correlations[0]).toBeDefined()
  })

  it('produces event rows with exposed and control candidates', () => {
    const result = analyzeDataset(testDataset, {
      ...DEFAULT_FILTERS,
      pollutant: 'PM10',
      resolution: 'month',
      bufferRadius: 500,
      startDate: '2024-02-01',
      endDate: '2024-02-29',
      stationId: 'a',
    })

    expect(result.event?.eventId).toBe('fire-test')
    expect(result.eventImpactRows.length).toBeGreaterThan(0)
    expect(result.eventImpactRows.some((row) => row.status === 'exposed')).toBe(true)
  })

  it('returns Turkish seasonal labels and overview details', () => {
    const result = analyzeDataset(testDataset, {
      ...DEFAULT_FILTERS,
      pollutant: 'PM10',
      resolution: 'season',
      bufferRadius: 500,
      startDate: '2024-01-01',
      endDate: '2024-03-31',
    })

    expect(result.aggregateSeries.map((point) => point.label)).toEqual([
      'Kış 2024',
      'İlkbahar 2024',
    ])
    expect(result.overviewCards[0]?.detail).toBe('mevsimlik çözünürlükte ortalama')
    expect(result.exportRows[0]?.resolution).toBe('mevsimlik')
  })

  it('builds scientific summaries for structural change and episodes', () => {
    const result = analyzeDataset(testDataset, {
      ...DEFAULT_FILTERS,
      pollutant: 'PM10',
      resolution: 'month',
      bufferRadius: 500,
      startDate: '2024-01-01',
      endDate: '2024-03-31',
    })

    expect(result.seasonalTrendSummary.seasonCount).toBeGreaterThanOrEqual(0)
    expect(result.changePointSummary.score).toBeGreaterThanOrEqual(0)
    expect(result.exceedanceEpisodeSummary.threshold).toBe(50)
    expect(result.kzDecompositionSummary.backgroundShare).toBeGreaterThanOrEqual(0)
  })

  it('aggregates rose analysis across all selected stations', () => {
    const result = analyzeDataset(testDataset, {
      ...DEFAULT_FILTERS,
      stationId: 'all',
      pollutant: 'PM10',
      resolution: 'month',
      bufferRadius: 500,
      startDate: '2024-01-01',
      endDate: '2024-03-31',
    })

    const southBin = result.roseData.find((row) => row.direction === 'G')
    const southwestBin = result.roseData.find((row) => row.direction === 'GB')

    expect(southBin?.pollutionMean).toBeCloseTo(35)
    expect(southwestBin?.pollutionMean).toBeCloseTo(67.5)
  })
})
