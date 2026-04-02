import type {
  AnalysisManifest,
  AnalysisManifestPackageDescriptor,
  BursaDataset,
  FilterState,
  Pollutant,
  RiskOverlayCell,
  RiskOverlaySlice,
  SourceDriverCoefficient,
  SourceSummarySlice,
  SpatialAnalysisPackage,
  SpatialCellContext,
  SpatialGridCell,
  SpatialHotspotCell,
  SpatialStatsSlice,
  SpatialSurfaceCellValue,
  SpatialSurfaceSlice,
  SpatialTrainingScope,
  SurfaceMethod,
  ForecastSlice,
} from '../types'

const ANALYSIS_MANIFEST_URL = '/data/spatial/manifest.json'

type RawSourceScope = SpatialTrainingScope

interface RawCellContext {
  roadDensity: number
  greenRatio: number
  imperviousRatio: number
  industryCount: number
  meanElevation: number
  slopeMean: number
  nearestPrimaryRoadM?: number | null
  nearestRoadDistanceM?: number | null
  nearestIndustryM?: number | null
  nearestIndustryDistanceM?: number | null
}

interface RawGridCell {
  cellId: string
  row: number
  col: number
  center: {
    lat: number
    lng: number
  }
  coordinates?: [number, number][]
  polygon?: [number, number][]
  context: RawCellContext
}

interface RawPackageDescriptor {
  pollutant: Pollutant
  sourceScope: RawSourceScope
  path: string
  monthlySliceCount: number
  usableMonthlySliceCount: number
  eventSliceCount: number
}

interface RawManifest {
  manifestVersion: string
  analysisVersion: string
  datasetVersion: string
  generatedAt: string
  gridResolutionKm: number
  surfaceMethods: SurfaceMethod[]
  packages: RawPackageDescriptor[]
  grid: {
    extent: {
      south: number
      west: number
      north: number
      east: number
    }
    boundaryApproximate?: boolean
    cellCount: number
    cells: RawGridCell[]
  }
}

interface RawSurfaceSlice {
  label: string
  sliceKind: 'month' | 'event'
  status: 'ok' | 'insufficient-observations' | 'insufficient-completeness'
  stationCount: number
  observationCount: number
  meanStationCompleteness?: number | null
  surfaceValues: number[] | null
  surfaceExceedanceRatios?: number[] | null
  krigingSurfaceValues?: number[] | null
  krigingSurfaceExceedanceRatios?: number[] | null
  krigingUnavailableReason?: string
  idwRmse?: number | null
  krigingRmse?: number | null
  qualityGateFailure?: string
  statistics: {
    mean: number | null
    min: number | null
    max: number | null
    median: number | null
    standardDeviation: number | null
  }
  topCells: Array<{ cellId: string; value: number }>
  month?: string
  eventId?: string
  eventName?: string
  startDate?: string
  endDate?: string
}

interface RawHotspot {
  stationId: string
  stationName: string
  lat: number
  lng: number
  value: number
  zScore: number
  pValue: number | null
  significance: number
  classification: SpatialHotspotCell['classification']
}

interface RawSpatialStatsSlice {
  label: string
  sliceKind: 'month' | 'event'
  status: 'ok' | 'insufficient-observations' | 'insufficient-completeness'
  stationCount: number
  observationCount: number
  meanStationCompleteness?: number | null
  globalMoranI: number | null
  globalMoranZScore: number | null
  globalMoranPValue: number | null
  hotspots: RawHotspot[]
  qualityGateFailure?: string
  month?: string
  eventId?: string
  eventName?: string
  startDate?: string
  endDate?: string
}

interface RawRiskOverlayCell {
  cellId: string
  score: number
  label: string
  pollutionComponent: number
  hotspotComponent: number
  proximityComponent: number
  greenDeficit: number
  topographicCompression: number
}

interface RawRiskOverlaySlice {
  label: string
  sliceKind: 'month' | 'event'
  status: 'ok' | 'insufficient-observations' | 'insufficient-completeness'
  stationCount: number
  observationCount: number
  meanStationCompleteness?: number | null
  qualityGateFailure?: string
  cells: RawRiskOverlayCell[]
  month?: string
  eventId?: string
  eventName?: string
  startDate?: string
  endDate?: string
}

interface RawSourceDriverCoefficient {
  key: SourceDriverCoefficient['key']
  label: string
  coefficient: number
}

interface RawSourceSummarySlice {
  label: string
  sliceKind: 'month' | 'event'
  status: 'ok' | 'insufficient-observations' | 'insufficient-completeness'
  stationCount: number
  observationCount: number
  meanStationCompleteness?: number | null
  sampleCount: number
  modelScore: number | null
  prevailingWindDirection: number | null
  coefficients: RawSourceDriverCoefficient[]
  qualityGateFailure?: string
  month?: string
  eventId?: string
  eventName?: string
  startDate?: string
  endDate?: string
}

interface RawForecastPoint {
  timestamp: string
  value: number
  lower: number | null
  upper: number | null
}

interface RawForecastSlice {
  sliceId: string
  trainingScope: SpatialTrainingScope
  generatedAt: string
  horizonDays: 7 | 30
  supported: boolean
  unavailableReason?: string
  mae: number | null
  rmse: number | null
  points: RawForecastPoint[]
}

interface RawSpatialPackage {
  packageVersion: string
  manifestVersion: string
  datasetVersion: string
  pollutant: Pollutant
  sourceScope: RawSourceScope
  monthlySlices: RawSurfaceSlice[]
  eventSlices: RawSurfaceSlice[]
  spatialStats?: {
    monthlySlices: RawSpatialStatsSlice[]
    eventSlices: RawSpatialStatsSlice[]
  }
  riskOverlays?: {
    monthlySlices: RawRiskOverlaySlice[]
    eventSlices: RawRiskOverlaySlice[]
  }
  sourceSummaries?: {
    monthlySlices: RawSourceSummarySlice[]
    eventSlices: RawSourceSummarySlice[]
  }
  forecasts?: RawForecastSlice[]
}

export interface SpatialSurfaceAggregation {
  label: string
  mode: 'event' | 'range'
  startDate: string
  endDate: string
  days: number
  slicesUsed: string[]
  trainingScope: SpatialTrainingScope
  requestedMethod: SurfaceMethod
  effectiveMethod: SurfaceMethod
  usesFallbackMethod: boolean
  cells: SpatialCellView[]
  topPollutedCells: SpatialCellView[]
  cleanestCells: SpatialCellView[]
  highestExceedanceCells: SpatialCellView[]
  highestProximityCells: SpatialCellView[]
  exportRows: Array<Record<string, string | number | null>>
  unsupportedReason?: string
}

export interface SpatialCellView extends SpatialGridCell, SpatialCellContext {
  value: number | null
  pollutionLoad: number | null
  exceedanceRatio: number | null
}

export interface SpatialAnalysisResolvedData {
  manifest: AnalysisManifest | null
  packageData: SpatialAnalysisPackage | null
  surface: SpatialSurfaceAggregation | null
  stats: SpatialStatsAggregation | null
  risk: RiskOverlayAggregation | null
  sourceSummary: SourceSummaryAggregation | null
  forecast: ForecastAggregation | null
  notices: string[]
  error: string | null
  unsupportedReason: string | null
}

export interface SpatialStatsAggregation {
  label: string
  mode: 'event' | 'range'
  startDate: string
  endDate: string
  days: number
  slicesUsed: string[]
  trainingScope: SpatialTrainingScope
  globalMoranI: number | null
  globalMoranZScore: number | null
  globalMoranPValue: number | null
  hotspots: SpatialHotspotCell[]
  topHotspots: SpatialHotspotCell[]
  topColdspots: SpatialHotspotCell[]
  exportRows: Array<Record<string, string | number | null>>
  unsupportedReason?: string
}

export interface RiskOverlayAggregation {
  label: string
  mode: 'event' | 'range'
  startDate: string
  endDate: string
  days: number
  slicesUsed: string[]
  trainingScope: SpatialTrainingScope
  cells: Array<RiskOverlayCell & SpatialGridCell & SpatialCellContext>
  topRiskCells: Array<RiskOverlayCell & SpatialGridCell & SpatialCellContext>
  exportRows: Array<Record<string, string | number | null>>
  unsupportedReason?: string
}

export interface ForecastAggregation {
  trainingScope: SpatialTrainingScope
  forecasts: ForecastSlice[]
  exportRows: Array<Record<string, string | number | null>>
  unsupportedReason?: string
}

export interface SourceSummaryAggregation {
  label: string
  mode: 'event' | 'range'
  startDate: string
  endDate: string
  days: number
  slicesUsed: string[]
  trainingScope: SpatialTrainingScope
  sampleCount: number
  modelScore: number | null
  prevailingWindDirection: number | null
  coefficients: SourceDriverCoefficient[]
  dominantDriver: SourceDriverCoefficient | null
  exportRows: Array<Record<string, string | number | null>>
  unsupportedReason?: string
}

let rawManifestCache: RawManifest | null = null
let manifestCache: AnalysisManifest | null = null
let manifestPromise: Promise<AnalysisManifest> | null = null
const packageCache = new Map<Pollutant, SpatialAnalysisPackage>()
const packagePromises = new Map<Pollutant, Promise<SpatialAnalysisPackage>>()

