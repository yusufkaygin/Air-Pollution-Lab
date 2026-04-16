import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DEFAULT_FILTERS } from '../constants'
import type { AnalysisManifest, BursaDataset } from '../types'
import {
  loadAnalysisManifest,
  loadSpatialAnalysisPackage,
  resetSpatialAnalysisCacheForTests,
  resolveSpatialAnalysis,
} from './spatialAnalysis'

const rawManifest = {
  manifestVersion: 'spatial-analysis-manifest-v1',
  analysisVersion: 'spatial-analysis-v1',
  datasetVersion: 'test-dataset',
  generatedAt: '2026-04-01T10:00:00Z',
  gridResolutionKm: 5,
  surfaceMethods: ['idw', 'kriging'],
  packages: [
    {
      pollutant: 'PM10',
      sourceScope: 'measured',
      path: 'pm10-measured.json',
      monthlySliceCount: 2,
      usableMonthlySliceCount: 2,
      eventSliceCount: 1,
    },
    {
      pollutant: 'PM10',
      sourceScope: 'measured-plus-sensor',
      path: 'pm10-measured-plus-sensor.json',
      monthlySliceCount: 2,
      usableMonthlySliceCount: 2,
      eventSliceCount: 1,
    },
  ],
  grid: {
    extent: {
      south: 40.0,
      west: 29.0,
      north: 40.1,
      east: 29.1,
    },
    boundaryApproximate: true,
    cellCount: 2,
    cells: [
      {
        cellId: 'r000c000',
        row: 0,
        col: 0,
        center: { lat: 40.02, lng: 29.02 },
        polygon: [
          [40.0, 29.0],
          [40.0, 29.04],
          [40.04, 29.04],
          [40.04, 29.0],
          [40.0, 29.0],
        ],
        context: {
          roadDensity: 1.8,
          greenRatio: 0.24,
          imperviousRatio: 0.55,
          industryCount: 2,
          meanElevation: 140,
          slopeMean: 3.1,
          nearestRoadDistanceM: 420,
          nearestIndustryDistanceM: 700,
        },
      },
      {
        cellId: 'r000c001',
        row: 0,
        col: 1,
        center: { lat: 40.02, lng: 29.07 },
        polygon: [
          [40.0, 29.05],
          [40.0, 29.09],
          [40.04, 29.09],
          [40.04, 29.05],
          [40.0, 29.05],
        ],
        context: {
          roadDensity: 0.9,
          greenRatio: 0.42,
          imperviousRatio: 0.36,
          industryCount: 0,
          meanElevation: 115,
          slopeMean: 2.4,
          nearestRoadDistanceM: 1300,
          nearestIndustryDistanceM: 1800,
        },
      },
    ],
  },
}

