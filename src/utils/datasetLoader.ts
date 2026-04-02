import type {
  BursaDataset,
  FilterState,
  LineFeature,
  MapLayerBundle,
  MeteoTimeSeriesRecord,
  PointFeature,
  Pollutant,
  PolygonFeature,
  Station,
  StationContextMetric,
  StationTimeSeriesRecord,
} from '../types'

const DATASET_MANIFEST_URL = '/data/dataset/manifest.json'
const LEGACY_DATASET_URL = '/data/bursa-air-quality-v1.json'

type MapLayerKey = keyof MapLayerBundle
type LayerLoadState = Pick<
  FilterState['activeLayers'],
  'roads' | 'industries' | 'greenAreas' | 'elevation'
>

interface DatasetManifest {
  manifestVersion: string
  datasetVersion: string
  generatedAt: string
  corePath: string
  stationSeriesPaths: Partial<Record<Pollutant, string>>
  meteoPath: string
  layerPaths: Record<MapLayerKey, string>
}

interface DatasetCorePayload {
  metadata: BursaDataset['metadata']
  stations: Station[]
  contextMetrics: StationContextMetric[]
  events: BursaDataset['events']
  roads?: LineFeature[]
  industries?: PointFeature[]
  greenAreas?: PolygonFeature[]
  elevationGrid?: PolygonFeature[]
}

interface DatasetLoadOptions {
  includeMeteo?: boolean
}