function parseDateOnly(value: string) {
  return new Date(`${value}T00:00:00Z`)
}

function dateOnly(timestamp: string) {
  return timestamp.slice(0, 10)
}

function inclusiveDayCount(startDate: string, endDate: string) {
  const start = parseDateOnly(startDate).getTime()
  const end = parseDateOnly(endDate).getTime()

  if (Number.isNaN(start) || Number.isNaN(end) || end < start) {
    return 0
  }

  return Math.floor((end - start) / 86_400_000) + 1
}

function overlappingDayCount(
  leftStart: string,
  leftEnd: string,
  rightStart: string,
  rightEnd: string,
) {
  const start = Math.max(
    parseDateOnly(leftStart).getTime(),
    parseDateOnly(rightStart).getTime(),
  )
  const end = Math.min(
    parseDateOnly(leftEnd).getTime(),
    parseDateOnly(rightEnd).getTime(),
  )

  if (end < start) {
    return 0
  }

  return Math.floor((end - start) / 86_400_000) + 1
}

function monthStart(month: string) {
  return `${month}-01`
}

function monthEnd(month: string) {
  const [year, monthPart] = month.split('-').map(Number)
  const nextMonth = monthPart === 12 ? new Date(Date.UTC(year + 1, 0, 1)) : new Date(Date.UTC(year, monthPart, 1))
  const end = new Date(nextMonth.getTime() - 86_400_000)
  return end.toISOString().slice(0, 10)
}

function chooseEffectiveMethod(
  requestedMethod: SurfaceMethod,
  availableMethods: SurfaceMethod[],
) {
  if (availableMethods.includes(requestedMethod)) {
    return {
      effectiveMethod: requestedMethod,
      usesFallbackMethod: false,
    }
  }

  return {
    effectiveMethod: availableMethods[0] ?? 'idw',
    usesFallbackMethod: requestedMethod !== (availableMethods[0] ?? 'idw'),
  }
}

function selectedStationUnsupportedReason(dataset: BursaDataset, filters: FilterState) {
  if (filters.stationSourceScope === 'modeled') {
    return 'Model tabanli seri secildiginde bilimsel yuzey uretilmez.'
  }

  if (filters.stationId === 'all') {
    return null
  }

  const station = dataset.stations.find((item) => item.id === filters.stationId)
  if (station?.dataSource === 'modeled') {
    return 'Model tabanli istasyonlar sadece gorsel karsilastirma icin kullanilir.'
  }

  return null
}

function normalizeNumber(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return null
  }

  return Number(value.toFixed(4))
}

function normalizeManifest(rawManifest: RawManifest): AnalysisManifest {
  const grouped = new Map<Pollutant, RawPackageDescriptor[]>()
  for (const descriptor of rawManifest.packages) {
    const bucket = grouped.get(descriptor.pollutant) ?? []
    bucket.push(descriptor)
    grouped.set(descriptor.pollutant, bucket)
  }

  const packages: AnalysisManifestPackageDescriptor[] = [...grouped.entries()].map(
    ([pollutant, descriptors]) => ({
      pollutant,
      url: descriptors[0]?.path ? `/data/spatial/${descriptors[0].path}` : '',
      availableMethods: rawManifest.surfaceMethods,
      availableTrainingScopes: [...new Set(descriptors.map((item) => item.sourceScope))],
      monthlySliceCount: Math.max(...descriptors.map((item) => item.monthlySliceCount)),
      eventSliceCount: Math.max(...descriptors.map((item) => item.eventSliceCount)),
      sourceScopePaths: Object.fromEntries(
        descriptors.map((item) => [item.sourceScope, `/data/spatial/${item.path}`]),
      ) as Partial<Record<SpatialTrainingScope, string>>,
    }),
  )

  packages.sort((left, right) => left.pollutant.localeCompare(right.pollutant))

  return {
    manifestVersion: rawManifest.manifestVersion,
    generatedAt: rawManifest.generatedAt,
    coreDatasetVersion: rawManifest.datasetVersion,
    packages,
  }
}

function buildGridCells(rawManifest: RawManifest): SpatialGridCell[] {
  return rawManifest.grid.cells.map((cell) => ({
    id: cell.cellId,
    row: cell.row,
    col: cell.col,
    center: cell.center,
    coordinates: cell.coordinates ?? cell.polygon ?? [],
  }))
}

function buildCellContexts(rawManifest: RawManifest): SpatialCellContext[] {
  return rawManifest.grid.cells.map((cell) => {
    const nearestPrimaryRoadM = normalizeNumber(
      cell.context.nearestPrimaryRoadM ?? cell.context.nearestRoadDistanceM,
    )
    const nearestIndustryM = normalizeNumber(
      cell.context.nearestIndustryM ?? cell.context.nearestIndustryDistanceM,
    )
    const roadSignal = nearestPrimaryRoadM === null ? 0 : Math.max(0, 1 - nearestPrimaryRoadM / 5_000)
    const industrySignal = nearestIndustryM === null ? 0 : Math.max(0, 1 - nearestIndustryM / 5_000)
    const proximityIndex = Number(
      (
        roadSignal * 0.45 +
        industrySignal * 0.35 +
        Math.min(cell.context.roadDensity / 4, 1) * 0.2
      ).toFixed(4),
    )

    return {
      cellId: cell.cellId,
      roadDensity: normalizeNumber(cell.context.roadDensity) ?? 0,
      greenRatio: normalizeNumber(cell.context.greenRatio) ?? 0,
      imperviousRatio: normalizeNumber(cell.context.imperviousRatio) ?? 0,
      industryCountWithin3Km: cell.context.industryCount,
      meanElevation: normalizeNumber(cell.context.meanElevation) ?? 0,
      slopeMean: normalizeNumber(cell.context.slopeMean) ?? 0,
      nearestPrimaryRoadM,
      nearestIndustryM,
      proximityIndex,
    }
  })
}

function normalizeSurfaceValues(
  rawSlice: RawSurfaceSlice,
  cells: RawGridCell[],
  method: SurfaceMethod = 'idw',
): SpatialSurfaceCellValue[] {
  const values =
    method === 'kriging'
      ? rawSlice.krigingSurfaceValues ?? []
      : rawSlice.surfaceValues ?? []
  const exceedanceRatios =
    method === 'kriging'
      ? rawSlice.krigingSurfaceExceedanceRatios ?? []
      : rawSlice.surfaceExceedanceRatios ?? []

  return cells.map((cell, index) => {
    const value = values[index]
    if (value === undefined || value === null) {
      return {
        cellId: cell.cellId,
        value: null,
        pollutionLoad: null,
        exceedanceRatio: null,
      }
    }

    return {
      cellId: cell.cellId,
      value: Number(value.toFixed(4)),
      pollutionLoad: Number(value.toFixed(4)),
      exceedanceRatio:
        exceedanceRatios[index] === undefined || exceedanceRatios[index] === null
          ? null
          : Number(exceedanceRatios[index]!.toFixed(4)),
    }
  })
}

function normalizeRawSlice(
  rawSlice: RawSurfaceSlice,
): SpatialSurfaceSlice {
  const startDate =
    rawSlice.sliceKind === 'month' && rawSlice.month
      ? monthStart(rawSlice.month)
      : dateOnly(rawSlice.startDate ?? '')
  const endDate =
    rawSlice.sliceKind === 'month' && rawSlice.month
      ? monthEnd(rawSlice.month)
      : dateOnly(rawSlice.endDate ?? '')
  const sliceId =
    rawSlice.sliceKind === 'month' && rawSlice.month
      ? `month-${rawSlice.month}`
      : `event-${rawSlice.eventId ?? rawSlice.label}`

  return {
    sliceId,
    label:
      rawSlice.sliceKind === 'month'
        ? rawSlice.month ?? rawSlice.label
        : rawSlice.eventName ?? rawSlice.label,
    startDate,
    endDate,
    days: inclusiveDayCount(startDate, endDate),
    surfaces: {
      measured: {
        idw: {
          supported: false,
          unavailableReason: 'Bu kapsam icin paket bulunamadi.',
          eligibleStationCount: 0,
          meanStationCompleteness: 0,
          cellValues: [],
        },
        kriging: {
          supported: false,
          unavailableReason: 'Bu kapsam icin Kriging yuzeyi bulunamadi.',
          eligibleStationCount: 0,
          meanStationCompleteness: 0,
          cellValues: [],
        },
      },
      'measured-plus-sensor': {
        idw: {
          supported: false,
          unavailableReason: 'Bu kapsam icin paket bulunamadi.',
          eligibleStationCount: 0,
          meanStationCompleteness: 0,
          cellValues: [],
        },
        kriging: {
          supported: false,
          unavailableReason: 'Bu kapsam icin Kriging yuzeyi bulunamadi.',
          eligibleStationCount: 0,
          meanStationCompleteness: 0,
          cellValues: [],
        },
      },
    },
  }
}

