import { addDays, subDays } from 'date-fns'

import { SCREENING_THRESHOLDS } from '../constants'
import type {
  AnalysisResult,
  BursaDataset,
  CorrelationRow,
  EventCatalogItem,
  EventImpactStation,
  FilterState,
  MeteoTimeSeriesRecord,
  RoseBin,
  Station,
  StationSnapshot,
  StationTimeSeriesRecord,
  TimeResolution,
  TimeSeriesPoint,
  TrendSummary,
} from '../types'
import { angularDifference, bearingDegrees, haversineDistanceKm } from './geo'
import { formatNumber, formatSigned } from './format'

const MONTH_NAMES = ['Oca', 'Sub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Agu', 'Eyl', 'Eki', 'Kas', 'Ara']
const SEASON_NAMES = ['Kis', 'Ilkbahar', 'Yaz', 'Sonbahar'] as const
const COMPASS_LABELS = ['K', 'KD', 'D', 'GD', 'G', 'GB', 'B', 'KB']

function mean(values: number[]) {
  if (values.length === 0) {
    return 0
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function standardDeviation(values: number[]) {
  if (values.length < 2) {
    return 0
  }

  const average = mean(values)
  const variance =
    values.reduce((sum, value) => sum + (value - average) ** 2, 0) /
    (values.length - 1)

  return Math.sqrt(variance)
}

function median(values: number[]) {
  if (values.length === 0) {
    return 0
  }

  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)

  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle]
}

function pearsonCorrelation(xs: number[], ys: number[]) {
  if (xs.length !== ys.length || xs.length < 2) {
    return 0
  }

  const meanX = mean(xs)
  const meanY = mean(ys)

  let numerator = 0
  let left = 0
  let right = 0

  for (let index = 0; index < xs.length; index += 1) {
    const xDiff = xs[index] - meanX
    const yDiff = ys[index] - meanY
    numerator += xDiff * yDiff
    left += xDiff ** 2
    right += yDiff ** 2
  }

  if (left === 0 || right === 0) {
    return 0
  }

  return numerator / Math.sqrt(left * right)
}

function normalCdf(value: number) {
  const sign = value < 0 ? -1 : 1
  const x = Math.abs(value) / Math.sqrt(2)
  const t = 1 / (1 + 0.3275911 * x)
  const polynomial =
    (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) *
      t +
      0.254829592) *
      t)
  const erf = sign * (1 - polynomial * Math.exp(-x * x))

  return (1 + erf) / 2
}

function parseDate(value: string) {
  return new Date(value)
}

function isRecordInsideDateRange(
  timestamp: string,
  startDate: string,
  endDate: string,
) {
  const date = timestamp.slice(0, 10)

  if (startDate && date < startDate) {
    return false
  }

  if (endDate && date > endDate) {
    return false
  }

  return true
}

function doesEventOverlapRange(
  event: EventCatalogItem,
  startDate: string,
  endDate: string,
) {
  if (!startDate && !endDate) {
    return true
  }

  const eventStart = event.startDate.slice(0, 10)
  const eventEnd = event.endDate.slice(0, 10)

  if (startDate && eventEnd < startDate) {
    return false
  }

  if (endDate && eventStart > endDate) {
    return false
  }

  return true
}

function seasonIndexForMonth(month: number) {
  if (month === 11 || month === 0 || month === 1) {
    return 0
  }

  if (month >= 2 && month <= 4) {
    return 1
  }

  if (month >= 5 && month <= 7) {
    return 2
  }

  return 3
}

function seasonYear(date: Date) {
  return date.getUTCMonth() === 11 ? date.getUTCFullYear() + 1 : date.getUTCFullYear()
}

function bucketInfo(date: Date, resolution: TimeResolution) {
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth()
  const day = date.getUTCDate()

  if (resolution === 'day') {
    return {
      key: date.toISOString().slice(0, 10),
      label: `${String(day).padStart(2, '0')} ${MONTH_NAMES[month]} ${year}`,
    }
  }

  if (resolution === 'month') {
    return {
      key: `${year}-${String(month + 1).padStart(2, '0')}`,
      label: `${MONTH_NAMES[month]} ${year}`,
    }
  }

  if (resolution === 'season') {
    const season = seasonIndexForMonth(month)
    return {
      key: `${seasonYear(date)}-${season}`,
      label: `${SEASON_NAMES[season]} ${seasonYear(date)}`,
    }
  }

  return { key: String(year), label: String(year) }
}