const measuredPackage = {
  packageVersion: 'spatial-analysis-v1',
  manifestVersion: 'spatial-analysis-manifest-v1',
  datasetVersion: 'test-dataset',
  pollutant: 'PM10',
  sourceScope: 'measured',
  monthlySlices: [
    {
      label: '2026-01',
      sliceKind: 'month',
      status: 'ok',
      stationCount: 4,
      observationCount: 31,
      meanStationCompleteness: 0.84,
      surfaceValues: [52, 34],
      surfaceExceedanceRatios: [0.62, 0.18],
      krigingSurfaceValues: [50, 32],
      krigingSurfaceExceedanceRatios: [0.58, 0.16],
      idwRmse: 4.2,
      krigingRmse: 3.8,
      statistics: { mean: 43, min: 34, max: 52, median: 43, standardDeviation: 12.7 },
      topCells: [{ cellId: 'r000c000', value: 52 }],
      month: '2026-01',
    },
    {
      label: '2026-02',
      sliceKind: 'month',
      status: 'ok',
      stationCount: 4,
      observationCount: 28,
      meanStationCompleteness: 0.78,
      surfaceValues: [60, 39],
      surfaceExceedanceRatios: [0.71, 0.24],
      krigingUnavailableReason: "Kriging LOOCV hatasi IDW'den dusuk degil.",
      idwRmse: 4.1,
      krigingRmse: 4.6,
      statistics: { mean: 49.5, min: 39, max: 60, median: 49.5, standardDeviation: 14.8 },
      topCells: [{ cellId: 'r000c000', value: 60 }],
      month: '2026-02',
    },
  ],
  eventSlices: [
    {
      label: 'event-1',
      sliceKind: 'event',
      status: 'ok',
      stationCount: 4,
      observationCount: 3,
      meanStationCompleteness: 1,
      surfaceValues: [70, 45],
      surfaceExceedanceRatios: [0.95, 0.44],
      statistics: { mean: 57.5, min: 45, max: 70, median: 57.5, standardDeviation: 17.7 },
      topCells: [{ cellId: 'r000c000', value: 70 }],
      eventId: 'event-1',
      eventName: 'Test Event',
      startDate: '2026-02-10T00:00:00Z',
      endDate: '2026-02-12T00:00:00Z',
    },
  ],
  spatialStats: {
    monthlySlices: [
      {
        label: '2026-01',
        sliceKind: 'month',
        status: 'ok',
        stationCount: 6,
        observationCount: 31,
        meanStationCompleteness: 0.84,
        globalMoranI: 0.41,
        globalMoranZScore: 2.12,
        globalMoranPValue: 0.032,
        hotspots: [
          {
            stationId: 'station-a',
            stationName: 'Station A',
            lat: 40.01,
            lng: 29.01,
            value: 52,
            zScore: 2.35,
            pValue: 0.019,
            significance: 0.981,
            classification: 'hotspot-95',
          },
        ],
        month: '2026-01',
      },
      {
        label: '2026-02',
        sliceKind: 'month',
        status: 'ok',
        stationCount: 6,
        observationCount: 28,
        meanStationCompleteness: 0.78,
        globalMoranI: 0.45,
        globalMoranZScore: 2.4,
        globalMoranPValue: 0.021,
        hotspots: [
          {
            stationId: 'station-a',
            stationName: 'Station A',
            lat: 40.01,
            lng: 29.01,
            value: 60,
            zScore: 2.6,
            pValue: 0.01,
            significance: 0.99,
            classification: 'hotspot-99',
          },
        ],
        month: '2026-02',
      },
    ],
    eventSlices: [
      {
        label: 'event-1',
        sliceKind: 'event',
        status: 'ok',
        stationCount: 6,
        observationCount: 3,
        meanStationCompleteness: 1,
        globalMoranI: 0.5,
        globalMoranZScore: 2.8,
        globalMoranPValue: 0.01,
        hotspots: [
          {
            stationId: 'station-a',
            stationName: 'Station A',
            lat: 40.01,
            lng: 29.01,
            value: 70,
            zScore: 2.9,
            pValue: 0.008,
            significance: 0.992,
            classification: 'hotspot-99',
          },
        ],
        eventId: 'event-1',
        eventName: 'Test Event',
        startDate: '2026-02-10T00:00:00Z',
        endDate: '2026-02-12T00:00:00Z',
      },
    ],
  },
  riskOverlays: {
    monthlySlices: [
      {
        label: '2026-01',
        sliceKind: 'month',
        status: 'ok',
        stationCount: 6,
        observationCount: 31,
        meanStationCompleteness: 0.84,
        cells: [
          {
            cellId: 'r000c000',
            score: 0.74,
            label: 'Yuksek',
            pollutionComponent: 0.7,
            hotspotComponent: 0.6,
            proximityComponent: 0.8,
            greenDeficit: 0.76,
            topographicCompression: 0.3,
          },
          {
            cellId: 'r000c001',
            score: 0.28,
            label: 'Dusuk',
            pollutionComponent: 0.3,
            hotspotComponent: 0.2,
            proximityComponent: 0.2,
            greenDeficit: 0.58,
            topographicCompression: 0.22,
          },
        ],
        month: '2026-01',
      },
      {
        label: '2026-02',
        sliceKind: 'month',
        status: 'ok',
        stationCount: 6,
        observationCount: 28,
        meanStationCompleteness: 0.78,
        cells: [
          {
            cellId: 'r000c000',
            score: 0.8,
            label: 'Cok yuksek',
            pollutionComponent: 0.8,
            hotspotComponent: 0.72,
            proximityComponent: 0.8,
            greenDeficit: 0.76,
            topographicCompression: 0.34,
          },
          {
            cellId: 'r000c001',
            score: 0.31,
            label: 'Dusuk',
            pollutionComponent: 0.36,
            hotspotComponent: 0.18,
            proximityComponent: 0.2,
            greenDeficit: 0.58,
            topographicCompression: 0.24,
          },
        ],
        month: '2026-02',
      },
    ],
    eventSlices: [
      {
        label: 'event-1',
        sliceKind: 'event',
        status: 'ok',
        stationCount: 6,
        observationCount: 3,
        meanStationCompleteness: 1,
        cells: [
          {
            cellId: 'r000c000',
            score: 0.88,
            label: 'Cok yuksek',
            pollutionComponent: 0.92,
            hotspotComponent: 0.81,
            proximityComponent: 0.8,
            greenDeficit: 0.76,
            topographicCompression: 0.36,
          },
        ],
        eventId: 'event-1',
        eventName: 'Test Event',
        startDate: '2026-02-10T00:00:00Z',
        endDate: '2026-02-12T00:00:00Z',
      },
    ],
  },
  sourceSummaries: {
    monthlySlices: [
      {
        label: '2026-01',
        sliceKind: 'month',
        status: 'ok',
        stationCount: 4,
        observationCount: 31,
        meanStationCompleteness: 0.84,
        sampleCount: 2,
        modelScore: 0.61,
        prevailingWindDirection: 72,
        coefficients: [
          { key: 'industryProximity', label: 'Sanayi yakinligi', coefficient: 0.54 },
          { key: 'imperviousRatio', label: 'Gecirimsiz yuzey', coefficient: 0.31 },
          { key: 'greenRatio', label: 'Yesil oran', coefficient: -0.28 },
        ],
        month: '2026-01',
      },
      {
        label: '2026-02',
        sliceKind: 'month',
        status: 'ok',
        stationCount: 4,
        observationCount: 28,
        meanStationCompleteness: 0.78,
        sampleCount: 2,
        modelScore: 0.64,
        prevailingWindDirection: 80,
        coefficients: [
          { key: 'industryProximity', label: 'Sanayi yakinligi', coefficient: 0.58 },
          { key: 'roadDensity', label: 'Yol yogunlugu', coefficient: 0.26 },
          { key: 'greenRatio', label: 'Yesil oran', coefficient: -0.33 },
        ],
        month: '2026-02',
      },
    ],
    eventSlices: [
      {
        label: 'event-1',
        sliceKind: 'event',
        status: 'ok',
        stationCount: 4,
        observationCount: 3,
        meanStationCompleteness: 1,
        sampleCount: 2,
        modelScore: 0.69,
        prevailingWindDirection: 86,
        coefficients: [
          { key: 'industryProximity', label: 'Sanayi yakinligi', coefficient: 0.63 },
          { key: 'windAlignment', label: 'Ruzgar hizalanmasi', coefficient: 0.41 },
          { key: 'greenRatio', label: 'Yesil oran', coefficient: -0.29 },
        ],
        eventId: 'event-1',
        eventName: 'Test Event',
        startDate: '2026-02-10T00:00:00Z',
        endDate: '2026-02-12T00:00:00Z',
      },
    ],
  },
  forecasts: [
    {
      sliceId: 'forecast-measured-7',
      trainingScope: 'measured',
      generatedAt: '2026-04-01T10:00:00Z',
      horizonDays: 7,
      supported: true,
      mae: 4.3,
      rmse: 5.1,
      points: [
        {
          timestamp: '2026-03-01T00:00:00Z',
          value: 58,
          lower: 50,
          upper: 66,
        },
      ],
    },
    {
      sliceId: 'forecast-measured-30',
      trainingScope: 'measured',
      generatedAt: '2026-04-01T10:00:00Z',
      horizonDays: 30,
      supported: false,
      unavailableReason: 'Forecast bu kapsam icin desteklenmiyor.',
      mae: null,
      rmse: null,
      points: [],
    },
  ],
}