function emptyStatsPayload(reason: string) {
  return {
    supported: false,
    unavailableReason: reason,
    eligibleStationCount: 0,
    meanStationCompleteness: 0,
    globalMoranI: null,
    globalMoranZScore: null,
    globalMoranPValue: null,
    hotspots: [],
  }
}

function emptyRiskPayload(reason: string) {
  return {
    supported: false,
    unavailableReason: reason,
    eligibleStationCount: 0,
    meanStationCompleteness: 0,
    cells: [],
  }
}

function normalizeRawStatsSlice(rawSlice: RawSpatialStatsSlice): SpatialStatsSlice {
  const startDate =
    rawSlice.sliceKind === 'month' && rawSlice.month
      ? monthStart(rawSlice.month)
      : dateOnly(rawSlice.startDate ?? '')
  const endDate =
    rawSlice.sliceKind === 'month' && rawSlice.month
      ? monthEnd(rawSlice.month)
      : dateOnly(rawSlice.endDate ?? '')
  const sliceId =
    rawSlice.sliceKind === 'month' && rawSlice.month
      ? `month-${rawSlice.month}`
      : `event-${rawSlice.eventId ?? rawSlice.label}`

  return {
    sliceId,
    label:
      rawSlice.sliceKind === 'month'
        ? rawSlice.month ?? rawSlice.label
        : rawSlice.eventName ?? rawSlice.label,
    startDate,
    endDate,
    scopes: {
      measured: emptyStatsPayload('Bu kapsam icin istatistik paketi bulunamadi.'),
      'measured-plus-sensor': emptyStatsPayload('Bu kapsam icin istatistik paketi bulunamadi.'),
    },
  }
}

function normalizeRawRiskSlice(rawSlice: RawRiskOverlaySlice): RiskOverlaySlice {
  const startDate =
    rawSlice.sliceKind === 'month' && rawSlice.month
      ? monthStart(rawSlice.month)
      : dateOnly(rawSlice.startDate ?? '')
  const endDate =
    rawSlice.sliceKind === 'month' && rawSlice.month
      ? monthEnd(rawSlice.month)
      : dateOnly(rawSlice.endDate ?? '')
  const sliceId =
    rawSlice.sliceKind === 'month' && rawSlice.month
      ? `month-${rawSlice.month}`
      : `event-${rawSlice.eventId ?? rawSlice.label}`

  return {
    sliceId,
    label:
      rawSlice.sliceKind === 'month'
        ? rawSlice.month ?? rawSlice.label
        : rawSlice.eventName ?? rawSlice.label,
    startDate,
    endDate,
    scopes: {
      measured: emptyRiskPayload('Bu kapsam icin risk paketi bulunamadi.'),
      'measured-plus-sensor': emptyRiskPayload('Bu kapsam icin risk paketi bulunamadi.'),
    },
  }
}

function emptySourceSummaryPayload(reason: string) {
  return {
    supported: false,
    unavailableReason: reason,
    sampleCount: 0,
    meanStationCompleteness: 0,
    modelScore: null,
    prevailingWindDirection: null,
    coefficients: [],
  }
}

function normalizeRawSourceSummarySlice(rawSlice: RawSourceSummarySlice): SourceSummarySlice {
  const startDate =
    rawSlice.sliceKind === 'month' && rawSlice.month
      ? monthStart(rawSlice.month)
      : dateOnly(rawSlice.startDate ?? '')
  const endDate =
    rawSlice.sliceKind === 'month' && rawSlice.month
      ? monthEnd(rawSlice.month)
      : dateOnly(rawSlice.endDate ?? '')
  const sliceId =
    rawSlice.sliceKind === 'month' && rawSlice.month
      ? `month-${rawSlice.month}`
      : `event-${rawSlice.eventId ?? rawSlice.label}`

  return {
    sliceId,
    label:
      rawSlice.sliceKind === 'month'
        ? rawSlice.month ?? rawSlice.label
        : rawSlice.eventName ?? rawSlice.label,
    startDate,
    endDate,
    scopes: {
      measured: emptySourceSummaryPayload('Bu kapsam icin kaynak ozet paketi bulunamadi.'),
      'measured-plus-sensor': emptySourceSummaryPayload(
        'Bu kapsam icin kaynak ozet paketi bulunamadi.',
      ),
    },
  }
}

function mergeSlicesById(
  slices: SpatialSurfaceSlice[],
  rawSlices: RawSurfaceSlice[],
  sourceScope: SpatialTrainingScope,
  cells: RawGridCell[],
) {
  const byId = new Map(slices.map((slice) => [slice.sliceId, slice]))

  for (const rawSlice of rawSlices) {
    const normalized = normalizeRawSlice(rawSlice)
    const existing = byId.get(normalized.sliceId) ?? normalized

    existing.surfaces[sourceScope].idw = {
      supported: rawSlice.status === 'ok' && Array.isArray(rawSlice.surfaceValues),
      unavailableReason:
        rawSlice.status === 'ok'
          ? undefined
          : rawSlice.qualityGateFailure ?? 'Yeterli sayida olculmus istasyon yok.',
      eligibleStationCount: rawSlice.stationCount,
      meanStationCompleteness: normalizeNumber(rawSlice.meanStationCompleteness) ?? 0,
      cellValues:
        rawSlice.status === 'ok'
          ? normalizeSurfaceValues(rawSlice, cells, 'idw')
          : [],
    }
    existing.surfaces[sourceScope].kriging = {
      supported:
        rawSlice.status === 'ok' &&
        Array.isArray(rawSlice.krigingSurfaceValues) &&
        rawSlice.krigingSurfaceValues.length > 0,
      unavailableReason:
        rawSlice.status !== 'ok'
          ? rawSlice.qualityGateFailure ?? 'Yeterli sayida olculmus istasyon yok.'
          : rawSlice.krigingUnavailableReason ?? 'Kriging bu dilim icin uygun degil.',
      eligibleStationCount: rawSlice.stationCount,
      meanStationCompleteness: normalizeNumber(rawSlice.meanStationCompleteness) ?? 0,
      cellValues:
        rawSlice.status === 'ok' && Array.isArray(rawSlice.krigingSurfaceValues)
          ? normalizeSurfaceValues(rawSlice, cells, 'kriging')
          : [],
    }

    byId.set(existing.sliceId, existing)
  }

  return [...byId.values()].sort((left, right) => left.startDate.localeCompare(right.startDate))
}

function mergeSourceSummarySlicesById(
  slices: SourceSummarySlice[],
  rawSlices: RawSourceSummarySlice[],
  sourceScope: SpatialTrainingScope,
) {
  const byId = new Map(slices.map((slice) => [slice.sliceId, slice]))

  for (const rawSlice of rawSlices) {
    const normalized = normalizeRawSourceSummarySlice(rawSlice)
    const existing = byId.get(normalized.sliceId) ?? normalized

    existing.scopes[sourceScope] = {
      supported: rawSlice.status === 'ok',
      unavailableReason:
        rawSlice.status === 'ok'
          ? undefined
          : rawSlice.qualityGateFailure ?? 'Kaynak proxy modeli icin yeterli veri yok.',
      sampleCount: rawSlice.sampleCount,
      meanStationCompleteness: normalizeNumber(rawSlice.meanStationCompleteness) ?? 0,
      modelScore: normalizeNumber(rawSlice.modelScore),
      prevailingWindDirection: normalizeNumber(rawSlice.prevailingWindDirection),
      coefficients: rawSlice.coefficients.map((coefficient) => ({
        key: coefficient.key,
        label: coefficient.label,
        coefficient: normalizeNumber(coefficient.coefficient) ?? 0,
      })),
    }

    byId.set(existing.sliceId, existing)
  }

  return [...byId.values()].sort((left, right) => left.startDate.localeCompare(right.startDate))
}

function mergeStatsSlicesById(
  slices: SpatialStatsSlice[],
  rawSlices: RawSpatialStatsSlice[],
  sourceScope: SpatialTrainingScope,
) {
  const byId = new Map(slices.map((slice) => [slice.sliceId, slice]))

  for (const rawSlice of rawSlices) {
    const normalized = normalizeRawStatsSlice(rawSlice)
    const existing = byId.get(normalized.sliceId) ?? normalized

    existing.scopes[sourceScope] = {
      supported: rawSlice.status === 'ok',
      unavailableReason:
        rawSlice.status === 'ok'
          ? undefined
          : rawSlice.qualityGateFailure ?? 'Yeterli sayida olculmus istasyon yok.',
      eligibleStationCount: rawSlice.stationCount,
      meanStationCompleteness: normalizeNumber(rawSlice.meanStationCompleteness) ?? 0,
      globalMoranI: normalizeNumber(rawSlice.globalMoranI),
      globalMoranZScore: normalizeNumber(rawSlice.globalMoranZScore),
      globalMoranPValue: normalizeNumber(rawSlice.globalMoranPValue),
      hotspots: rawSlice.hotspots.map((hotspot) => ({
        stationId: hotspot.stationId,
        stationName: hotspot.stationName,
        lat: hotspot.lat,
        lng: hotspot.lng,
        value: hotspot.value,
        zScore: hotspot.zScore,
        pValue: hotspot.pValue,
        significance: hotspot.significance,
        classification: hotspot.classification,
      })),
    }

    byId.set(existing.sliceId, existing)
  }

  return [...byId.values()].sort((left, right) => left.startDate.localeCompare(right.startDate))
}