function aggregateRecords(
  records: StationTimeSeriesRecord[],
  resolution: TimeResolution,
) {
  const grouped = new Map<string, TimeSeriesPoint>()

  records.forEach((record) => {
    const info = bucketInfo(parseDate(record.timestamp), resolution)
    const existing = grouped.get(info.key)

    if (existing) {
      existing.value += record.value
      existing.count += 1
      return
    }

    grouped.set(info.key, {
      key: info.key,
      label: info.label,
      value: record.value,
      count: 1,
      timestamp: record.timestamp,
    })
  })

  return [...grouped.values()]
    .map((point) => ({
      ...point,
      value: point.value / point.count,
    }))
    .sort((left, right) => left.key.localeCompare(right.key))
}

function calculateTrend(series: TimeSeriesPoint[]): TrendSummary {
  const values = series.map((point) => point.value)

  if (values.length < 4) {
    return {
      tau: 0,
      pValue: 1,
      slope: 0,
      direction: 'stable',
    }
  }

  let statistic = 0

  for (let left = 0; left < values.length - 1; left += 1) {
    for (let right = left + 1; right < values.length; right += 1) {
      statistic += Math.sign(values[right] - values[left])
    }
  }

  const n = values.length
  const variance = (n * (n - 1) * (2 * n + 5)) / 18
  const z =
    statistic > 0
      ? (statistic - 1) / Math.sqrt(variance)
      : statistic < 0
        ? (statistic + 1) / Math.sqrt(variance)
        : 0
  const pValue = 2 * (1 - normalCdf(Math.abs(z)))
  const tau = statistic / (0.5 * n * (n - 1))
  const slopes: number[] = []

  for (let left = 0; left < values.length - 1; left += 1) {
    for (let right = left + 1; right < values.length; right += 1) {
      slopes.push((values[right] - values[left]) / (right - left))
    }
  }

  const slope = median(slopes)
  const direction =
    pValue < 0.05
      ? slope > 0
        ? 'increasing'
        : 'decreasing'
      : 'stable'

  return { tau, pValue, slope, direction }
}

function computeMonthlyZScores(series: TimeSeriesPoint[]) {
  const grouped = new Map<number, number[]>()

  series.forEach((point) => {
    const month = new Date(`${point.key}-01T00:00:00Z`).getUTCMonth()
    const values = grouped.get(month) ?? []
    values.push(point.value)
    grouped.set(month, values)
  })

  return series.map((point) => {
    const month = new Date(`${point.key}-01T00:00:00Z`).getUTCMonth()
    const values = grouped.get(month) ?? []
    const sigma = standardDeviation(values)

    if (sigma === 0) {
      return 0
    }

    return (point.value - mean(values)) / sigma
  })
}

function filterStationSeries(
  dataset: BursaDataset,
  filters: FilterState,
  stationIds: string[],
) {
  return dataset.stationTimeSeries.filter(
    (record) =>
      record.pollutant === filters.pollutant &&
      stationIds.includes(record.stationId) &&
      isRecordInsideDateRange(record.timestamp, filters.startDate, filters.endDate),
  )
}

function computeStationSnapshots(
  dataset: BursaDataset,
  filters: FilterState,
): StationSnapshot[] {
  return dataset.stations
    .map<StationSnapshot>((station) => {
      const stationRecords = filterStationSeries(dataset, filters, [station.id]).sort(
        (left, right) => left.timestamp.localeCompare(right.timestamp),
      )
      const recent = stationRecords.slice(-16)
      const monthlySeries = aggregateRecords(stationRecords, 'month')
      const zScores = computeMonthlyZScores(monthlySeries)

      return {
        stationId: station.id,
        currentValue: mean(recent.map((record) => record.value)),
        anomalyZScore: zScores.at(-1) ?? 0,
        meanValue: mean(stationRecords.map((record) => record.value)),
      }
    })
    .sort((left, right) => right.currentValue - left.currentValue)
}

