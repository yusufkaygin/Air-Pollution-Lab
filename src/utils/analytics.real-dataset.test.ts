/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { DEFAULT_FILTERS } from '../constants'
import type { BursaDataset } from '../types'
import { analyzeDataset } from './analytics'

const dataset = JSON.parse(
  readFileSync(join(process.cwd(), 'public/data/bursa-air-quality-v1.json'), 'utf-8'),
) as BursaDataset

describe('real dataset integrity', () => {
  it('loads the official Bursa dataset instead of mock data', () => {
    const metadataText = JSON.stringify(dataset.metadata).toLowerCase()

    expect(dataset.metadata.version.startsWith('official-daily-')).toBe(true)
    expect(metadataText).not.toContain('mock')
    expect(metadataText).not.toContain('synthetic')
    expect(metadataText).not.toContain('sentetik')
    expect(metadataText).not.toContain('demo')
    expect(dataset.stationTimeSeries.length).toBeGreaterThan(1000)
    expect(dataset.meteoTimeSeries.length).toBeGreaterThan(1000)
    expect(dataset.events.length).toBeGreaterThan(0)
  })

  it('produces chart and table inputs from the real dataset', () => {
    const stationId = dataset.stations[0]?.id

    expect(stationId).toBeTruthy()

    const result = analyzeDataset(dataset, {
      ...DEFAULT_FILTERS,
      stationId: stationId ?? 'all',
      pollutant: 'PM10',
      resolution: 'month',
      bufferRadius: 500,
      startDate: dataset.metadata.coverageStart,
      endDate: dataset.metadata.coverageEnd,
    })

    expect(result.selectedStations).toHaveLength(1)
    expect(result.aggregateSeries.length).toBeGreaterThan(0)
    expect(result.overviewCards).toHaveLength(5)
    expect(result.scientificDiagnostics).toHaveLength(4)
    expect(result.roseData).toHaveLength(8)
    expect(result.selectedContextMetrics).toHaveLength(1)
    expect(result.exportRows).toHaveLength(result.aggregateSeries.length)
  })

  it('applies curated event ranges through the same analysis engine', () => {
    const selectedEvent = dataset.events[0]

    const result = analyzeDataset(dataset, {
      ...DEFAULT_FILTERS,
      eventId: selectedEvent.eventId,
      pollutant: 'PM10',
      resolution: 'day',
      bufferRadius: 500,
      startDate: selectedEvent.startDate.slice(0, 10),
      endDate: selectedEvent.endDate.slice(0, 10),
    })

    expect(result.event?.eventId).toBe(selectedEvent.eventId)
    expect(result.aggregateSeries.length).toBeGreaterThan(0)
    expect(result.exceedanceEpisodeSummary.episodeCount).toBeGreaterThanOrEqual(0)
  })
})