function mergeRiskSlicesById(
  slices: RiskOverlaySlice[],
  rawSlices: RawRiskOverlaySlice[],
  sourceScope: SpatialTrainingScope,
) {
  const byId = new Map(slices.map((slice) => [slice.sliceId, slice]))

  for (const rawSlice of rawSlices) {
    const normalized = normalizeRawRiskSlice(rawSlice)
    const existing = byId.get(normalized.sliceId) ?? normalized

    existing.scopes[sourceScope] = {
      supported: rawSlice.status === 'ok',
      unavailableReason:
        rawSlice.status === 'ok'
          ? undefined
          : rawSlice.qualityGateFailure ?? 'Risk katmani icin yeterli veri yok.',
      eligibleStationCount: rawSlice.stationCount,
      meanStationCompleteness: normalizeNumber(rawSlice.meanStationCompleteness) ?? 0,
      cells: rawSlice.cells.map((cell) => ({
        cellId: cell.cellId,
        score: normalizeNumber(cell.score) ?? 0,
        label: cell.label,
        pollutionComponent: normalizeNumber(cell.pollutionComponent) ?? 0,
        hotspotComponent: normalizeNumber(cell.hotspotComponent) ?? 0,
        proximityComponent: normalizeNumber(cell.proximityComponent) ?? 0,
        greenDeficit: normalizeNumber(cell.greenDeficit) ?? 0,
        topographicCompression: normalizeNumber(cell.topographicCompression) ?? 0,
      })),
    }

    byId.set(existing.sliceId, existing)
  }

  return [...byId.values()].sort((left, right) => left.startDate.localeCompare(right.startDate))
}

async function fetchRawManifest(signal?: AbortSignal) {
  if (rawManifestCache) {
    return rawManifestCache
  }

  const response = await fetch(ANALYSIS_MANIFEST_URL, { signal })
  if (!response.ok) {
    throw new Error(`Analysis manifest request failed: ${response.status}`)
  }

  const payload = (await response.json()) as RawManifest
  rawManifestCache = payload
  return payload
}

async function fetchRawPackage(url: string, signal?: AbortSignal) {
  const response = await fetch(url, { signal })
  if (!response.ok) {
    throw new Error(`Spatial package request failed: ${response.status}`)
  }

  return (await response.json()) as RawSpatialPackage
}

function buildNormalizedPackage(
  rawManifest: RawManifest,
  rawPackages: RawSpatialPackage[],
): SpatialAnalysisPackage {
  const pollutant = rawPackages[0]?.pollutant ?? 'PM10'
  const gridCells = buildGridCells(rawManifest)
  const cellContexts = buildCellContexts(rawManifest)
  const rawCells = rawManifest.grid.cells
  let monthlySlices: SpatialSurfaceSlice[] = []
  let eventSlices: SpatialSurfaceSlice[] = []
  let spatialStats: SpatialStatsSlice[] = []
  let riskOverlays: RiskOverlaySlice[] = []
  let sourceSummaries: SourceSummarySlice[] = []

  for (const rawPackage of rawPackages) {
    monthlySlices = mergeSlicesById(
      monthlySlices,
      rawPackage.monthlySlices,
      rawPackage.sourceScope,
      rawCells,
    )
    eventSlices = mergeSlicesById(
      eventSlices,
      rawPackage.eventSlices,
      rawPackage.sourceScope,
      rawCells,
    )
    spatialStats = mergeStatsSlicesById(
      spatialStats,
      rawPackage.spatialStats?.monthlySlices ?? [],
      rawPackage.sourceScope,
    )
    spatialStats = mergeStatsSlicesById(
      spatialStats,
      rawPackage.spatialStats?.eventSlices ?? [],
      rawPackage.sourceScope,
    )
    riskOverlays = mergeRiskSlicesById(
      riskOverlays,
      rawPackage.riskOverlays?.monthlySlices ?? [],
      rawPackage.sourceScope,
    )
    riskOverlays = mergeRiskSlicesById(
      riskOverlays,
      rawPackage.riskOverlays?.eventSlices ?? [],
      rawPackage.sourceScope,
    )
    sourceSummaries = mergeSourceSummarySlicesById(
      sourceSummaries,
      rawPackage.sourceSummaries?.monthlySlices ?? [],
      rawPackage.sourceScope,
    )
    sourceSummaries = mergeSourceSummarySlicesById(
      sourceSummaries,
      rawPackage.sourceSummaries?.eventSlices ?? [],
      rawPackage.sourceScope,
    )
  }

  return {
    manifestVersion: rawManifest.manifestVersion,
    generatedAt: rawManifest.generatedAt,
    coreDatasetVersion: rawManifest.datasetVersion,
    pollutant,
    availableMethods: rawManifest.surfaceMethods,
    availableTrainingScopes: [...new Set(rawPackages.map((item) => item.sourceScope))],
    gridSpec: {
      cellSizeKm: rawManifest.gridResolutionKm,
      rows: Math.max(...gridCells.map((item) => item.row), 0) + 1,
      cols: Math.max(...gridCells.map((item) => item.col), 0) + 1,
      bounds: rawManifest.grid.extent,
      boundaryApproximate: rawManifest.grid.boundaryApproximate,
      cellIds: gridCells.map((item) => item.id),
    },
    gridCells,
    cellContexts,
    monthlySlices,
    eventSlices,
    spatialStats,
    riskOverlays,
    sourceSummaries,
    forecasts: rawPackages.flatMap((rawPackage) =>
      (rawPackage.forecasts ?? []).map((forecast) => ({
        sliceId: forecast.sliceId,
        trainingScope: forecast.trainingScope,
        generatedAt: forecast.generatedAt,
        horizonDays: forecast.horizonDays,
        supported: forecast.supported,
        unavailableReason: forecast.unavailableReason,
        mae: normalizeNumber(forecast.mae),
        rmse: normalizeNumber(forecast.rmse),
        points: forecast.points.map((point) => ({
          timestamp: point.timestamp,
          value: point.value,
          lower: normalizeNumber(point.lower),
          upper: normalizeNumber(point.upper),
        })),
      })),
    ),
  }
}

function buildExportRows(
  cells: SpatialCellView[],
  pollutant: Pollutant,
  surface: SpatialSurfaceAggregation,
) {
  return cells.map((cell) => ({
    cell_id: cell.id,
    pollutant,
    slice_label: surface.label,
    analysis_mode: surface.mode,
    method: surface.effectiveMethod,
    training_scope: surface.trainingScope,
    lat: Number(cell.center.lat.toFixed(6)),
    lng: Number(cell.center.lng.toFixed(6)),
    value: normalizeNumber(cell.value),
    pollution_load: normalizeNumber(cell.pollutionLoad),
    exceedance_ratio: normalizeNumber(cell.exceedanceRatio),
    road_density: normalizeNumber(cell.roadDensity),
    green_ratio: normalizeNumber(cell.greenRatio),
    impervious_ratio: normalizeNumber(cell.imperviousRatio),
    industry_count_3km: cell.industryCountWithin3Km,
    nearest_primary_road_m: normalizeNumber(cell.nearestPrimaryRoadM),
    nearest_industry_m: normalizeNumber(cell.nearestIndustryM),
    proximity_index: normalizeNumber(cell.proximityIndex),
    mean_elevation_m: normalizeNumber(cell.meanElevation),
    slope_mean: normalizeNumber(cell.slopeMean),
  }))
}

function enrichCells(
  cells: SpatialGridCell[],
  contexts: SpatialCellContext[],
  valuesByCellId: Map<string, SpatialSurfaceCellValue>,
) {
  const contextByCellId = new Map(contexts.map((context) => [context.cellId, context]))

  return cells.map<SpatialCellView>((cell) => {
    const context = contextByCellId.get(cell.id)
    const value = valuesByCellId.get(cell.id)

    return {
      ...cell,
      cellId: cell.id,
      roadDensity: context?.roadDensity ?? 0,
      greenRatio: context?.greenRatio ?? 0,
      imperviousRatio: context?.imperviousRatio ?? 0,
      industryCountWithin3Km: context?.industryCountWithin3Km ?? 0,
      meanElevation: context?.meanElevation ?? 0,
      slopeMean: context?.slopeMean ?? 0,
      nearestPrimaryRoadM: context?.nearestPrimaryRoadM ?? null,
      nearestIndustryM: context?.nearestIndustryM ?? null,
      proximityIndex: context?.proximityIndex ?? 0,
      value: value?.value ?? null,
      pollutionLoad: value?.pollutionLoad ?? null,
      exceedanceRatio: value?.exceedanceRatio ?? null,
    }
  })
}

