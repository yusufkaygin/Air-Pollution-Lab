export type Pollutant = 'PM10' | 'PM2.5' | 'NO2' | 'SO2' | 'O3' | 'CO'
export type StationSourceScope =
  | 'official'
  | 'municipal-official'
  | 'sensor'
  | 'modeled'
  | 'all'
export type StationDataSource =
  | 'official'
  | 'municipal-official'
  | 'municipal-sensor'
  | 'modeled'

export type TimeResolution = 'day' | 'month' | 'season' | 'year'
export type SurfaceMethod = 'idw' | 'kriging'
export type SpatialTrainingScope = 'measured' | 'measured-plus-sensor'
export type AnalysisTab = 'general' | 'spatial' | 'spatial-stats' | 'forecast'

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
  | 'interpolationSurface'
  | 'hotspots'
  | 'risk'
  | 'proximity'
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
  locationApproximate?: boolean
  locationConfidence?: 'high' | 'medium' | 'low'
  locationBasis?: string
  locationSourceUrl?: string
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

export interface MapLayerBundle {
  roads: LineFeature[]
  industries: PointFeature[]
  greenAreas: PolygonFeature[]
  elevationGrid: PolygonFeature[]
}

export interface SpatialGridCell {
  id: string
  row: number
  col: number
  center: {
    lat: number
    lng: number
  }
  coordinates: [number, number][]
}

export interface SpatialGridSpec {
  cellSizeKm: number
  rows: number
  cols: number
  bounds: {
    south: number
    west: number
    north: number
    east: number
  }
  boundaryApproximate?: boolean
  cellIds: string[]
}

export interface SpatialCellContext {
  cellId: string
  roadDensity: number
  greenRatio: number
  imperviousRatio: number
  industryCountWithin3Km: number
  meanElevation: number
  slopeMean: number
  nearestPrimaryRoadM: number | null
  nearestIndustryM: number | null
  proximityIndex: number
}

export interface SpatialSurfaceCellValue {
  cellId: string
  value: number | null
  pollutionLoad: number | null
  exceedanceRatio: number | null
}

export interface SpatialSurfaceSlicePayload {
  supported: boolean
  unavailableReason?: string
  eligibleStationCount: number
  meanStationCompleteness: number
  cellValues: SpatialSurfaceCellValue[]
}

export interface SpatialSurfaceSlice {
  sliceId: string
  label: string
  startDate: string
  endDate: string
  days: number
  surfaces: Record<
    SpatialTrainingScope,
    Record<SurfaceMethod, SpatialSurfaceSlicePayload>
  >
}

export interface SpatialHotspotCell {
  stationId: string
  stationName: string
  lat: number
  lng: number
  value: number
  zScore: number
  pValue: number | null
  significance: number
  classification:
    | 'hotspot-99'
    | 'hotspot-95'
    | 'hotspot-90'
    | 'coldspot-99'
    | 'coldspot-95'
    | 'coldspot-90'
    | 'not-significant'
}

export interface SpatialStatsSlicePayload {
  supported: boolean
  unavailableReason?: string
  eligibleStationCount: number
  meanStationCompleteness: number
  globalMoranI: number | null
  globalMoranZScore: number | null
  globalMoranPValue: number | null
  hotspots: SpatialHotspotCell[]
}

export interface SpatialStatsSlice {
  sliceId: string
  label: string
  startDate: string
  endDate: string
  scopes: Record<SpatialTrainingScope, SpatialStatsSlicePayload>
}

export interface RiskOverlayCell {
  cellId: string
  score: number
  label: string
  pollutionComponent: number
  hotspotComponent: number
  proximityComponent: number
  greenDeficit: number
  topographicCompression: number
}

export interface RiskOverlaySlicePayload {
  supported: boolean
  unavailableReason?: string
  eligibleStationCount: number
  meanStationCompleteness: number
  cells: RiskOverlayCell[]
}

export interface RiskOverlaySlice {
  sliceId: string
  label: string
  startDate: string
  endDate: string
  scopes: Record<SpatialTrainingScope, RiskOverlaySlicePayload>
}

export interface SourceDriverCoefficient {
  key:
    | 'roadDensity'
    | 'industryProximity'
    | 'greenRatio'
    | 'imperviousRatio'
    | 'meanElevation'
    | 'slopeMean'
    | 'windAlignment'
  label: string
  coefficient: number
}

export interface SourceSummarySlicePayload {
  supported: boolean
  unavailableReason?: string
  sampleCount: number
  meanStationCompleteness: number
  modelScore: number | null
  prevailingWindDirection: number | null
  coefficients: SourceDriverCoefficient[]
}

export interface SourceSummarySlice {
  sliceId: string
  label: string
  startDate: string
  endDate: string
  scopes: Record<SpatialTrainingScope, SourceSummarySlicePayload>
}

export interface ForecastPoint {
  timestamp: string
  value: number
  lower: number | null
  upper: number | null
}

export interface ForecastSlice {
  sliceId: string
  trainingScope: SpatialTrainingScope
  generatedAt: string
  horizonDays: 7 | 30
  supported: boolean
  unavailableReason?: string
  mae: number | null
  rmse: number | null
  points: ForecastPoint[]
}

export interface SpatialAnalysisPackage {
  manifestVersion: string
  generatedAt: string
  coreDatasetVersion: string
  pollutant: Pollutant
  availableMethods: SurfaceMethod[]
  availableTrainingScopes: SpatialTrainingScope[]
  gridSpec: SpatialGridSpec
  gridCells: SpatialGridCell[]
  cellContexts: SpatialCellContext[]
  monthlySlices: SpatialSurfaceSlice[]
  eventSlices: SpatialSurfaceSlice[]
  spatialStats: SpatialStatsSlice[]
  riskOverlays: RiskOverlaySlice[]
  sourceSummaries: SourceSummarySlice[]
  forecasts: ForecastSlice[]
}

export interface AnalysisManifestPackageDescriptor {
  pollutant: Pollutant
  url: string
  availableMethods: SurfaceMethod[]
  availableTrainingScopes: SpatialTrainingScope[]
  monthlySliceCount: number
  eventSliceCount: number
  sourceScopePaths?: Partial<Record<SpatialTrainingScope, string>>
}

export interface AnalysisManifest {
  manifestVersion: string
  generatedAt: string
  coreDatasetVersion: string
  packages: AnalysisManifestPackageDescriptor[]
}

export interface FilterState {
  pollutant: Pollutant
  stationId: string
  stationSourceScope: StationSourceScope
  eventId: string
  resolution: TimeResolution
  compareMode: CompareMode
  bufferRadius: 250 | 500 | 1000
  surfaceMethod: SurfaceMethod
  spatialTrainingScope: SpatialTrainingScope
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