function computeWeekdayWeekendDifference(records: StationTimeSeriesRecord[]) {
  const weekdayValues: number[] = []
  const weekendValues: number[] = []

  records.forEach((record) => {
    const day = parseDate(record.timestamp).getUTCDay()

    if (day === 0 || day === 6) {
      weekendValues.push(record.value)
      return
    }

    weekdayValues.push(record.value)
  })

  return mean(weekdayValues) - mean(weekendValues)
}

function buildComparisonSeries(
  records: StationTimeSeriesRecord[],
  filters: FilterState,
) {
  if (filters.compareMode === 'month-over-month') {
    return aggregateRecords(records, 'month').slice(-18)
  }

  if (filters.compareMode === 'season-over-season') {
    return aggregateRecords(records, 'season').slice(-12)
  }

  const monthlySeries = aggregateRecords(records, 'month')
  const latest = monthlySeries.at(-1)

  if (!latest) {
    return []
  }

  const month = Number(latest.key.split('-')[1])
  return monthlySeries.filter((point) => Number(point.key.split('-')[1]) === month)
}

function computeCorrelations(
  dataset: BursaDataset,
  filters: FilterState,
): CorrelationRow[] {
  const metrics = dataset.contextMetrics.filter(
    (metric) => metric.radiusM === filters.bufferRadius,
  )

  const stationMeans = dataset.stations
    .map((station) => {
      const values = filterStationSeries(dataset, filters, [station.id]).map(
        (record) => record.value,
      )

      return {
        stationId: station.id,
        mean: mean(values),
      }
    })
    .filter((item) => item.mean > 0)

  const joined = metrics
    .map((metric) => ({
      metric,
      stationMean:
        stationMeans.find((stationMean) => stationMean.stationId === metric.stationId)
          ?.mean ?? 0,
    }))
    .filter((item) => item.stationMean > 0)

  const pollutantMeans = joined.map((item) => item.stationMean)
  const metricRows: Array<[string, number[]]> = [
    ['Bina yogunlugu', joined.map((item) => item.metric.buildingDensity)],
    ['Yol yogunlugu', joined.map((item) => item.metric.roadDensity)],
    ['Yesil orani', joined.map((item) => item.metric.greenRatio)],
    ['Gecirimsiz yuzey', joined.map((item) => item.metric.imperviousRatio)],
    ['Sanayi sayisi', joined.map((item) => item.metric.industryCount)],
    ['Ortalama yukseklik', joined.map((item) => item.metric.meanElevation)],
    ['Ortalama egim', joined.map((item) => item.metric.slopeMean)],
  ]

  return metricRows
    .map(([metric, values]) => ({
      metric,
      correlation: pearsonCorrelation(values, pollutantMeans),
    }))
    .sort((left, right) => Math.abs(right.correlation) - Math.abs(left.correlation))
}

function compassLabel(angle: number) {
  return COMPASS_LABELS[Math.round(angle / 45) % 8]
}

function circularMean(records: MeteoTimeSeriesRecord[]) {
  if (records.length === 0) {
    return 0
  }

  const sinTotal = records.reduce(
    (sum, record) => sum + Math.sin((record.windDirDeg * Math.PI) / 180),
    0,
  )
  const cosTotal = records.reduce(
    (sum, record) => sum + Math.cos((record.windDirDeg * Math.PI) / 180),
    0,
  )

  return (((Math.atan2(sinTotal, cosTotal) * 180) / Math.PI) + 360) % 360
}