function aggregateSurfaceCells(
  slices: SpatialSurfaceSlice[],
  filters: FilterState,
  availableMethods: SurfaceMethod[],
) {
  const trainingScope = filters.spatialTrainingScope
  const { effectiveMethod: requestedEffectiveMethod, usesFallbackMethod: methodMissingFallback } = chooseEffectiveMethod(
    filters.surfaceMethod,
    availableMethods,
  )
  let effectiveMethod = requestedEffectiveMethod
  let usesFallbackMethod = methodMissingFallback

  const totals = new Map<
    string,
    {
      value: number
      valueWeight: number
      pollutionLoad: number
      pollutionLoadWeight: number
      exceedanceRatio: number
      exceedanceWeight: number
    }
  >()

  let totalOverlapDays = 0
  let supportedSliceCount = 0
  let rejectedReason: string | null = null

  for (const slice of slices) {
    let payload = slice.surfaces[trainingScope]?.[effectiveMethod]
    if (
      effectiveMethod === 'kriging' &&
      (!payload?.supported || payload.cellValues.length === 0)
    ) {
      const fallbackPayload = slice.surfaces[trainingScope]?.idw
      if (fallbackPayload?.supported) {
        payload = fallbackPayload
        effectiveMethod = 'idw'
        usesFallbackMethod = true
      }
    }

    if (!payload?.supported) {
      rejectedReason = rejectedReason ?? payload?.unavailableReason ?? 'Secili yuzey desteklenmiyor.'
      continue
    }

    const overlapDays =
      slices.length === 1 && filters.eventId
        ? slice.days
        : overlappingDayCount(
            filters.startDate,
            filters.endDate,
            dateOnly(slice.startDate),
            dateOnly(slice.endDate),
          )

    if (overlapDays <= 0) {
      continue
    }

    supportedSliceCount += 1
    totalOverlapDays += overlapDays

    for (const cellValue of payload.cellValues) {
      const bucket =
        totals.get(cellValue.cellId) ??
        {
          value: 0,
          valueWeight: 0,
          pollutionLoad: 0,
          pollutionLoadWeight: 0,
          exceedanceRatio: 0,
          exceedanceWeight: 0,
        }

      if (cellValue.value !== null) {
        bucket.value += cellValue.value * overlapDays
        bucket.valueWeight += overlapDays
      }

      if (cellValue.pollutionLoad !== null) {
        bucket.pollutionLoad += cellValue.pollutionLoad * overlapDays
        bucket.pollutionLoadWeight += overlapDays
      }

      if (cellValue.exceedanceRatio !== null) {
        bucket.exceedanceRatio += cellValue.exceedanceRatio * overlapDays
        bucket.exceedanceWeight += overlapDays
      }

      totals.set(cellValue.cellId, bucket)
    }
  }

  if (supportedSliceCount === 0 || totalOverlapDays === 0) {
    return {
      trainingScope,
      effectiveMethod,
      usesFallbackMethod,
      totalDays: 0,
      valuesByCellId: new Map<string, SpatialSurfaceCellValue>(),
      unsupportedReason: rejectedReason ?? 'Secili tarih araligi icin kullanilabilir mekansal dilim yok.',
    }
  }

  const valuesByCellId = new Map<string, SpatialSurfaceCellValue>()
  for (const [cellId, bucket] of totals) {
    valuesByCellId.set(cellId, {
      cellId,
      value:
        bucket.valueWeight > 0
          ? Number((bucket.value / bucket.valueWeight).toFixed(4))
          : null,
      pollutionLoad:
        bucket.pollutionLoadWeight > 0
          ? Number((bucket.pollutionLoad / bucket.pollutionLoadWeight).toFixed(4))
          : null,
      exceedanceRatio:
        bucket.exceedanceWeight > 0
          ? Number((bucket.exceedanceRatio / bucket.exceedanceWeight).toFixed(4))
          : null,
    })
  }

  return {
    trainingScope,
    effectiveMethod,
    usesFallbackMethod,
    totalDays: totalOverlapDays,
    valuesByCellId,
    unsupportedReason: null,
  }
}

function sortByNullableValue(
  cells: SpatialCellView[],
  selector: (cell: SpatialCellView) => number | null,
  direction: 'asc' | 'desc',
  limit: number,
) {
  return [...cells]
    .filter((cell) => selector(cell) !== null)
    .sort((left, right) => {
      const leftValue = selector(left) ?? 0
      const rightValue = selector(right) ?? 0
      return direction === 'asc' ? leftValue - rightValue : rightValue - leftValue
    })
    .slice(0, limit)
}

function hotspotClassification(zScore: number): SpatialHotspotCell['classification'] {
  if (zScore >= 2.58) {
    return 'hotspot-99'
  }
  if (zScore >= 1.96) {
    return 'hotspot-95'
  }
  if (zScore >= 1.65) {
    return 'hotspot-90'
  }
  if (zScore <= -2.58) {
    return 'coldspot-99'
  }
  if (zScore <= -1.96) {
    return 'coldspot-95'
  }
  if (zScore <= -1.65) {
    return 'coldspot-90'
  }
  return 'not-significant'
}

function environmentalRiskLabel(score: number) {
  if (score >= 0.75) {
    return 'Cok yuksek'
  }
  if (score >= 0.55) {
    return 'Yuksek'
  }
  if (score >= 0.35) {
    return 'Orta'
  }
  return 'Dusuk'
}

function aggregateSpatialStats(
  slices: SpatialStatsSlice[],
  filters: FilterState,
) {
  const trainingScope = filters.spatialTrainingScope
  const hotspotsByStationId = new Map<
    string,
    {
      stationId: string
      stationName: string
      lat: number
      lng: number
      value: number
      valueWeight: number
      zScore: number
      zWeight: number
      pValue: number
      pWeight: number
      significance: number
      significanceWeight: number
    }
  >()
  let globalMoranI = 0
  let globalMoranIWeight = 0
  let globalMoranZScore = 0
  let globalMoranZWeight = 0
  let globalMoranPValue = 0
  let globalMoranPWeight = 0
  let totalOverlapDays = 0
  let supportedSliceCount = 0
  let rejectedReason: string | null = null

  for (const slice of slices) {
    const payload = slice.scopes[trainingScope]
    if (!payload?.supported) {
      rejectedReason = rejectedReason ?? payload?.unavailableReason ?? 'Mekansal istatistik desteklenmiyor.'
      continue
    }

    const overlapDays =
      slices.length === 1 && filters.eventId
        ? inclusiveDayCount(slice.startDate, slice.endDate)
        : overlappingDayCount(
            filters.startDate,
            filters.endDate,
            slice.startDate,
            slice.endDate,
          )

    if (overlapDays <= 0) {
      continue
    }

    supportedSliceCount += 1
    totalOverlapDays += overlapDays

    if (payload.globalMoranI !== null) {
      globalMoranI += payload.globalMoranI * overlapDays
      globalMoranIWeight += overlapDays
    }
    if (payload.globalMoranZScore !== null) {
      globalMoranZScore += payload.globalMoranZScore * overlapDays
      globalMoranZWeight += overlapDays
    }
    if (payload.globalMoranPValue !== null) {
      globalMoranPValue += payload.globalMoranPValue * overlapDays
      globalMoranPWeight += overlapDays
    }

    for (const hotspot of payload.hotspots) {
      const bucket =
        hotspotsByStationId.get(hotspot.stationId) ?? {
          stationId: hotspot.stationId,
          stationName: hotspot.stationName,
          lat: hotspot.lat,
          lng: hotspot.lng,
          value: 0,
          valueWeight: 0,
          zScore: 0,
          zWeight: 0,
          pValue: 0,
          pWeight: 0,
          significance: 0,
          significanceWeight: 0,
        }

      bucket.value += hotspot.value * overlapDays
      bucket.valueWeight += overlapDays
      bucket.zScore += hotspot.zScore * overlapDays
      bucket.zWeight += overlapDays
      if (hotspot.pValue !== null) {
        bucket.pValue += hotspot.pValue * overlapDays
        bucket.pWeight += overlapDays
      }
      bucket.significance += hotspot.significance * overlapDays
      bucket.significanceWeight += overlapDays
      hotspotsByStationId.set(hotspot.stationId, bucket)
    }
  }

  if (supportedSliceCount === 0 || totalOverlapDays === 0) {
    return {
      trainingScope,
      totalDays: 0,
      hotspots: [] as SpatialHotspotCell[],
      topHotspots: [] as SpatialHotspotCell[],
      topColdspots: [] as SpatialHotspotCell[],
      globalMoranI: null,
      globalMoranZScore: null,
      globalMoranPValue: null,
      unsupportedReason:
        rejectedReason ?? 'Secili tarih araligi icin kullanilabilir mekansal istatistik dilimi yok.',
    }
  }

  const hotspots = [...hotspotsByStationId.values()]
    .map<SpatialHotspotCell>((bucket) => {
      const zScore =
        bucket.zWeight > 0 ? Number((bucket.zScore / bucket.zWeight).toFixed(4)) : 0

      return {
        stationId: bucket.stationId,
        stationName: bucket.stationName,
        lat: bucket.lat,
        lng: bucket.lng,
        value: bucket.valueWeight > 0 ? Number((bucket.value / bucket.valueWeight).toFixed(4)) : 0,
        zScore,
        pValue:
          bucket.pWeight > 0 ? Number((bucket.pValue / bucket.pWeight).toFixed(4)) : null,
        significance:
          bucket.significanceWeight > 0
            ? Number((bucket.significance / bucket.significanceWeight).toFixed(4))
            : 0,
        classification: hotspotClassification(zScore),
      }
    })
    .sort((left, right) => Math.abs(right.zScore) - Math.abs(left.zScore))

  const topHotspots = hotspots
    .filter((hotspot) => hotspot.classification.startsWith('hotspot'))
    .slice(0, 8)
  const topColdspots = hotspots
    .filter((hotspot) => hotspot.classification.startsWith('coldspot'))
    .slice(0, 8)

  return {
    trainingScope,
    totalDays: totalOverlapDays,
    hotspots,
    topHotspots,
    topColdspots,
    globalMoranI:
      globalMoranIWeight > 0 ? Number((globalMoranI / globalMoranIWeight).toFixed(4)) : null,
    globalMoranZScore:
      globalMoranZWeight > 0
        ? Number((globalMoranZScore / globalMoranZWeight).toFixed(4))
        : null,
    globalMoranPValue:
      globalMoranPWeight > 0
        ? Number((globalMoranPValue / globalMoranPWeight).toFixed(4))
        : null,
    unsupportedReason: null,
  }
}

