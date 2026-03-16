import { addDays, subDays } from 'date-fns'

import { SCREENING_THRESHOLDS } from '../constants'
import type {
  AnalysisResult,
  BursaDataset,
  ChangePointSummary,
  CorrelationRow,
  ExceedanceEpisodeSummary,
  EventCatalogItem,
  EventImpactStation,
  FilterState,
  KzDecompositionSummary,
  MeteoTimeSeriesRecord,
  RoseBin,
  ScientificDiagnosticCard,
  SeasonalTrendSummary,
  Station,
  StationSourceScope,
  StationSnapshot,
  StationTimeSeriesRecord,
  TimeResolution,
  TimeSeriesPoint,
  TrendSummary,
} from '../types'
import { angularDifference, bearingDegrees, haversineDistanceKm } from './geo'
import { formatNumber, formatSigned } from './format'

const MONTH_NAMES = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara']
const SEASON_NAMES = ['Kış', 'İlkbahar', 'Yaz', 'Sonbahar'] as const
const COMPASS_LABELS = ['K', 'KD', 'D', 'GD', 'G', 'GB', 'B', 'KB']
const RESOLUTION_LABELS: Record<TimeResolution, string> = {
  day: 'günlük',
  month: 'aylık',
  season: 'mevsimlik',
  year: 'yıllık',
}

function stationMatchesScope(station: Station, scope: StationSourceScope) {
  if (scope === 'all') {
    return true
  }

  if (scope === 'official') {
    return station.dataSource === 'official' || !station.dataSource
  }

  if (scope === 'sensor') {
    return station.dataSource === 'municipal-sensor'
  }

  return station.dataSource === 'modeled'
}

function scopedStations(dataset: BursaDataset, filters: FilterState) {
  return dataset.stations.filter((station) =>
    stationMatchesScope(station, filters.stationSourceScope),
  )
}

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