function computeRoseData(
  dataset: BursaDataset,
  filters: FilterState,
  fallbackStationId: string | undefined,
): RoseBin[] {
  const stationId = filters.stationId === 'all' ? fallbackStationId : filters.stationId

  if (!stationId) {
    return []
  }

  const meteoByTimestamp = new Map(
    dataset.meteoTimeSeries
      .filter(
        (record) =>
          record.stationIdOrGridId === stationId &&
          isRecordInsideDateRange(record.timestamp, filters.startDate, filters.endDate),
      )
      .map((record) => [record.timestamp, record]),
  )

  const bins = new Map<string, { pollutant: number[]; wind: number[] }>()

  filterStationSeries(dataset, filters, [stationId]).forEach((record) => {
    const meteo = meteoByTimestamp.get(record.timestamp)

    if (!meteo) {
      return
    }

    const direction = compassLabel(meteo.windDirDeg)
    const entry = bins.get(direction) ?? { pollutant: [], wind: [] }
    entry.pollutant.push(record.value)
    entry.wind.push(meteo.windSpeedMs)
    bins.set(direction, entry)
  })

  return COMPASS_LABELS.map((direction) => {
    const values = bins.get(direction)
    return {
      direction,
      pollutionMean: values ? mean(values.pollutant) : 0,
      windMean: values ? mean(values.wind) : 0,
    }
  })
}

function meanForWindow(
  records: StationTimeSeriesRecord[],
  start: Date,
  end: Date,
) {
  const values = records
    .filter((record) => {
      const timestamp = parseDate(record.timestamp)
      return timestamp >= start && timestamp <= end
    })
    .map((record) => record.value)

  return values.length > 0 ? mean(values) : null
}

function baselineMeanForEvent(
  records: StationTimeSeriesRecord[],
  event: EventCatalogItem,
) {
  const eventStart = parseDate(event.startDate)
  const month = eventStart.getUTCMonth()
  const year = eventStart.getUTCFullYear()
  const values = records
    .filter((record) => {
      const timestamp = parseDate(record.timestamp)
      return timestamp.getUTCMonth() === month && timestamp.getUTCFullYear() !== year
    })
    .map((record) => record.value)

  return values.length > 0 ? mean(values) : null
}

function computeEventImpact(
  dataset: BursaDataset,
  filters: FilterState,
  event: EventCatalogItem | null,
): EventImpactStation[] {
  if (!event) {
    return []
  }

  const eventStart = parseDate(event.startDate)
  const eventEnd = parseDate(event.endDate)

  return dataset.stations
    .map<EventImpactStation>((station) => {
      const stationRecords = dataset.stationTimeSeries.filter(
        (record) =>
          record.stationId === station.id && record.pollutant === filters.pollutant,
      )
      const meteoRecords = dataset.meteoTimeSeries.filter(
        (record) =>
          record.stationIdOrGridId === station.id &&
          parseDate(record.timestamp) >= eventStart &&
          parseDate(record.timestamp) <= eventEnd,
      )
      const distanceKm = haversineDistanceKm(event.center, {
        lat: station.lat,
        lng: station.lng,
      })
      const transportDirection = (circularMean(meteoRecords) + 180) % 360
      const eventBearing = bearingDegrees(event.center, {
        lat: station.lat,
        lng: station.lng,
      })
      const alignmentScore = Math.cos(
        (angularDifference(transportDirection, eventBearing) * Math.PI) / 180,
      )
      const beforeMean = meanForWindow(
        stationRecords,
        subDays(eventStart, 7),
        subDays(eventStart, 1),
      )
      const duringMean = meanForWindow(stationRecords, eventStart, eventEnd)
      const afterMean = meanForWindow(
        stationRecords,
        addDays(eventEnd, 4),
        addDays(eventEnd, 14),
      )
      const baselineMean = baselineMeanForEvent(stationRecords, event)
      const exposed = distanceKm <= event.radiusKm * 5 && alignmentScore > 0.15

      return {
        stationId: station.id,
        stationName: station.name,
        distanceKm,
        alignmentScore,
        status: exposed || filters.stationId === station.id ? 'exposed' : 'control',
        beforeMean,
        duringMean,
        afterMean,
        baselineMean,
        deltaVsBaseline:
          duringMean !== null && baselineMean !== null
            ? duringMean - baselineMean
            : null,
      }
    })
    .sort((left, right) => {
      if (left.status === right.status) {
        return left.distanceKm - right.distanceKm
      }

      return left.status === 'exposed' ? -1 : 1
    })
    .slice(0, 6)
}