function enrichRiskCells(
  cells: SpatialGridCell[],
  contexts: SpatialCellContext[],
  risksByCellId: Map<string, RiskOverlayCell>,
) {
  const contextByCellId = new Map(contexts.map((context) => [context.cellId, context]))

  return cells
    .map((cell) => {
      const context = contextByCellId.get(cell.id)
      const risk = risksByCellId.get(cell.id)
      if (!risk) {
        return null
      }

      return {
        ...cell,
        roadDensity: context?.roadDensity ?? 0,
        greenRatio: context?.greenRatio ?? 0,
        imperviousRatio: context?.imperviousRatio ?? 0,
        industryCountWithin3Km: context?.industryCountWithin3Km ?? 0,
        meanElevation: context?.meanElevation ?? 0,
        slopeMean: context?.slopeMean ?? 0,
        nearestPrimaryRoadM: context?.nearestPrimaryRoadM ?? null,
        nearestIndustryM: context?.nearestIndustryM ?? null,
        proximityIndex: context?.proximityIndex ?? 0,
        ...risk,
      }
    })
    .filter((cell): cell is RiskOverlayCell & SpatialGridCell & SpatialCellContext => Boolean(cell))
}

function aggregateRiskOverlays(
  slices: RiskOverlaySlice[],
  filters: FilterState,
  gridCells: SpatialGridCell[],
  cellContexts: SpatialCellContext[],
) {
  const trainingScope = filters.spatialTrainingScope
  const totals = new Map<
    string,
    {
      score: number
      scoreWeight: number
      pollutionComponent: number
      hotspotComponent: number
      proximityComponent: number
      greenDeficit: number
      topographicCompression: number
      componentWeight: number
    }
  >()
  let totalOverlapDays = 0
  let supportedSliceCount = 0
  let rejectedReason: string | null = null

  for (const slice of slices) {
    const payload = slice.scopes[trainingScope]
    if (!payload?.supported) {
      rejectedReason = rejectedReason ?? payload?.unavailableReason ?? 'Risk katmani desteklenmiyor.'
      continue
    }

    const overlapDays =
      slices.length === 1 && filters.eventId
        ? inclusiveDayCount(slice.startDate, slice.endDate)
        : overlappingDayCount(
            filters.startDate,
            filters.endDate,
            slice.startDate,
            slice.endDate,
          )

    if (overlapDays <= 0) {
      continue
    }

    supportedSliceCount += 1
    totalOverlapDays += overlapDays

    for (const riskCell of payload.cells) {
      const bucket =
        totals.get(riskCell.cellId) ?? {
          score: 0,
          scoreWeight: 0,
          pollutionComponent: 0,
          hotspotComponent: 0,
          proximityComponent: 0,
          greenDeficit: 0,
          topographicCompression: 0,
          componentWeight: 0,
        }

      bucket.score += riskCell.score * overlapDays
      bucket.scoreWeight += overlapDays
      bucket.pollutionComponent += riskCell.pollutionComponent * overlapDays
      bucket.hotspotComponent += riskCell.hotspotComponent * overlapDays
      bucket.proximityComponent += riskCell.proximityComponent * overlapDays
      bucket.greenDeficit += riskCell.greenDeficit * overlapDays
      bucket.topographicCompression += riskCell.topographicCompression * overlapDays
      bucket.componentWeight += overlapDays
      totals.set(riskCell.cellId, bucket)
    }
  }

  if (supportedSliceCount === 0 || totalOverlapDays === 0) {
    return {
      trainingScope,
      totalDays: 0,
      cells: [] as Array<RiskOverlayCell & SpatialGridCell & SpatialCellContext>,
      topRiskCells: [] as Array<RiskOverlayCell & SpatialGridCell & SpatialCellContext>,
      unsupportedReason:
        rejectedReason ?? 'Secili tarih araligi icin kullanilabilir risk katmani yok.',
    }
  }

  const risksByCellId = new Map<string, RiskOverlayCell>()
  for (const [cellId, bucket] of totals) {
    risksByCellId.set(cellId, {
      cellId,
      score: bucket.scoreWeight > 0 ? Number((bucket.score / bucket.scoreWeight).toFixed(4)) : 0,
      label: environmentalRiskLabel(
        bucket.scoreWeight > 0 ? bucket.score / bucket.scoreWeight : 0,
      ),
      pollutionComponent:
        bucket.componentWeight > 0
          ? Number((bucket.pollutionComponent / bucket.componentWeight).toFixed(4))
          : 0,
      hotspotComponent:
        bucket.componentWeight > 0
          ? Number((bucket.hotspotComponent / bucket.componentWeight).toFixed(4))
          : 0,
      proximityComponent:
        bucket.componentWeight > 0
          ? Number((bucket.proximityComponent / bucket.componentWeight).toFixed(4))
          : 0,
      greenDeficit:
        bucket.componentWeight > 0
          ? Number((bucket.greenDeficit / bucket.componentWeight).toFixed(4))
          : 0,
      topographicCompression:
        bucket.componentWeight > 0
          ? Number((bucket.topographicCompression / bucket.componentWeight).toFixed(4))
          : 0,
    })
  }

  const cells = enrichRiskCells(gridCells, cellContexts, risksByCellId).sort(
    (left, right) => right.score - left.score,
  )
  return {
    trainingScope,
    totalDays: totalOverlapDays,
    cells,
    topRiskCells: cells.slice(0, 10),
    unsupportedReason: null,
  }
}

function aggregateSourceSummaries(
  slices: SourceSummarySlice[],
  filters: FilterState,
) {
  const trainingScope = filters.spatialTrainingScope
  const coefficientTotals = new Map<
    SourceDriverCoefficient['key'],
    {
      key: SourceDriverCoefficient['key']
      label: string
      value: number
      weight: number
    }
  >()
  let sampleCount = 0
  let modelScore = 0
  let modelScoreWeight = 0
  let prevailingWindDirection = 0
  let prevailingWindWeight = 0
  let totalOverlapDays = 0
  let supportedSliceCount = 0
  let rejectedReason: string | null = null

  for (const slice of slices) {
    const payload = slice.scopes[trainingScope]
    if (!payload?.supported) {
      rejectedReason =
        rejectedReason ?? payload?.unavailableReason ?? 'Kaynak proxy modeli desteklenmiyor.'
      continue
    }

    const overlapDays =
      slices.length === 1 && filters.eventId
        ? inclusiveDayCount(slice.startDate, slice.endDate)
        : overlappingDayCount(
            filters.startDate,
            filters.endDate,
            slice.startDate,
            slice.endDate,
          )

    if (overlapDays <= 0) {
      continue
    }

    supportedSliceCount += 1
    totalOverlapDays += overlapDays
    sampleCount += payload.sampleCount

    if (payload.modelScore !== null) {
      modelScore += payload.modelScore * overlapDays
      modelScoreWeight += overlapDays
    }

    if (payload.prevailingWindDirection !== null) {
      prevailingWindDirection += payload.prevailingWindDirection * overlapDays
      prevailingWindWeight += overlapDays
    }

    for (const coefficient of payload.coefficients) {
      const bucket = coefficientTotals.get(coefficient.key) ?? {
        key: coefficient.key,
        label: coefficient.label,
        value: 0,
        weight: 0,
      }
      bucket.value += coefficient.coefficient * overlapDays
      bucket.weight += overlapDays
      coefficientTotals.set(coefficient.key, bucket)
    }
  }

  if (supportedSliceCount === 0 || totalOverlapDays === 0) {
    return {
      trainingScope,
      totalDays: 0,
      sampleCount: 0,
      modelScore: null,
      prevailingWindDirection: null,
      coefficients: [] as SourceDriverCoefficient[],
      dominantDriver: null as SourceDriverCoefficient | null,
      unsupportedReason:
        rejectedReason ?? 'Secili tarih araligi icin kullanilabilir kaynak proxy ozeti yok.',
    }
  }

  const coefficients = [...coefficientTotals.values()]
    .filter((bucket) => bucket.weight > 0)
    .map<SourceDriverCoefficient>((bucket) => ({
      key: bucket.key,
      label: bucket.label,
      coefficient: Number((bucket.value / bucket.weight).toFixed(4)),
    }))
    .sort((left, right) => Math.abs(right.coefficient) - Math.abs(left.coefficient))

  return {
    trainingScope,
    totalDays: totalOverlapDays,
    sampleCount,
    modelScore:
      modelScoreWeight > 0 ? Number((modelScore / modelScoreWeight).toFixed(4)) : null,
    prevailingWindDirection:
      prevailingWindWeight > 0
        ? Number((prevailingWindDirection / prevailingWindWeight).toFixed(2))
        : null,
    coefficients,
    dominantDriver: coefficients[0] ?? null,
    unsupportedReason: null,
  }
}

