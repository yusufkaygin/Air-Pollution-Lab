import type { CompareMode, FilterState, LayerKey, Pollutant, TimeResolution } from './types'

export const POLLUTANTS: Pollutant[] = ['PM10', 'PM2.5', 'NO2', 'SO2', 'O3']

export const RESOLUTIONS: Array<{ value: TimeResolution; label: string }> = [
  { value: 'day', label: 'Gunluk' },
  { value: 'month', label: 'Aylik' },
  { value: 'season', label: 'Mevsimlik' },
  { value: 'year', label: 'Yillik' },
]

export const COMPARE_MODES: Array<{ value: CompareMode; label: string }> = [
  { value: 'month-over-month', label: 'Ay-Ay' },
  { value: 'season-over-season', label: 'Mevsim-Mevsim' },
  { value: 'same-month-years', label: 'Ayni Ay Farkli Yil' },
]

export const BUFFER_OPTIONS: Array<250 | 500 | 1000> = [250, 500, 1000]

export const LAYER_LABELS: Record<LayerKey, string> = {
  stations: 'Istasyonlar',
  fireHotspots: 'Yangin hotspotlari',
  roads: 'Yollar',
  industries: 'Sanayi/fabrika',
  greenAreas: 'Yesil alan',
  elevation: 'Yukseklik',
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
  resolution: 'month',
  compareMode: 'month-over-month',
  bufferRadius: 500,
  startDate: '',
  endDate: '',
  activeLayers: {
    stations: true,
    fireHotspots: true,
    roads: true,
    industries: true,
    greenAreas: true,
    elevation: true,
  },
}

export const BURSA_CENTER: [number, number] = [40.195, 29.06]

export const BURSA_FOCUS_BOUNDS: [[number, number], [number, number]] = [
  [39.59, 28.08],
  [40.76, 29.91],
]
