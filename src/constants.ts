import type {
  AnalysisTab,
  CompareMode,
  FilterState,
  LayerKey,
  Pollutant,
  SpatialTrainingScope,
  StationSourceScope,
  SurfaceMethod,
  TimeResolution,
} from './types'

export const POLLUTANTS: Pollutant[] = ['PM10', 'PM2.5', 'NO2', 'SO2', 'O3', 'CO']

export const RESOLUTIONS: Array<{ value: TimeResolution; label: string }> = [
  { value: 'day', label: 'Günlük' },
  { value: 'month', label: 'Aylık' },
  { value: 'season', label: 'Mevsimlik' },
  { value: 'year', label: 'Yıllık' },
]

export const COMPARE_MODES: Array<{ value: CompareMode; label: string }> = [
  { value: 'month-over-month', label: 'Ay-Ay' },
  { value: 'season-over-season', label: 'Mevsim-Mevsim' },
  { value: 'same-month-years', label: 'Aynı Ay Farklı Yıl' },
]

export const BUFFER_OPTIONS: Array<250 | 500 | 1000> = [250, 500, 1000]

export const SURFACE_METHODS: Array<{
  value: SurfaceMethod
  label: string
}> = [
  { value: 'idw', label: 'IDW' },
  { value: 'kriging', label: 'Kriging' },
]

export const SPATIAL_TRAINING_SCOPES: Array<{
  value: SpatialTrainingScope
  label: string
}> = [
  { value: 'measured', label: 'Ölçülen istasyonlar' },
  { value: 'measured-plus-sensor', label: 'Ölçülen + belediye sensörü' },
]

export const ANALYSIS_TABS: Array<{
  value: AnalysisTab
  label: string
}> = [
  { value: 'general', label: 'Genel' },
  { value: 'spatial', label: 'Mekânsal' },
  { value: 'spatial-stats', label: 'Mekânsal İstatistik' },
  { value: 'forecast', label: 'Tahmin' },
  { value: 'data-explorer', label: 'Veri Gezgini' },
]

export const STATION_SOURCE_SCOPES: Array<{
  value: StationSourceScope
  label: string
}> = [
  { value: 'official', label: 'Resmî istasyonlar' },
  { value: 'municipal-official', label: 'Resmî belediye' },
  { value: 'sensor', label: 'Belediye sensör ağı' },
  { value: 'modeled', label: 'Model tabanlı seri' },
  { value: 'all', label: 'Tümü' },
]

export const LAYER_LABELS: Record<LayerKey, string> = {
  pollutionSurface: 'Kirlilik bulutu',
  interpolationSurface: 'Bilimsel yüzey',
  hotspots: 'Hotspot',
  risk: 'Çevresel risk',
  proximity: 'Yakınlık',
  stations: 'İstasyonlar',
  windVectors: 'Rüzgâr yönü',
  eventMarkers: 'Olay işaretleri',
  neighborhoods: 'Mahalle sınırları',
  roads: 'Yollar',
  industries: 'Sanayi/fabrika',
  greenAreas: 'Yeşil alan',
  elevation: 'DEM',
}

export const SCREENING_THRESHOLDS: Record<Pollutant, number> = {
  PM10: 50,
  'PM2.5': 25,
  NO2: 100,
  SO2: 125,
  O3: 120,
  CO: 10,
}

export const DEFAULT_FILTERS: FilterState = {
  pollutant: 'PM10',
  stationId: 'all',
  stationSourceScope: 'all',
  eventId: '',
  resolution: 'month',
  compareMode: 'month-over-month',
  bufferRadius: 500,
  surfaceMethod: 'idw',
  spatialTrainingScope: 'measured',
  startDate: '',
  endDate: '',
  activeLayers: {
    pollutionSurface: true,
    interpolationSurface: false,
    hotspots: false,
    risk: false,
    proximity: false,
    stations: true,
    windVectors: false,
    eventMarkers: true,
    neighborhoods: false,
    roads: false,
    industries: false,
    greenAreas: true,
    elevation: false,
  },
}

export const BURSA_CENTER: [number, number] = [40.195, 29.06]

export const BURSA_FOCUS_BOUNDS: [[number, number], [number, number]] = [
  [39.59, 28.08],
  [40.76, 29.91],
]