function buildSpatialStatsExportRows(
  hotspots: SpatialHotspotCell[],
  pollutant: Pollutant,
  stats: SpatialStatsAggregation,
) {
  return hotspots.map((hotspot) => ({
    station_id: hotspot.stationId,
    station_name: hotspot.stationName,
    pollutant,
    slice_label: stats.label,
    analysis_mode: stats.mode,
    training_scope: stats.trainingScope,
    lat: hotspot.lat,
    lng: hotspot.lng,
    value: normalizeNumber(hotspot.value),
    z_score: normalizeNumber(hotspot.zScore),
    p_value: normalizeNumber(hotspot.pValue),
    significance: normalizeNumber(hotspot.significance),
    classification: hotspot.classification,
    global_moran_i: normalizeNumber(stats.globalMoranI),
    global_moran_z_score: normalizeNumber(stats.globalMoranZScore),
    global_moran_p_value: normalizeNumber(stats.globalMoranPValue),
  }))
}

function buildRiskExportRows(
  cells: Array<RiskOverlayCell & SpatialGridCell & SpatialCellContext>,
  pollutant: Pollutant,
  risk: RiskOverlayAggregation,
) {
  return cells.map((cell) => ({
    cell_id: cell.id,
    pollutant,
    slice_label: risk.label,
    analysis_mode: risk.mode,
    training_scope: risk.trainingScope,
    lat: Number(cell.center.lat.toFixed(6)),
    lng: Number(cell.center.lng.toFixed(6)),
    risk_score: normalizeNumber(cell.score),
    risk_label: cell.label,
    pollution_component: normalizeNumber(cell.pollutionComponent),
    hotspot_component: normalizeNumber(cell.hotspotComponent),
    proximity_component: normalizeNumber(cell.proximityComponent),
    green_deficit: normalizeNumber(cell.greenDeficit),
    topographic_compression: normalizeNumber(cell.topographicCompression),
    road_density: normalizeNumber(cell.roadDensity),
    green_ratio: normalizeNumber(cell.greenRatio),
    impervious_ratio: normalizeNumber(cell.imperviousRatio),
    industry_count_3km: cell.industryCountWithin3Km,
    nearest_primary_road_m: normalizeNumber(cell.nearestPrimaryRoadM),
    nearest_industry_m: normalizeNumber(cell.nearestIndustryM),
  }))
}

function buildSourceSummaryExportRows(
  summary: SourceSummaryAggregation,
  pollutant: Pollutant,
) {
  return summary.coefficients.map((coefficient) => ({
    pollutant,
    training_scope: summary.trainingScope,
    slice_label: summary.label,
    analysis_mode: summary.mode,
    model_score: normalizeNumber(summary.modelScore),
    prevailing_wind_direction: normalizeNumber(summary.prevailingWindDirection),
    driver_key: coefficient.key,
    driver_label: coefficient.label,
    standardized_coefficient: normalizeNumber(coefficient.coefficient),
    dominant_driver: summary.dominantDriver?.key ?? null,
  }))
}

function buildForecastExportRows(
  forecasts: ForecastSlice[],
  pollutant: Pollutant,
  trainingScope: SpatialTrainingScope,
) {
  return forecasts.flatMap((forecast) =>
    forecast.points.map((point) => ({
      pollutant,
      training_scope: trainingScope,
      horizon_days: forecast.horizonDays,
      timestamp: point.timestamp,
      value: normalizeNumber(point.value),
      lower: normalizeNumber(point.lower),
      upper: normalizeNumber(point.upper),
      mae: normalizeNumber(forecast.mae),
      rmse: normalizeNumber(forecast.rmse),
    })),
  )
}

export async function loadAnalysisManifest(signal?: AbortSignal) {
  if (manifestCache) {
    return manifestCache
  }

  if (!manifestPromise) {
    manifestPromise = fetchRawManifest(signal)
      .then((rawManifest) => {
        const payload = normalizeManifest(rawManifest)
        manifestCache = payload
        return payload
      })
      .finally(() => {
        manifestPromise = null
      })
  }

  return manifestPromise
}

export async function loadSpatialAnalysisPackage(
  manifest: AnalysisManifest,
  pollutant: Pollutant,
  signal?: AbortSignal,
) {
  const cached = packageCache.get(pollutant)
  if (cached) {
    return cached
  }

  const descriptor = manifest.packages.find((item) => item.pollutant === pollutant)
  if (!descriptor) {
    throw new Error(`Analysis package not found for ${pollutant}`)
  }

  const existingPromise = packagePromises.get(pollutant)
  if (existingPromise) {
    return existingPromise
  }

  const request = (async () => {
    const rawManifest = rawManifestCache ?? (await fetchRawManifest(signal))
    const scopePaths = descriptor.sourceScopePaths ?? {}
    const urls = Object.values(scopePaths)

    if (!urls.length) {
      throw new Error(`Spatial package paths missing for ${pollutant}`)
    }

    const rawPackages = await Promise.all(urls.map((url) => fetchRawPackage(url, signal)))
    const payload = buildNormalizedPackage(rawManifest, rawPackages)
    packageCache.set(pollutant, payload)
    return payload
  })().finally(() => {
    packagePromises.delete(pollutant)
  })

  packagePromises.set(pollutant, request)
  return request
}