const measuredPlusSensorPackage = {
  ...measuredPackage,
  sourceScope: 'measured-plus-sensor',
  monthlySlices: [
    {
      ...measuredPackage.monthlySlices[0],
      surfaceValues: [55, 36],
      krigingSurfaceValues: [53, 34],
    },
    {
      ...measuredPackage.monthlySlices[1],
      surfaceValues: [63, 40],
      krigingSurfaceValues: [61, 38],
      krigingSurfaceExceedanceRatios: [0.69, 0.22],
      krigingUnavailableReason: undefined,
    },
  ],
  sourceSummaries: {
    monthlySlices: [
      {
        ...measuredPackage.sourceSummaries.monthlySlices[0],
        modelScore: 0.65,
      },
      {
        ...measuredPackage.sourceSummaries.monthlySlices[1],
        modelScore: 0.68,
      },
    ],
    eventSlices: measuredPackage.sourceSummaries.eventSlices,
  },
  forecasts: [
    {
      sliceId: 'forecast-measured-plus-sensor-7',
      trainingScope: 'measured-plus-sensor',
      generatedAt: '2026-04-01T10:00:00Z',
      horizonDays: 7,
      supported: true,
      mae: 3.9,
      rmse: 4.8,
      points: [
        {
          timestamp: '2026-03-01T00:00:00Z',
          value: 60,
          lower: 52,
          upper: 68,
        },
      ],
    },
  ],
}