function buildOverviewCards(
  aggregateSeries: TimeSeriesPoint[],
  monthlySeries: TimeSeriesPoint[],
  rawRecords: StationTimeSeriesRecord[],
  trendSummary: TrendSummary,
  filters: FilterState,
) {
  const zScores = computeMonthlyZScores(monthlySeries)
  const anomalyMean = mean(zScores)
  const threshold = SCREENING_THRESHOLDS[filters.pollutant]
  const screeningExceedances = rawRecords.filter((record) => record.value > threshold).length
  const weekdayWeekendDiff = computeWeekdayWeekendDifference(rawRecords)

  return [
    {
      label: 'Ortalama konsantrasyon',
      value: `${formatNumber(mean(aggregateSeries.map((point) => point.value)))} ug/m3`,
      detail: `${filters.resolution} cozunurlukte ortalama`,
    },
    {
      label: 'Anomali z-skoru',
      value: formatSigned(anomalyMean, 2),
      detail: 'Ayni aylarin tarihsel ortalamasina gore',
    },
    {
      label: 'Esik asimi',
      value: `${screeningExceedances}`,
      detail: `Gunluk esik > ${threshold}`,
    },
    {
      label: 'Hafta ici - hafta sonu',
      value: formatSigned(weekdayWeekendDiff),
      detail: 'Pozitif ise hafta ici daha yuksek',
    },
    {
      label: 'Trend',
      value: formatSigned(trendSummary.slope, 2),
      detail: `Mann-Kendall tau=${formatNumber(trendSummary.tau, 2)}, p=${formatNumber(trendSummary.pValue, 3)}`,
    },
  ]
}

function buildContextSelection(
  dataset: BursaDataset,
  selectedStations: Station[],
  bufferRadius: 250 | 500 | 1000,
) {
  return dataset.contextMetrics.filter(
    (metric) =>
      metric.radiusM === bufferRadius &&
      selectedStations.some((station) => station.id === metric.stationId),
  )
}

function pickEvent(dataset: BursaDataset, filters: FilterState) {
  const overlappingEvents = dataset.events.filter((event) =>
    doesEventOverlapRange(event, filters.startDate, filters.endDate),
  )

  if (overlappingEvents.length > 0) {
    return overlappingEvents[0]
  }

  if (!filters.startDate && !filters.endDate) {
    return dataset.events[0] ?? null
  }

  return null
}

export function analyzeDataset(
  dataset: BursaDataset,
  filters: FilterState,
): AnalysisResult {
  const selectedStations =
    filters.stationId === 'all'
      ? dataset.stations
      : dataset.stations.filter((station) => station.id === filters.stationId)
  const rawRecords = filterStationSeries(
    dataset,
    filters,
    selectedStations.map((station) => station.id),
  )
  const aggregateSeries = aggregateRecords(rawRecords, filters.resolution)
  const monthlySeries = aggregateRecords(rawRecords, 'month')
  const trendSummary = calculateTrend(monthlySeries)
  const selectedContextMetrics = buildContextSelection(
    dataset,
    selectedStations,
    filters.bufferRadius,
  )
  const event = pickEvent(dataset, filters)

  return {
    stationSnapshots: computeStationSnapshots(dataset, filters),
    selectedStations,
    selectedContextMetrics,
    aggregateSeries,
    comparisonSeries: buildComparisonSeries(rawRecords, filters),
    overviewCards: buildOverviewCards(
      aggregateSeries,
      monthlySeries,
      rawRecords,
      trendSummary,
      filters,
    ),
    trendSummary,
    correlations: computeCorrelations(dataset, filters),
    roseData: computeRoseData(dataset, filters, selectedStations[0]?.id),
    event,
    eventImpactRows: computeEventImpact(dataset, filters, event),
    exportRows: aggregateSeries.map((point) => ({
      bucket: point.label,
      key: point.key,
      value: Number(point.value.toFixed(3)),
      count: point.count,
      pollutant: filters.pollutant,
      resolution: filters.resolution,
      station_selection:
        filters.stationId === 'all'
          ? 'Bursa coklu istasyon ortalamasi'
          : selectedStations[0]?.name ?? filters.stationId,
      start_date: filters.startDate || dataset.metadata.coverageStart,
      end_date: filters.endDate || dataset.metadata.coverageEnd,
    })),
  }
}