export function resolveSpatialAnalysis(
  dataset: BursaDataset,
  filters: FilterState,
  manifest: AnalysisManifest | null,
  packageData: SpatialAnalysisPackage | null,
): SpatialAnalysisResolvedData {
  const unsupportedReason = selectedStationUnsupportedReason(dataset, filters)
  if (unsupportedReason) {
    return {
      manifest,
      packageData,
      surface: null,
      stats: null,
      risk: null,
      sourceSummary: null,
      forecast: null,
      notices: [],
      error: null,
      unsupportedReason,
    }
  }

  if (!manifest || !packageData) {
    return {
      manifest,
      packageData,
      surface: null,
      stats: null,
      risk: null,
      sourceSummary: null,
      forecast: null,
      notices: [],
      error: null,
      unsupportedReason: null,
    }
  }

  if (manifest.coreDatasetVersion !== dataset.metadata.version) {
    return {
      manifest,
      packageData,
      surface: null,
      stats: null,
      risk: null,
      sourceSummary: null,
      forecast: null,
      notices: [],
      error: null,
      unsupportedReason: 'Analiz paketi veri surumu ile uyusmuyor.',
    }
  }

  if (packageData.coreDatasetVersion !== dataset.metadata.version) {
    return {
      manifest,
      packageData,
      surface: null,
      stats: null,
      risk: null,
      sourceSummary: null,
      forecast: null,
      notices: [],
      error: null,
      unsupportedReason: 'Kirletici paketi guncel veri seti ile uyusmuyor.',
    }
  }

  const notices: string[] = []
  const eventSlice = filters.eventId
    ? packageData.eventSlices.find((slice) => slice.sliceId === `event-${filters.eventId}`)
    : null

  const slices =
    eventSlice
      ? [eventSlice]
      : packageData.monthlySlices.filter(
          (slice) =>
            overlappingDayCount(
              filters.startDate,
              filters.endDate,
              dateOnly(slice.startDate),
              dateOnly(slice.endDate),
            ) > 0,
        )
  const statsSlices =
    eventSlice
      ? packageData.spatialStats.filter((slice) => slice.sliceId === eventSlice.sliceId)
      : packageData.spatialStats.filter(
          (slice) =>
            overlappingDayCount(
              filters.startDate,
              filters.endDate,
              dateOnly(slice.startDate),
              dateOnly(slice.endDate),
            ) > 0,
        )
  const riskSlices =
    eventSlice
      ? packageData.riskOverlays.filter((slice) => slice.sliceId === eventSlice.sliceId)
      : packageData.riskOverlays.filter(
          (slice) =>
            overlappingDayCount(
              filters.startDate,
              filters.endDate,
              dateOnly(slice.startDate),
              dateOnly(slice.endDate),
            ) > 0,
        )
  const sourceSummarySlices =
    eventSlice
      ? packageData.sourceSummaries.filter((slice) => slice.sliceId === eventSlice.sliceId)
      : packageData.sourceSummaries.filter(
          (slice) =>
            overlappingDayCount(
              filters.startDate,
              filters.endDate,
              dateOnly(slice.startDate),
              dateOnly(slice.endDate),
            ) > 0,
        )

  const aggregation = aggregateSurfaceCells(
    slices,
    filters,
    packageData.availableMethods,
  )
  const statsAggregation = aggregateSpatialStats(statsSlices, filters)
  const riskAggregation = aggregateRiskOverlays(
    riskSlices,
    filters,
    packageData.gridCells,
    packageData.cellContexts,
  )
  const sourceSummaryAggregation = aggregateSourceSummaries(
    sourceSummarySlices,
    filters,
  )

  if (aggregation.usesFallbackMethod) {
    notices.push('Secili dilimde Kriging uygun bulunmadi; IDW yuzeyi kullanildi.')
  }
  const label = eventSlice
    ? eventSlice.label
    : `${filters.startDate} - ${filters.endDate} mekansal birlesimi`
  const mode = eventSlice ? 'event' : 'range'
  const startDate = eventSlice ? dateOnly(eventSlice.startDate) : filters.startDate
  const endDate = eventSlice ? dateOnly(eventSlice.endDate) : filters.endDate
  const totalDays = eventSlice?.days ?? inclusiveDayCount(filters.startDate, filters.endDate)

  const cells = aggregation.unsupportedReason
    ? []
    : enrichCells(
        packageData.gridCells,
        packageData.cellContexts,
        aggregation.valuesByCellId,
      )
  const topPollutedCells = sortByNullableValue(cells, (cell) => cell.value, 'desc', 6)
  const cleanestCells = sortByNullableValue(cells, (cell) => cell.value, 'asc', 6)
  const highestExceedanceCells = sortByNullableValue(
    cells,
    (cell) => cell.exceedanceRatio,
    'desc',
    6,
  )
  const highestProximityCells = sortByNullableValue(
    cells,
    (cell) => cell.proximityIndex,
    'desc',
    8,
  )

  const surface: SpatialSurfaceAggregation = {
    label,
    mode,
    startDate,
    endDate,
    days: totalDays,
    slicesUsed: slices.map((slice) => slice.sliceId),
    trainingScope: aggregation.trainingScope,
    requestedMethod: filters.surfaceMethod,
    effectiveMethod: aggregation.effectiveMethod,
    usesFallbackMethod: aggregation.usesFallbackMethod,
    cells,
    topPollutedCells,
    cleanestCells,
    highestExceedanceCells,
    highestProximityCells,
    exportRows: buildExportRows(cells, filters.pollutant, {
      label,
      mode,
      startDate,
      endDate,
      days: totalDays,
      slicesUsed: slices.map((slice) => slice.sliceId),
      trainingScope: aggregation.trainingScope,
      requestedMethod: filters.surfaceMethod,
      effectiveMethod: aggregation.effectiveMethod,
      usesFallbackMethod: aggregation.usesFallbackMethod,
      cells: [],
      topPollutedCells: [],
      cleanestCells: [],
      highestExceedanceCells: [],
      highestProximityCells: [],
      exportRows: [],
      unsupportedReason: aggregation.unsupportedReason ?? undefined,
    }),
    unsupportedReason: aggregation.unsupportedReason ?? undefined,
  }
  const stats: SpatialStatsAggregation = statsAggregation.unsupportedReason
    ? {
        label,
        mode,
        startDate,
        endDate,
        days: totalDays,
        slicesUsed: statsSlices.map((slice) => slice.sliceId),
        trainingScope: statsAggregation.trainingScope,
        globalMoranI: null,
        globalMoranZScore: null,
        globalMoranPValue: null,
        hotspots: [],
        topHotspots: [],
        topColdspots: [],
        exportRows: [],
        unsupportedReason: statsAggregation.unsupportedReason ?? undefined,
      }
    : {
        label,
        mode,
        startDate,
        endDate,
        days: totalDays,
        slicesUsed: statsSlices.map((slice) => slice.sliceId),
        trainingScope: statsAggregation.trainingScope,
        globalMoranI: statsAggregation.globalMoranI,
        globalMoranZScore: statsAggregation.globalMoranZScore,
        globalMoranPValue: statsAggregation.globalMoranPValue,
        hotspots: statsAggregation.hotspots,
        topHotspots: statsAggregation.topHotspots,
        topColdspots: statsAggregation.topColdspots,
        exportRows: buildSpatialStatsExportRows(
          statsAggregation.hotspots,
          filters.pollutant,
          {
            label,
            mode,
            startDate,
            endDate,
            days: totalDays,
            slicesUsed: statsSlices.map((slice) => slice.sliceId),
            trainingScope: statsAggregation.trainingScope,
            globalMoranI: statsAggregation.globalMoranI,
            globalMoranZScore: statsAggregation.globalMoranZScore,
            globalMoranPValue: statsAggregation.globalMoranPValue,
            hotspots: statsAggregation.hotspots,
            topHotspots: statsAggregation.topHotspots,
            topColdspots: statsAggregation.topColdspots,
            exportRows: [],
          },
        ),
      }
  const risk: RiskOverlayAggregation = riskAggregation.unsupportedReason
    ? {
        label,
        mode,
        startDate,
        endDate,
        days: totalDays,
        slicesUsed: riskSlices.map((slice) => slice.sliceId),
        trainingScope: riskAggregation.trainingScope,
        cells: [],
        topRiskCells: [],
        exportRows: [],
        unsupportedReason: riskAggregation.unsupportedReason ?? undefined,
      }
    : {
        label,
        mode,
        startDate,
        endDate,
        days: totalDays,
        slicesUsed: riskSlices.map((slice) => slice.sliceId),
        trainingScope: riskAggregation.trainingScope,
        cells: riskAggregation.cells,
        topRiskCells: riskAggregation.topRiskCells,
        exportRows: buildRiskExportRows(
          riskAggregation.cells,
          filters.pollutant,
          {
            label,
            mode,
            startDate,
            endDate,
            days: totalDays,
            slicesUsed: riskSlices.map((slice) => slice.sliceId),
            trainingScope: riskAggregation.trainingScope,
            cells: riskAggregation.cells,
            topRiskCells: riskAggregation.topRiskCells,
            exportRows: [],
          },
        ),
      }
  const sourceSummary: SourceSummaryAggregation = sourceSummaryAggregation.unsupportedReason
    ? {
        label,
        mode,
        startDate,
        endDate,
        days: totalDays,
        slicesUsed: sourceSummarySlices.map((slice) => slice.sliceId),
        trainingScope: sourceSummaryAggregation.trainingScope,
        sampleCount: 0,
        modelScore: null,
        prevailingWindDirection: null,
        coefficients: [],
        dominantDriver: null,
        exportRows: [],
        unsupportedReason: sourceSummaryAggregation.unsupportedReason ?? undefined,
      }
    : {
        label,
        mode,
        startDate,
        endDate,
        days: totalDays,
        slicesUsed: sourceSummarySlices.map((slice) => slice.sliceId),
        trainingScope: sourceSummaryAggregation.trainingScope,
        sampleCount: sourceSummaryAggregation.sampleCount,
        modelScore: sourceSummaryAggregation.modelScore,
        prevailingWindDirection: sourceSummaryAggregation.prevailingWindDirection,
        coefficients: sourceSummaryAggregation.coefficients,
        dominantDriver: sourceSummaryAggregation.dominantDriver,
        exportRows: buildSourceSummaryExportRows(
          {
            label,
            mode,
            startDate,
            endDate,
            days: totalDays,
            slicesUsed: sourceSummarySlices.map((slice) => slice.sliceId),
            trainingScope: sourceSummaryAggregation.trainingScope,
            sampleCount: sourceSummaryAggregation.sampleCount,
            modelScore: sourceSummaryAggregation.modelScore,
            prevailingWindDirection: sourceSummaryAggregation.prevailingWindDirection,
            coefficients: sourceSummaryAggregation.coefficients,
            dominantDriver: sourceSummaryAggregation.dominantDriver,
            exportRows: [],
          },
          filters.pollutant,
        ),
      }
  const selectedForecasts = packageData.forecasts.filter(
    (forecast) => forecast.trainingScope === filters.spatialTrainingScope,
  )
  const forecastUnsupportedReason =
    selectedForecasts.length === 0
      ? 'Secili kapsam icin forecast paketi bulunamadi.'
      : selectedForecasts.every((forecast) => !forecast.supported)
        ? selectedForecasts.find((forecast) => forecast.unavailableReason)?.unavailableReason ??
          'Forecast bu kapsam icin desteklenmiyor.'
        : undefined
  const forecast: ForecastAggregation = {
    trainingScope: filters.spatialTrainingScope,
    forecasts: selectedForecasts,
    exportRows: buildForecastExportRows(
      selectedForecasts.filter((item) => item.supported),
      filters.pollutant,
      filters.spatialTrainingScope,
    ),
    unsupportedReason: forecastUnsupportedReason,
  }

  return {
    manifest,
    packageData,
    surface,
    stats,
    risk,
    sourceSummary,
    forecast,
    notices,
    error: null,
    unsupportedReason: null,
  }
}

export function resetSpatialAnalysisCacheForTests() {
  rawManifestCache = null
  manifestCache = null
  manifestPromise = null
  packageCache.clear()
  packagePromises.clear()
}
