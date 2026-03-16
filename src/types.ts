export type Pollutant = 'PM10' | 'PM2.5' | 'NO2' | 'SO2' | 'O3' | 'CO'
export type StationSourceScope = 'official' | 'sensor' | 'modeled' | 'all'
export type StationDataSource = 'official' | 'municipal-sensor' | 'modeled'

export type TimeResolution = 'day' | 'month' | 'season' | 'year'

export type EventType =
  | 'fire'
  | 'industrial-fire'
  | 'dust-transport'
  | 'wind-event'

export type EventAnalysisMode = 'spatial' | 'temporal'

export type CompareMode =
  | 'month-over-month'
  | 'season-over-season'
  | 'same-month-years'

export type LayerKey =
  | 'pollutionSurface'
  | 'stations'
  | 'roads'
  | 'industries'
  | 'greenAreas'
  | 'elevation'

export interface DatasetMetadata {
  version: string
  generatedAt: string
  coverageStart: string
  coverageEnd: string
  description: string
  methods: string[]
  sourceNotes: string[]
  dataIssues?: DataIssue[]
  completenessOverview?: CompletenessOverviewRow[]
  stationCoverage?: StationCoverageRow[]
}

export interface DataIssue {
  id: string
  severity: 'info' | 'warning'
  source: string
  message: string
}

export interface CompletenessOverviewRow {
  pollutant: Pollutant
  actualCount: number
  expectedCount: number
  completenessRatio: number
}

export interface StationCoverageRow {
  stationId: string
  pollutant: Pollutant
  supported?: boolean
  actualCount: number
  expectedCount: number
  completenessRatio: number
  missingCount: number
}

export interface Station {
  id: string
  name: string
  district: string
  stationType: string
  lat: number
  lng: number
  elevationM: number
  pollutants: Pollutant[]
  dataSource?: StationDataSource
  operator?: string
  sourceId?: string
}

export interface StationTimeSeriesRecord {
  stationId: string
  timestamp: string
  pollutant: Pollutant
  value: number
  unit: string
  qualityFlag: 'valid' | 'estimated' | 'screened'
  source: string
}

export interface MeteoTimeSeriesRecord {
  stationIdOrGridId: string
  timestamp: string
  temperatureC: number
  humidityPct: number
  windSpeedMs: number
  windDirDeg: number
  precipitationMm: number
  source: string
}

export interface StationContextMetric {
  stationId: string
  radiusM: 250 | 500 | 1000
  buildingDensity: number
  roadDensity: number
  greenRatio: number
  imperviousRatio: number
  industryCount: number
  meanElevation: number
  slopeMean: number
}

export interface EventCatalogItem {
  eventId: string
  eventType: EventType
  analysisMode?: EventAnalysisMode
  name: string
  startDate: string
  endDate: string
  center: {
    lat: number
    lng: number
  }
  radiusKm: number
  source: string
  confidence: number
  hotspotCount: number
  note: string
  referenceUrl?: string
}

export interface LineFeature {
  id: string
  name: string
  category: string
  coordinates: [number, number][]
}

export interface PointFeature {
  id: string
  name: string
  category: string
  lat: number
  lng: number
}

export interface PolygonFeature {
  id: string
  name: string
  category: string
  value?: number
  coordinates: [number, number][]
}

export interface BursaDataset {
  metadata: DatasetMetadata
  stations: Station[]
  stationTimeSeries: StationTimeSeriesRecord[]
  meteoTimeSeries: MeteoTimeSeriesRecord[]
  contextMetrics: StationContextMetric[]
  events: EventCatalogItem[]
  roads: LineFeature[]
  industries: PointFeature[]
  greenAreas: PolygonFeature[]
  elevationGrid: PolygonFeature[]
}

export interface FilterState {
  pollutant: Pollutant
  stationId: string
  stationSourceScope: StationSourceScope
  eventId: string
  resolution: TimeResolution
  compareMode: CompareMode
  bufferRadius: 250 | 500 | 1000
  startDate: string
  endDate: string
  activeLayers: Record<LayerKey, boolean>
}

export interface TimeSeriesPoint {
  key: string
  label: string
  value: number
  count: number
  timestamp: string
}

export interface TrendSummary {
  tau: number
  pValue: number
  slope: number
  direction: 'increasing' | 'decreasing' | 'stable'
}

export interface MetricCardValue {
  label: string
  value: string
  detail: string
}

export interface SeasonalTrendSummary {
  tau: number
  pValue: number
  slopePerYear: number
  direction: 'increasing' | 'decreasing' | 'stable'
  seasonCount: number
}

export interface ChangePointSummary {
  label: string | null
  score: number
  direction: 'upward' | 'downward' | 'stable'
  meanShift: number | null
}

export interface ExceedanceEpisodeSummary {
  threshold: number
  exceedanceDays: number
  episodeCount: number
  longestRunDays: number
  currentRunDays: number
}

export interface KzDecompositionSummary {
  backgroundShare: number
  residualShare: number
  baselineChange: number
  residualStd: number
}

export interface ScientificDiagnosticCard {
  id: string
  title: string
  value: string
  detail: string
  helper: string
  tone: 'accent' | 'warning' | 'cool' | 'neutral'
  stats: string[]
}

export interface StationSnapshot {
  stationId: string
  currentValue: number
  anomalyZScore: number
  meanValue: number
}

export interface CorrelationRow {
  metric: string
  correlation: number
}

export interface EventImpactStation {
  stationId: string
  stationName: string
  distanceKm: number
  alignmentScore: number
  status: 'exposed' | 'control'
  beforeMean: number | null
  duringMean: number | null
  afterMean: number | null
  baselineMean: number | null
  deltaVsBaseline: number | null
}

export interface RoseBin {
  direction: string
  pollutionMean: number
  windMean: number
}

export interface AnalysisResult {
  stationSnapshots: StationSnapshot[]
  selectedStations: Station[]
  selectedContextMetrics: StationContextMetric[]
  aggregateSeries: TimeSeriesPoint[]
  comparisonSeries: TimeSeriesPoint[]
  overviewCards: MetricCardValue[]
  trendSummary: TrendSummary
  seasonalTrendSummary: SeasonalTrendSummary
  changePointSummary: ChangePointSummary
  exceedanceEpisodeSummary: ExceedanceEpisodeSummary
  kzDecompositionSummary: KzDecompositionSummary
  scientificDiagnostics: ScientificDiagnosticCard[]
  correlations: CorrelationRow[]
  roseData: RoseBin[]
  event: EventCatalogItem | null
  eventImpactRows: EventImpactStation[]
  exportRows: Record<string, string | number | null>[]
}