const dataset: BursaDataset = {
  metadata: {
    version: 'test-dataset',
    generatedAt: '2026-04-01T10:00:00Z',
    coverageStart: '2026-01-01',
    coverageEnd: '2026-02-29',
    description: 'Spatial test dataset',
    methods: [],
    sourceNotes: [],
  },
  stations: [
    {
      id: 'station-a',
      name: 'Station A',
      district: 'Osmangazi',
      stationType: 'urban',
      lat: 40.01,
      lng: 29.01,
      elevationM: 120,
      pollutants: ['PM10'],
      dataSource: 'official',
      sourceId: 'station-a',
    },
    {
      id: 'station-modeled',
      name: 'Modeled',
      district: 'Osmangazi',
      stationType: 'modeled',
      lat: 40.03,
      lng: 29.03,
      elevationM: 120,
      pollutants: ['PM10'],
      dataSource: 'modeled',
      sourceId: 'station-modeled',
    },
  ],
  stationTimeSeries: [],
  meteoTimeSeries: [],
  contextMetrics: [],
  events: [
    {
      eventId: 'event-1',
      eventType: 'fire',
      analysisMode: 'spatial',
      name: 'Test Event',
      startDate: '2026-02-10T00:00:00Z',
      endDate: '2026-02-12T00:00:00Z',
      center: { lat: 40.02, lng: 29.02 },
      radiusKm: 6,
      source: 'test',
      confidence: 0.9,
      hotspotCount: 2,
      note: 'test',
    },
  ],
  neighborhoods: [],
  roads: [],
  industries: [],
  greenAreas: [],
  elevationGrid: [],
}