function variance(values: number[]) {
  const sigma = standardDeviation(values)
  return sigma ** 2
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

function directionFromSlopeAndPValue(slope: number, pValue: number) {
  if (pValue >= 0.05 || slope === 0) {
    return 'stable' as const
  }

  return slope > 0 ? ('increasing' as const) : ('decreasing' as const)
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

function pairwiseSlope(
  left: TimeSeriesPoint,
  right: TimeSeriesPoint,
  denominator: number,
) {
  if (denominator === 0) {
    return null
  }

  return (right.value - left.value) / denominator
}

function calculateSeasonalTrend(series: TimeSeriesPoint[]): SeasonalTrendSummary {
  const seasonalBuckets = new Map<number, TimeSeriesPoint[]>()

  series.forEach((point) => {
    const month = Number(point.key.split('-')[1]) - 1
    const bucket = seasonalBuckets.get(month) ?? []
    bucket.push(point)
    seasonalBuckets.set(month, bucket)
  })

  let statistic = 0
  let varianceTotal = 0
  let pairCount = 0
  const slopes: number[] = []

  seasonalBuckets.forEach((bucket) => {
    const sorted = [...bucket].sort((left, right) => left.key.localeCompare(right.key))

    if (sorted.length < 2) {
      return
    }

    const n = sorted.length
    varianceTotal += (n * (n - 1) * (2 * n + 5)) / 18
    pairCount += (n * (n - 1)) / 2

    for (let leftIndex = 0; leftIndex < sorted.length - 1; leftIndex += 1) {
      for (
        let rightIndex = leftIndex + 1;
        rightIndex < sorted.length;
        rightIndex += 1
      ) {
        const left = sorted[leftIndex]
        const right = sorted[rightIndex]
        const leftYear = Number(left.key.split('-')[0])
        const rightYear = Number(right.key.split('-')[0])

        statistic += Math.sign(right.value - left.value)

        const slope = pairwiseSlope(left, right, rightYear - leftYear)
        if (slope !== null) {
          slopes.push(slope)
        }
      }
    }
  })

  if (pairCount === 0 || varianceTotal === 0) {
    return {
      tau: 0,
      pValue: 1,
      slopePerYear: 0,
      direction: 'stable',
      seasonCount: seasonalBuckets.size,
    }
  }

  const z =
    statistic > 0
      ? (statistic - 1) / Math.sqrt(varianceTotal)
      : statistic < 0
        ? (statistic + 1) / Math.sqrt(varianceTotal)
        : 0
  const pValue = 2 * (1 - normalCdf(Math.abs(z)))
  const tau = statistic / pairCount
  const slopePerYear = median(slopes)

  return {
    tau,
    pValue,
    slopePerYear,
    direction: directionFromSlopeAndPValue(slopePerYear, pValue),
    seasonCount: [...seasonalBuckets.values()].filter((bucket) => bucket.length >= 2).length,
  }
}

function calculateChangePoint(series: TimeSeriesPoint[]): ChangePointSummary {
  if (series.length < 6) {
    return {
      label: null,
      score: 0,
      direction: 'stable',
      meanShift: null,
    }
  }

  const monthMeans = new Map<number, number[]>()

  series.forEach((point) => {
    const month = Number(point.key.split('-')[1]) - 1
    const bucket = monthMeans.get(month) ?? []
    bucket.push(point.value)
    monthMeans.set(month, bucket)
  })

  const residuals = series.map((point) => {
    const month = Number(point.key.split('-')[1]) - 1
    const climatology = mean(monthMeans.get(month) ?? [point.value])
    return point.value - climatology
  })
  const sigma = standardDeviation(residuals) || 1
  let cumulative = 0
  let maxAbs = 0
  let breakIndex = -1

  residuals.forEach((residual, index) => {
    cumulative += residual / sigma
    const magnitude = Math.abs(cumulative)

    if (magnitude > maxAbs) {
      maxAbs = magnitude
      breakIndex = index
    }
  })

  if (breakIndex <= 0 || maxAbs < 1) {
    return {
      label: null,
      score: Number(maxAbs.toFixed(2)),
      direction: 'stable',
      meanShift: null,
    }
  }

  const beforeValues = series.slice(0, breakIndex).map((point) => point.value)
  const afterValues = series.slice(breakIndex).map((point) => point.value)
  const meanShift =
    beforeValues.length > 0 && afterValues.length > 0
      ? mean(afterValues) - mean(beforeValues)
      : null
  const direction =
    meanShift === null || Math.abs(meanShift) < 0.1
      ? 'stable'
      : meanShift > 0
        ? 'upward'
        : 'downward'

  return {
    label: series[breakIndex]?.label ?? null,
    score: Number(maxAbs.toFixed(2)),
    direction,
    meanShift,
  }
}

function differenceInCalendarDays(left: string, right: string) {
  const ms = parseDate(left).getTime() - parseDate(right).getTime()
  return Math.round(ms / 86_400_000)
}

function computeExceedanceEpisodes(
  records: StationTimeSeriesRecord[],
  pollutant: FilterState['pollutant'],
): ExceedanceEpisodeSummary {
  const threshold = SCREENING_THRESHOLDS[pollutant]
  const dailySeries = aggregateRecords(records, 'day')
  let exceedanceDays = 0
  let episodeCount = 0
  let longestRunDays = 0
  let currentRunDays = 0
  let previousExceedanceDate: string | null = null

  dailySeries.forEach((point) => {
    const exceedance = point.value > threshold

    if (!exceedance) {
      currentRunDays = 0
      previousExceedanceDate = null
      return
    }

    exceedanceDays += 1

    if (
      previousExceedanceDate &&
      differenceInCalendarDays(point.key, previousExceedanceDate) === 1
    ) {
      currentRunDays += 1
    } else {
      episodeCount += 1
      currentRunDays = 1
    }

    previousExceedanceDate = point.key
    longestRunDays = Math.max(longestRunDays, currentRunDays)
  })

  return {
    threshold,
    exceedanceDays,
    episodeCount,
    longestRunDays,
    currentRunDays,
  }
}

function movingAverage(values: number[], windowSize: number) {
  const halfWindow = Math.floor(windowSize / 2)

  return values.map((_, index) => {
    const slice = values.slice(
      Math.max(0, index - halfWindow),
      Math.min(values.length, index + halfWindow + 1),
    )

    return mean(slice)
  })
}

function kzFilter(values: number[], windowSize: number, iterations: number) {
  let filtered = [...values]

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    filtered = movingAverage(filtered, windowSize)
  }

  return filtered
}

function computeKzDecomposition(series: TimeSeriesPoint[]): KzDecompositionSummary {
  if (series.length < 5) {
    return {
      backgroundShare: 0,
      residualShare: 0,
      baselineChange: 0,
      residualStd: 0,
    }
  }

  const values = series.map((point) => point.value)
  const baseline = kzFilter(values, 5, 2)
  const residuals = values.map((value, index) => value - baseline[index])
  const totalVariance = variance(values) || 1
  const backgroundShare = Math.min(1, Math.max(0, variance(baseline) / totalVariance))
  const residualShare = Math.min(1, Math.max(0, variance(residuals) / totalVariance))

  return {
    backgroundShare,
    residualShare,
    baselineChange: baseline.at(-1)! - baseline[0]!,
    residualStd: standardDeviation(residuals),
  }
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

function computeMonthlyZScores(
  series: TimeSeriesPoint[],
  climatologySeries: TimeSeriesPoint[] = series,
) {
  const grouped = new Map<number, number[]>()

  climatologySeries.forEach((point) => {
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
  stations: Station[],
): StationSnapshot[] {
  return stations
    .map<StationSnapshot>((station) => {
      const selectedStationRecords = filterStationSeries(dataset, filters, [station.id]).sort(
        (left, right) => left.timestamp.localeCompare(right.timestamp),
      )
      const allStationRecords = dataset.stationTimeSeries
        .filter(
          (record) =>
            record.stationId === station.id && record.pollutant === filters.pollutant,
        )
        .sort((left, right) => left.timestamp.localeCompare(right.timestamp))
      const recent = selectedStationRecords.slice(-16)
      const monthlySeries = aggregateRecords(selectedStationRecords, 'month')
      const climatologyMonthlySeries = aggregateRecords(allStationRecords, 'month')
      const zScores = computeMonthlyZScores(monthlySeries, climatologyMonthlySeries)

      return {
        stationId: station.id,
        currentValue: mean(recent.map((record) => record.value)),
        anomalyZScore: zScores.at(-1) ?? 0,
        meanValue: mean(selectedStationRecords.map((record) => record.value)),
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
  stations: Station[],
): CorrelationRow[] {
  const metrics = dataset.contextMetrics.filter(
    (metric) => metric.radiusM === filters.bufferRadius,
  )

  const stationMeans = stations
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
    ['Bina yoğunluğu', joined.map((item) => item.metric.buildingDensity)],
    ['Yol yoğunluğu', joined.map((item) => item.metric.roadDensity)],
    ['Yeşil oranı', joined.map((item) => item.metric.greenRatio)],
    ['Geçirimsiz yüzey', joined.map((item) => item.metric.imperviousRatio)],
    ['Sanayi sayısı', joined.map((item) => item.metric.industryCount)],
    ['Ortalama yükseklik', joined.map((item) => item.metric.meanElevation)],
    ['Ortalama eğim', joined.map((item) => item.metric.slopeMean)],
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
  stationIds: string[],
): RoseBin[] {
  const activeStationIds =
    filters.stationId === 'all' ? stationIds : stationIds.filter((id) => id === filters.stationId)

  if (activeStationIds.length === 0) {
    return []
  }

  const meteoByTimestamp = new Map(
    dataset.meteoTimeSeries
      .filter(
        (record) =>
          activeStationIds.includes(record.stationIdOrGridId) &&
          isRecordInsideDateRange(record.timestamp, filters.startDate, filters.endDate),
      )
      .map((record) => [`${record.stationIdOrGridId}__${record.timestamp}`, record]),
  )

  const bins = new Map<string, { pollutant: number[]; wind: number[] }>()

  filterStationSeries(dataset, filters, activeStationIds).forEach((record) => {
    const meteo = meteoByTimestamp.get(`${record.stationId}__${record.timestamp}`)

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
  stations: Station[],
): EventImpactStation[] {
  if (!event || event.analysisMode === 'temporal') {
    return []
  }

  const eventStart = parseDate(event.startDate)
  const eventEnd = parseDate(event.endDate)

  return stations
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
        status: exposed ? 'exposed' : 'control',
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
      if (filters.stationId !== 'all') {
        if (left.stationId === filters.stationId && right.stationId !== filters.stationId) {
          return -1
        }
        if (right.stationId === filters.stationId && left.stationId !== filters.stationId) {
          return 1
        }
      }

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
  climatologyMonthlySeries: TimeSeriesPoint[],
  rawRecords: StationTimeSeriesRecord[],
  trendSummary: TrendSummary,
  filters: FilterState,
) {
  const zScores = computeMonthlyZScores(monthlySeries, climatologyMonthlySeries)
  const anomalyMean = mean(zScores)
  const threshold = SCREENING_THRESHOLDS[filters.pollutant]
  const screeningExceedances = aggregateRecords(rawRecords, 'day').filter(
    (point) => point.value > threshold,
  ).length
  const weekdayWeekendDiff = computeWeekdayWeekendDifference(rawRecords)

  return [
    {
      label: 'Ortalama konsantrasyon',
      value: `${formatNumber(mean(aggregateSeries.map((point) => point.value)))} µg/m3`,
      detail: `${RESOLUTION_LABELS[filters.resolution]} çözünürlükte ortalama`,
    },
    {
      label: 'Anomali z-skoru',
      value: formatSigned(anomalyMean, 2),
      detail: 'Aynı ayların tarihsel ortalamasına göre',
    },
    {
      label: 'Eşik aşımı',
      value: `${screeningExceedances}`,
      detail: `Günlük eşik > ${threshold}`,
    },
    {
      label: 'Hafta içi - hafta sonu',
      value: formatSigned(weekdayWeekendDiff),
      detail: 'Pozitif ise hafta içi daha yüksek',
    },
    {
      label: 'Trend',
      value: formatSigned(trendSummary.slope, 2),
      detail: `Mann-Kendall tau=${formatNumber(trendSummary.tau, 2)}, p=${formatNumber(trendSummary.pValue, 3)}`,
    },
  ]
}

function buildScientificDiagnostics(
  seasonalTrendSummary: SeasonalTrendSummary,
  changePointSummary: ChangePointSummary,
  exceedanceEpisodeSummary: ExceedanceEpisodeSummary,
  kzDecompositionSummary: KzDecompositionSummary,
): ScientificDiagnosticCard[] {
  const changeDirectionLabel =
    changePointSummary.direction === 'upward'
      ? 'Yukarı kırılma'
      : changePointSummary.direction === 'downward'
        ? 'Aşağı kırılma'
        : 'Belirgin kırılma yok'

  return [
    {
      id: 'seasonal-kendall',
      title: 'Seasonal Kendall',
      value:
        seasonalTrendSummary.direction === 'stable'
          ? 'Yatay eğilim'
          : `${formatSigned(seasonalTrendSummary.slopePerYear, 2)} µg/m3/yıl`,
      detail:
        seasonalTrendSummary.direction === 'stable'
          ? 'Mevsimsellik etkisi altında anlamlı yön bulunmadı.'
          : `Mevsim etkisi ayrıldığında seri ${seasonalTrendSummary.direction === 'increasing' ? 'artış' : 'azalış'} yönünde.`,
      helper:
        'Aynı ayları kendi geçmişleriyle karşılaştırarak mevsim döngüsünü baskılar ve uzun dönem trendi daha sağlam sınar.',
      tone:
        seasonalTrendSummary.direction === 'increasing'
          ? 'warning'
          : seasonalTrendSummary.direction === 'decreasing'
            ? 'cool'
            : 'neutral',
      stats: [
        `τs ${formatNumber(seasonalTrendSummary.tau, 2)}`,
        `p ${formatNumber(seasonalTrendSummary.pValue, 3)}`,
      ],
    },
    {
      id: 'cusum-break',
      title: 'CUSUM kırılması',
      value: changePointSummary.label ?? 'Kırılma yok',
      detail:
        changePointSummary.label && changePointSummary.meanShift !== null
          ? `${changeDirectionLabel}; ortalama kayma ${formatSigned(changePointSummary.meanShift, 1)} µg/m3.`
          : 'Seçili dönemde ortalamada belirgin bir yapısal kayma saptanmadı.',
      helper:
        'Kümülatif sapma serisi, ani rejim değişimleri veya olay sonrası seviyedeki kalıcı kaymaları görünür hale getirir.',
      tone:
        changePointSummary.direction === 'upward'
          ? 'warning'
          : changePointSummary.direction === 'downward'
            ? 'cool'
            : 'neutral',
      stats: [`Skor ${formatNumber(changePointSummary.score, 2)}σ`],
    },
    {
      id: 'exceedance-episodes',
      title: 'Aşım epizotları',
      value: `${exceedanceEpisodeSummary.episodeCount} epizot`,
      detail:
        exceedanceEpisodeSummary.exceedanceDays > 0
          ? `Eşik üstü toplam ${exceedanceEpisodeSummary.exceedanceDays} gün; en uzun seri ${exceedanceEpisodeSummary.longestRunDays} gün.`
          : 'Seçili dönemde tarama eşiğini aşan gün bulunmadı.',
      helper:
        'Tekil piklerden farklı olarak, ardışık aşım günlerini yakalar ve kalıcı kirlilik ataklarını ayrı bir olay olarak sayar.',
      tone: exceedanceEpisodeSummary.longestRunDays >= 3 ? 'warning' : 'accent',
      stats: [
        `Eşik ${formatNumber(exceedanceEpisodeSummary.threshold, 0)} µg/m3`,
        `Güncel seri ${exceedanceEpisodeSummary.currentRunDays} gün`,
      ],
    },
    {
      id: 'kz-decomposition',
      title: 'KZ ayrıştırma',
      value: `%${Math.round(kzDecompositionSummary.backgroundShare * 100)} arka plan`,
      detail: `Kısa dönem oynaklık payı %${Math.round(kzDecompositionSummary.residualShare * 100)}; arka plan değişimi ${formatSigned(kzDecompositionSummary.baselineChange, 1)} µg/m3.`,
      helper:
        'Kolmogorov-Zurbenko filtresi, uzun dönem arka planı ile kısa dönem olay/meteoroloji sinyalini ayırarak bozulmanın kaynağını daha okunur yapar.',
      tone: kzDecompositionSummary.residualShare >= 0.45 ? 'accent' : 'cool',
      stats: [`Artık std ${formatNumber(kzDecompositionSummary.residualStd, 1)} µg/m3`],
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
  if (filters.eventId) {
    return dataset.events.find((event) => event.eventId === filters.eventId) ?? null
  }

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
  const availableStations = scopedStations(dataset, filters)
  const selectedStations =
    filters.stationId === 'all'
      ? availableStations
      : availableStations.filter((station) => station.id === filters.stationId)
  const rawRecords = filterStationSeries(
    dataset,
    filters,
    selectedStations.map((station) => station.id),
  )
  const climatologyRecords = dataset.stationTimeSeries.filter(
    (record) =>
      record.pollutant === filters.pollutant &&
      selectedStations.some((station) => station.id === record.stationId),
  )
  const aggregateSeries = aggregateRecords(rawRecords, filters.resolution)
  const monthlySeries = aggregateRecords(rawRecords, 'month')
  const climatologyMonthlySeries = aggregateRecords(climatologyRecords, 'month')
  const trendSummary = calculateTrend(monthlySeries)
  const seasonalTrendSummary = calculateSeasonalTrend(monthlySeries)
  const changePointSummary = calculateChangePoint(monthlySeries)
  const exceedanceEpisodeSummary = computeExceedanceEpisodes(
    rawRecords,
    filters.pollutant,
  )
  const kzDecompositionSummary = computeKzDecomposition(monthlySeries)
  const selectedContextMetrics = buildContextSelection(
    dataset,
    selectedStations,
    filters.bufferRadius,
  )
  const event = pickEvent(dataset, filters)
  const scientificDiagnostics = buildScientificDiagnostics(
    seasonalTrendSummary,
    changePointSummary,
    exceedanceEpisodeSummary,
    kzDecompositionSummary,
  )

  return {
    stationSnapshots: computeStationSnapshots(dataset, filters, availableStations),
    selectedStations,
    selectedContextMetrics,
    aggregateSeries,
    comparisonSeries: buildComparisonSeries(rawRecords, filters),
    overviewCards: buildOverviewCards(
      aggregateSeries,
      monthlySeries,
      climatologyMonthlySeries,
      rawRecords,
      trendSummary,
      filters,
    ),
    trendSummary,
    seasonalTrendSummary,
    changePointSummary,
    exceedanceEpisodeSummary,
    kzDecompositionSummary,
    scientificDiagnostics,
    correlations: computeCorrelations(dataset, filters, availableStations),
    roseData: computeRoseData(
      dataset,
      filters,
      selectedStations.map((station) => station.id),
    ),
    event,
    eventImpactRows: computeEventImpact(dataset, filters, event, availableStations),
    exportRows: aggregateSeries.map((point) => ({
      bucket: point.label,
      key: point.key,
      value: Number(point.value.toFixed(3)),
      count: point.count,
      pollutant: filters.pollutant,
      resolution: RESOLUTION_LABELS[filters.resolution],
      station_selection:
        filters.stationId === 'all'
          ? 'Bursa çoklu istasyon ortalaması'
          : selectedStations[0]?.name ?? filters.stationId,
      start_date: filters.startDate || dataset.metadata.coverageStart,
      end_date: filters.endDate || dataset.metadata.coverageEnd,
    })),
  }
}