let manifestCache: DatasetManifest | null = null
let manifestPromise: Promise<DatasetManifest | null> | null = null
let manifestResolved = false
let coreCache: DatasetCorePayload | null = null
let corePromise: Promise<DatasetCorePayload> | null = null
const stationSeriesCache = new Map<Pollutant, StationTimeSeriesRecord[]>()
const stationSeriesPromises = new Map<Pollutant, Promise<StationTimeSeriesRecord[]>>()
let meteoCache: MeteoTimeSeriesRecord[] | null = null
let meteoPromise: Promise<MeteoTimeSeriesRecord[]> | null = null
const layerCache = new Map<MapLayerKey, MapLayerBundle[MapLayerKey]>()
const layerPromises = new Map<MapLayerKey, Promise<MapLayerBundle[MapLayerKey]>>()
let legacyDatasetCache: BursaDataset | null = null
let legacyDatasetPromise: Promise<BursaDataset> | null = null

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Dataset request failed: ${response.status}`)
  }

  return (await response.json()) as T
}

function chunkUrl(path: string) {
  return `/data/dataset/${path}`
}

export async function loadDatasetManifest() {
  if (manifestResolved) {
    return manifestCache
  }

  if (!manifestPromise) {
    manifestPromise = fetch(datasetManifestUrl())
      .then(async (response) => {
        if (response.status === 404) {
          manifestResolved = true
          return null
        }

        if (!response.ok) {
          throw new Error(`Dataset manifest request failed: ${response.status}`)
        }

        const payload = (await response.json()) as DatasetManifest
        manifestCache = payload
        manifestResolved = true
        return payload
      })
      .finally(() => {
        manifestPromise = null
      })
  }

  return manifestPromise
}

function datasetManifestUrl() {
  return DATASET_MANIFEST_URL
}

async function loadLegacyDataset() {
  if (legacyDatasetCache) {
    return legacyDatasetCache
  }

  if (!legacyDatasetPromise) {
    legacyDatasetPromise = fetchJson<BursaDataset>(LEGACY_DATASET_URL).then((payload) => {
      legacyDatasetCache = payload
      return payload
    }).finally(() => {
      legacyDatasetPromise = null
    })
  }

  return legacyDatasetPromise
}

async function loadDatasetCore(manifest: DatasetManifest) {
  if (coreCache) {
    return coreCache
  }

  if (!corePromise) {
    corePromise = fetchJson<DatasetCorePayload>(chunkUrl(manifest.corePath)).then((payload) => {
      coreCache = payload
      return payload
    }).finally(() => {
      corePromise = null
    })
  }

  return corePromise
}

async function loadStationSeriesChunk(
  manifest: DatasetManifest,
  pollutant: Pollutant,
) {
  const cached = stationSeriesCache.get(pollutant)
  if (cached) {
    return cached
  }

  const path = manifest.stationSeriesPaths[pollutant]
  if (!path) {
    return []
  }

  const existingPromise = stationSeriesPromises.get(pollutant)
  if (existingPromise) {
    return existingPromise
  }

  const request = fetchJson<StationTimeSeriesRecord[]>(chunkUrl(path)).then((payload) => {
    stationSeriesCache.set(pollutant, payload)
    return payload
  }).finally(() => {
    stationSeriesPromises.delete(pollutant)
  })

  stationSeriesPromises.set(pollutant, request)
  return request
}

async function loadMeteoChunk(manifest: DatasetManifest) {
  if (meteoCache) {
    return meteoCache
  }

  if (!meteoPromise) {
    meteoPromise = fetchJson<MeteoTimeSeriesRecord[]>(chunkUrl(manifest.meteoPath)).then((payload) => {
      meteoCache = payload
      return payload
    }).finally(() => {
      meteoPromise = null
    })
  }

  return meteoPromise
}

export async function loadDatasetMeteo(): Promise<MeteoTimeSeriesRecord[]> {
  const manifest = await loadDatasetManifest()
  if (!manifest) {
    return (await loadLegacyDataset()).meteoTimeSeries
  }

  return loadMeteoChunk(manifest)
}

async function loadLayerChunk(
  manifest: DatasetManifest,
  layerKey: MapLayerKey,
) {
  const cached = layerCache.get(layerKey)
  if (cached) {
    return cached
  }

  const existingPromise = layerPromises.get(layerKey)
  if (existingPromise) {
    return existingPromise
  }

  const request = fetchJson<MapLayerBundle[MapLayerKey]>(
    chunkUrl(manifest.layerPaths[layerKey]),
  ).then((payload) => {
    layerCache.set(layerKey, payload)
    return payload
  }).finally(() => {
    layerPromises.delete(layerKey)
  })

  layerPromises.set(layerKey, request)
  return request
}

export async function loadBaseDataset(
  pollutant: Pollutant,
  options: DatasetLoadOptions = {},
): Promise<BursaDataset> {
  const includeMeteo = options.includeMeteo ?? true
  const manifest = await loadDatasetManifest()
  if (!manifest) {
    return loadLegacyDataset()
  }

  const [core, stationTimeSeries, meteoTimeSeries] = await Promise.all([
    loadDatasetCore(manifest),
    loadStationSeriesChunk(manifest, pollutant),
    includeMeteo ? loadMeteoChunk(manifest) : Promise.resolve([]),
  ])

  return {
    metadata: core.metadata,
    stations: core.stations,
    stationTimeSeries,
    meteoTimeSeries,
    contextMetrics: core.contextMetrics,
    events: core.events,
    roads: [],
    industries: [],
    greenAreas: [],
    elevationGrid: [],
  }
}

export async function loadMapLayers(
  activeLayers: LayerLoadState,
): Promise<Partial<MapLayerBundle>> {
  const manifest = await loadDatasetManifest()
  if (!manifest) {
    return {}
  }

  const requestedKeys = (Object.entries({
    roads: activeLayers.roads,
    industries: activeLayers.industries,
    greenAreas: activeLayers.greenAreas,
    elevationGrid: activeLayers.elevation,
  }) as Array<[MapLayerKey, boolean]>)
    .filter(([, enabled]) => enabled)
    .map(([key]) => key)

  if (!requestedKeys.length) {
    return {}
  }

  const entries = await Promise.all(
    requestedKeys.map(async (key) => [key, await loadLayerChunk(manifest, key)] as const),
  )

  return Object.fromEntries(entries) as Partial<MapLayerBundle>
}

export function mergeDatasetWithLayers(
  dataset: BursaDataset,
  layers: Partial<MapLayerBundle>,
): BursaDataset {
  if (!Object.keys(layers).length) {
    return dataset
  }

  return {
    ...dataset,
    roads: layers.roads ?? dataset.roads,
    industries: layers.industries ?? dataset.industries,
    greenAreas: layers.greenAreas ?? dataset.greenAreas,
    elevationGrid: layers.elevationGrid ?? dataset.elevationGrid,
  }
}