describe('spatial analysis loader', () => {
  beforeEach(() => {
    resetSpatialAnalysisCacheForTests()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('caches the manifest and grouped pollutant packages', async () => {
    const fetchMock = vi.fn(async (input: string) => {
      if (input.endsWith('/manifest.json')) {
        return new Response(JSON.stringify(rawManifest), { status: 200 })
      }

      if (input.endsWith('pm10-measured.json')) {
        return new Response(JSON.stringify(measuredPackage), { status: 200 })
      }

      if (input.endsWith('pm10-measured-plus-sensor.json')) {
        return new Response(JSON.stringify(measuredPlusSensorPackage), { status: 200 })
      }

      return new Response(null, { status: 404 })
    })

    vi.stubGlobal('fetch', fetchMock)

    const manifest = await loadAnalysisManifest()
    const packageData = await loadSpatialAnalysisPackage(manifest, 'PM10')
    await loadAnalysisManifest()
    await loadSpatialAnalysisPackage(manifest, 'PM10')

    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(manifest.packages).toHaveLength(1)
    expect(manifest.packages[0]?.availableTrainingScopes).toEqual([
      'measured',
      'measured-plus-sensor',
    ])
    expect(packageData.availableTrainingScopes).toEqual([
      'measured',
      'measured-plus-sensor',
    ])
    expect(packageData.availableMethods).toEqual(['idw', 'kriging'])
    expect(packageData.monthlySlices).toHaveLength(2)
    expect(packageData.sourceSummaries).toHaveLength(3)
    expect(packageData.forecasts).toHaveLength(3)
  })

  it('aggregates monthly slices, exposes forecasts, and blocks modeled-only selections', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string) => {
      if (input.endsWith('/manifest.json')) {
        return new Response(JSON.stringify(rawManifest), { status: 200 })
      }

      if (input.endsWith('pm10-measured.json')) {
        return new Response(JSON.stringify(measuredPackage), { status: 200 })
      }

      if (input.endsWith('pm10-measured-plus-sensor.json')) {
        return new Response(JSON.stringify(measuredPlusSensorPackage), { status: 200 })
      }

      return new Response(null, { status: 404 })
    }))

    const manifest = (await loadAnalysisManifest()) as AnalysisManifest
    const packageData = await loadSpatialAnalysisPackage(manifest, 'PM10')
    const resolved = resolveSpatialAnalysis(
      dataset,
      {
        ...DEFAULT_FILTERS,
        pollutant: 'PM10',
        surfaceMethod: 'kriging',
        startDate: '2026-01-01',
        endDate: '2026-02-29',
      },
      manifest,
      packageData,
    )

    expect(resolved.surface?.cells).toHaveLength(2)
    expect(resolved.surface?.requestedMethod).toBe('kriging')
    expect(resolved.surface?.effectiveMethod).toBe('idw')
    expect(resolved.surface?.usesFallbackMethod).toBe(true)
    expect(resolved.notices).toContain('Secili dilimde Kriging uygun bulunmadi; IDW yuzeyi kullanildi.')
    expect(resolved.surface?.topPollutedCells[0]?.id).toBe('r000c000')
    expect(resolved.surface?.highestExceedanceCells[0]?.exceedanceRatio).toBeGreaterThan(0.6)
    expect(resolved.stats?.globalMoranI).toBeGreaterThan(0.4)
    expect(resolved.stats?.topHotspots[0]?.stationId).toBe('station-a')
    expect(resolved.sourceSummary?.dominantDriver?.key).toBe('industryProximity')
    expect(resolved.sourceSummary?.modelScore).toBeGreaterThan(0.6)
    expect(resolved.risk?.topRiskCells[0]?.id).toBe('r000c000')
    expect(resolved.risk?.topRiskCells[0]?.score).toBeGreaterThan(0.7)
    expect(resolved.forecast?.forecasts[0]?.horizonDays).toBe(7)
    expect(resolved.forecast?.exportRows).toHaveLength(1)
    expect(resolved.surface?.topPollutedCells[0]?.value).toBeGreaterThan(
      resolved.surface?.cleanestCells[0]?.value ?? 0,
    )

    const blocked = resolveSpatialAnalysis(
      dataset,
      {
        ...DEFAULT_FILTERS,
        pollutant: 'PM10',
        stationSourceScope: 'modeled',
        startDate: '2026-01-01',
        endDate: '2026-02-29',
      },
      manifest,
      packageData,
    )

    expect(blocked.unsupportedReason).toContain('Model tabanli seri')
  })
})
