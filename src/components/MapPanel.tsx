import { contours as d3Contours } from 'd3-contour'
import type { Feature, FeatureCollection, Geometry, Position } from 'geojson'
import { divIcon } from 'leaflet'
import type { CSSProperties } from 'react'
import { useEffect, useMemo, useState } from 'react'
import {
  Circle,
  GeoJSON,
  MapContainer,
  Marker,
  Pane,
  Polygon,
  Polyline,
  SVGOverlay,
  TileLayer,
  Tooltip,
} from 'react-leaflet'

import { BURSA_CENTER, BURSA_FOCUS_BOUNDS } from '../constants'
import type {
  AnalysisResult,
  BursaDataset,
  FilterState,
  PolygonFeature,
  Station,
} from '../types'
import { formatNumber } from '../utils/format'
import {
  buildPollutionPlumes,
  POLLUTION_OVERLAY_VIEWBOX,
} from '../utils/mapPlumes'

interface MapPanelProps {
  dataset: BursaDataset
  filters: FilterState
  analysis: AnalysisResult
  onSelectStation: (stationId: string) => void
}

interface BoundaryGeoJson {
  type: 'MultiPolygon'
  coordinates: number[][][][]
}

interface ElevationFeatureProperties {
  elevation: number
  label: string
  color: string
  opacity: number
  weight: number
  fillColor?: string
  fillOpacity?: number
  dashArray?: string
}

interface ElevationSurface {
  fills: FeatureCollection<Geometry, ElevationFeatureProperties>
  contours: FeatureCollection<Geometry, ElevationFeatureProperties>
}

type PlumeLayerStyle = CSSProperties & {
  '--plume-duration': string
  '--plume-delay': string
  '--plume-drift-x': string
  '--plume-drift-y': string
  '--plume-scale': string
  '--plume-rotation': string
}

const ELEVATION_LEGEND_BANDS = [
  { label: '0-149 m', color: '#d8e7cd' },
  { label: '150-349 m', color: '#b9d09b' },
  { label: '350-699 m', color: '#d3b676' },
  { label: '700-1099 m', color: '#bc9762' },
  { label: '1100-1499 m', color: '#8f7a66' },
  { label: '1500 m+', color: '#6d758f' },
] as const

const ELEVATION_FILL_STOPS = [
  { threshold: 150, color: '#dce8d4', opacity: 0.1 },
  { threshold: 350, color: '#bfd49e', opacity: 0.12 },
  { threshold: 700, color: '#d1b06d', opacity: 0.14 },
  { threshold: 1100, color: '#9f7f61', opacity: 0.16 },
  { threshold: 1500, color: '#687491', opacity: 0.18 },
] as const

const ELEVATION_CONTOUR_INTERVAL = 150

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function stationMatchesScope(station: Station, scope: FilterState['stationSourceScope']) {
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

function pollutionBand(value: number) {
  if (value >= 90) {
    return { color: '#b42318', label: 'Çok yüksek' }
  }

  if (value >= 60) {
    return { color: '#d97706', label: 'Yüksek' }
  }

  if (value >= 35) {
    return { color: '#ca8a04', label: 'Orta' }
  }

  return { color: '#1f7a5b', label: 'Düşük' }
}

function roadStyle(category: string, emphasizeTerrain: boolean) {
  if (category === 'motorway' || category === 'trunk') {
    return {
      color: '#44556c',
      weight: emphasizeTerrain ? 4.4 : 4.8,
      opacity: emphasizeTerrain ? 0.82 : 0.9,
    }
  }

  if (category === 'primary') {
    return {
      color: '#5f7590',
      weight: emphasizeTerrain ? 3.6 : 3.9,
      opacity: emphasizeTerrain ? 0.76 : 0.82,
    }
  }

  if (category === 'secondary') {
    return {
      color: '#8096af',
      weight: emphasizeTerrain ? 2.8 : 3.1,
      opacity: emphasizeTerrain ? 0.68 : 0.75,
    }
  }

  return {
    color: '#a9bac9',
    weight: emphasizeTerrain ? 2.1 : 2.4,
    opacity: emphasizeTerrain ? 0.56 : 0.64,
  }
}

function boundaryToLeafletRings(boundary: BoundaryGeoJson | null) {
  if (!boundary) {
    return []
  }

  return boundary.coordinates.map((polygon) =>
    polygon[0].map(([lng, lat]) => [lat, lng] as [number, number]),
  )
}

function stationIcon(color: string, selected: boolean) {
  return divIcon({
    className: 'map-div-icon',
    iconSize: selected ? [26, 26] : [22, 22],
    iconAnchor: selected ? [13, 13] : [11, 11],
    tooltipAnchor: [0, -14],
    html: `
      <div class="map-marker station-marker${selected ? ' selected' : ''}" style="--marker-color:${color}">
        <span class="marker-core"></span>
      </div>
    `,
  })
}

function industryIcon(category: string) {
  return divIcon({
    className: 'map-div-icon',
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    tooltipAnchor: [0, -14],
    html: `
      <div class="map-marker industry-marker" data-kind="${escapeHtml(category)}">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3 19h18v2H3zM4 18V9l5 2V8l5 3V6l5 4v8z"></path>
          <path d="M15 3h2v5h-2zM7 13h2v3H7zm4 0h2v3h-2zm4 0h2v3h-2z"></path>
        </svg>
      </div>
    `,
  })
}

function legendIndustryIcon() {
  return (
    <span className="legend-marker industry" aria-hidden="true">
      <svg viewBox="0 0 24 24">
        <path d="M3 19h18v2H3zM4 18V9l5 2V8l5 3V6l5 4v8z"></path>
        <path d="M15 3h2v5h-2zM7 13h2v3H7zm4 0h2v3h-2zm4 0h2v3h-2z"></path>
      </svg>
    </span>
  )
}

function centroidOfPolygon(polygon: PolygonFeature) {
  const ring =
    polygon.coordinates[0][0] === polygon.coordinates.at(-1)?.[0] &&
    polygon.coordinates[0][1] === polygon.coordinates.at(-1)?.[1]
      ? polygon.coordinates.slice(0, -1)
      : polygon.coordinates

  const lat = ring.reduce((sum, [pointLat]) => sum + pointLat, 0) / ring.length
  const lng = ring.reduce((sum, [, pointLng]) => sum + pointLng, 0) / ring.length

  return { lat, lng }
}

function projectContourGeometry(
  geometry: Geometry,
  bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number },
  width: number,
  height: number,
): Geometry {
  const project = ([x, y]: Position): Position => {
    const lng = bounds.minLng + (Number(x) / (width - 1)) * (bounds.maxLng - bounds.minLng)
    const lat = bounds.maxLat - (Number(y) / (height - 1)) * (bounds.maxLat - bounds.minLat)

    return [lng, lat]
  }

  if (geometry.type === 'MultiPolygon') {
    return {
      type: 'MultiPolygon',
      coordinates: geometry.coordinates.map((polygon) =>
        polygon.map((ring) => ring.map(project)),
      ),
    }
  }

  if (geometry.type === 'MultiLineString') {
    return {
      type: 'MultiLineString',
      coordinates: geometry.coordinates.map((line) => line.map(project)),
    }
  }

  return geometry
}

function buildElevationSurface(polygons: PolygonFeature[]): ElevationSurface | null {
  if (!polygons.length) {
    return null
  }

  const entries = polygons
    .filter((polygon) => polygon.value !== undefined)
    .map((polygon) => {
      const centroid = centroidOfPolygon(polygon)

      return {
        ...centroid,
        value: polygon.value ?? 0,
      }
    })

  const latCenters = [...new Set(entries.map((entry) => Number(entry.lat.toFixed(6))))].sort(
    (left, right) => right - left,
  )
  const lngCenters = [...new Set(entries.map((entry) => Number(entry.lng.toFixed(6))))].sort(
    (left, right) => left - right,
  )

  if (latCenters.length < 2 || lngCenters.length < 2) {
    return null
  }

  const valueLookup = new Map(
    entries.map((entry) => [
      `${entry.lat.toFixed(6)}:${entry.lng.toFixed(6)}`,
      entry.value,
    ]),
  )

  const allLats = polygons.flatMap((polygon) => polygon.coordinates.map(([lat]) => lat))
  const allLngs = polygons.flatMap((polygon) => polygon.coordinates.map(([, lng]) => lng))
  const bounds = {
    minLat: Math.min(...allLats),
    maxLat: Math.max(...allLats),
    minLng: Math.min(...allLngs),
    maxLng: Math.max(...allLngs),
  }

  const latStep = Math.abs(latCenters[0] - latCenters[1])
  const lngStep = Math.abs(lngCenters[1] - lngCenters[0])
  const width = 88
  const height = 88

  const bilinearSample = (lat: number, lng: number) => {
    const rowPosition = clamp((latCenters[0] - lat) / latStep, 0, latCenters.length - 1)
    const colPosition = clamp((lng - lngCenters[0]) / lngStep, 0, lngCenters.length - 1)

    const row0 = Math.floor(rowPosition)
    const row1 = Math.min(row0 + 1, latCenters.length - 1)
    const col0 = Math.floor(colPosition)
    const col1 = Math.min(col0 + 1, lngCenters.length - 1)

    const topLeft =
      valueLookup.get(
        `${latCenters[row0].toFixed(6)}:${lngCenters[col0].toFixed(6)}`,
      ) ?? 0
    const topRight =
      valueLookup.get(
        `${latCenters[row0].toFixed(6)}:${lngCenters[col1].toFixed(6)}`,
      ) ?? topLeft
    const bottomLeft =
      valueLookup.get(
        `${latCenters[row1].toFixed(6)}:${lngCenters[col0].toFixed(6)}`,
      ) ?? topLeft
    const bottomRight =
      valueLookup.get(
        `${latCenters[row1].toFixed(6)}:${lngCenters[col1].toFixed(6)}`,
      ) ?? topLeft

    const rowWeight = rowPosition - row0
    const colWeight = colPosition - col0
    const topBlend = topLeft * (1 - colWeight) + topRight * colWeight
    const bottomBlend = bottomLeft * (1 - colWeight) + bottomRight * colWeight

    return topBlend * (1 - rowWeight) + bottomBlend * rowWeight
  }

  const raster: number[] = []

  for (let rowIndex = 0; rowIndex < height; rowIndex += 1) {
    const rowProgress = rowIndex / (height - 1)
    const lat = bounds.maxLat - rowProgress * (bounds.maxLat - bounds.minLat)

    for (let columnIndex = 0; columnIndex < width; columnIndex += 1) {
      const columnProgress = columnIndex / (width - 1)
      const lng = bounds.minLng + columnProgress * (bounds.maxLng - bounds.minLng)
      raster.push(bilinearSample(lat, lng))
    }
  }

  const contourGenerator = d3Contours().size([width, height]).smooth(true)
  const fillFeatures = contourGenerator
    .thresholds(ELEVATION_FILL_STOPS.map((stop) => stop.threshold))(raster)
    .map((feature) => {
      const stop =
        ELEVATION_FILL_STOPS.find((entry) => entry.threshold === Number(feature.value)) ??
        ELEVATION_FILL_STOPS[0]

      return {
        type: 'Feature' as const,
        properties: {
          elevation: Number(feature.value),
          label: `${Number(feature.value)} m ve üzeri`,
          color: stop.color,
          fillColor: stop.color,
          fillOpacity: stop.opacity,
          opacity: 0,
          weight: 0,
        },
        geometry: projectContourGeometry(feature as Geometry, bounds, width, height),
      }
    })

  const maxValue = Math.max(...entries.map((entry) => entry.value))
  const contourThresholds: number[] = []

  for (
    let elevation = ELEVATION_CONTOUR_INTERVAL;
    elevation <= Math.ceil(maxValue / ELEVATION_CONTOUR_INTERVAL) * ELEVATION_CONTOUR_INTERVAL;
    elevation += ELEVATION_CONTOUR_INTERVAL
  ) {
    contourThresholds.push(elevation)
  }

  const contourFeatures = contourGenerator
    .thresholds(contourThresholds)(raster)
    .map((feature) => {
      const elevation = Number(feature.value)
      const major = elevation % (ELEVATION_CONTOUR_INTERVAL * 2) === 0

      return {
        type: 'Feature' as const,
        properties: {
          elevation,
          label: `${elevation} m izohips`,
          color: major ? '#42526a' : '#607089',
          opacity: major ? 0.72 : 0.36,
          weight: major ? 1.55 : 0.9,
          dashArray: major ? undefined : '4 8',
        },
        geometry: projectContourGeometry(feature as Geometry, bounds, width, height),
      }
    })

  return {
    fills: {
      type: 'FeatureCollection',
      features: fillFeatures,
    },
    contours: {
      type: 'FeatureCollection',
      features: contourFeatures,
    },
  }
}

export function MapPanel({
  dataset,
  filters,
  analysis,
  onSelectStation,
}: MapPanelProps) {
  const [boundary, setBoundary] = useState<BoundaryGeoJson | null>(null)
  const snapshotByStationId = useMemo(
    () => new Map(analysis.stationSnapshots.map((snapshot) => [snapshot.stationId, snapshot])),
    [analysis.stationSnapshots],
  )
  const selectedStation =
    filters.stationId === 'all'
      ? null
      : dataset.stations.find((station) => station.id === filters.stationId) ?? null
  const visibleStations = useMemo(
    () =>
      dataset.stations.filter((station) =>
        stationMatchesScope(station, filters.stationSourceScope),
      ),
    [dataset.stations, filters.stationSourceScope],
  )
  const selectedSnapshot = selectedStation
    ? snapshotByStationId.get(selectedStation.id) ?? null
    : null
  const boundaryRings = boundaryToLeafletRings(boundary)
  const selectionBand = pollutionBand(selectedSnapshot?.currentValue ?? 0)
  const elevationSurface = useMemo(
    () => buildElevationSurface(dataset.elevationGrid),
    [dataset.elevationGrid],
  )
  const pollutionPlumes = useMemo(
    () =>
      buildPollutionPlumes(
        visibleStations,
        snapshotByStationId,
        filters.pollutant,
        BURSA_FOCUS_BOUNDS,
      ),
    [filters.pollutant, snapshotByStationId, visibleStations],
  )
  const emphasizeTerrain = filters.activeLayers.elevation
  const terrainBaseUrl = emphasizeTerrain
    ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Terrain_Base/MapServer/tile/{z}/{y}/{x}'
    : 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}'
  const terrainAttribution = emphasizeTerrain
    ? 'Terrain &copy; Esri'
    : 'Basemap &copy; Esri'
  const referenceUrl = emphasizeTerrain
    ? 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Reference_Overlay/MapServer/tile/{z}/{y}/{x}'
    : 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}'
  const hillshadeOpacity = emphasizeTerrain ? 0.5 : 0.24
  const referenceOpacity = emphasizeTerrain ? 0.86 : 0.84

  useEffect(() => {
    const controller = new AbortController()

    async function loadBoundary() {
      try {
        const response = await fetch('/data/bursa-boundary.json', {
          signal: controller.signal,
        })

        if (!response.ok) {
          throw new Error('Boundary request failed')
        }

        const data = (await response.json()) as BoundaryGeoJson
        setBoundary(data)
      } catch {
        if (!controller.signal.aborted) {
          setBoundary(null)
        }
      }
    }

    void loadBoundary()

    return () => controller.abort()
  }, [])

  return (
    <section className="map-panel card">
      <div className="section-heading map-heading">
        <div>
          <span className="eyebrow">Harita Laboratuvarı</span>
          <h3>Bursa mekânsal bağlamı</h3>
        </div>

        <div className="map-heading-strip">
          <div className="map-heading-metric">
            <span>Kirletici</span>
            <strong>{filters.pollutant}</strong>
          </div>
          <div className="map-heading-metric">
            <span>Sinyal</span>
            <strong>
              {selectedSnapshot
                ? selectionBand.label
                : `${analysis.selectedStations.length} istasyon`}
            </strong>
          </div>
          <div className="map-heading-metric">
            <span>Son değer</span>
            <strong>
              {selectedSnapshot
                ? `${formatNumber(selectedSnapshot.currentValue)} µg/m3`
                : 'Çoklu özet'}
            </strong>
          </div>
          <div className="map-heading-metric">
            <span>Buffer</span>
            <strong>{filters.bufferRadius} m</strong>
          </div>
        </div>
      </div>

      <div
        className={`map-shell scientific-map-shell${emphasizeTerrain ? ' elevation-focus' : ''}`}
      >
        <MapContainer
          bounds={BURSA_FOCUS_BOUNDS}
          boundsOptions={{ padding: [48, 48] }}
          center={BURSA_CENTER}
          zoom={10}
          className="leaflet-map"
          maxBounds={BURSA_FOCUS_BOUNDS}
          maxBoundsViscosity={0.9}
          preferCanvas
          scrollWheelZoom
        >
          <TileLayer
            attribution={terrainAttribution}
            crossOrigin="anonymous"
            url={terrainBaseUrl}
          />
          <TileLayer
            attribution="Hillshade &copy; Esri"
            crossOrigin="anonymous"
            opacity={hillshadeOpacity}
            url="https://services.arcgisonline.com/ArcGIS/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}"
          />
          <TileLayer
            attribution="Reference &copy; Esri"
            crossOrigin="anonymous"
            opacity={referenceOpacity}
            url={referenceUrl}
          />

          {!!boundaryRings.length && (
            <Pane name="boundary-highlight" style={{ zIndex: 235 }}>
              {boundaryRings.map((ring, index) => (
                <Polygon
                  key={`boundary-highlight-${index}`}
                  positions={ring}
                  pathOptions={{
                    stroke: false,
                    fillColor: '#0f766e',
                    fillOpacity: 0.03,
                  }}
                />
              ))}
            </Pane>
          )}

          {!!boundaryRings.length && (
            <Pane name="boundary-line" style={{ zIndex: 640 }}>
              {boundaryRings.map((ring, index) => (
                <Polyline
                  key={`boundary-${index}`}
                  positions={ring}
                  pathOptions={{
                    color: '#0f766e',
                    opacity: 0.95,
                    weight: 3.4,
                  }}
                />
              ))}
            </Pane>
          )}

          {emphasizeTerrain && elevationSurface && (
            <>
              <Pane name="elevation-fill" style={{ zIndex: 250 }}>
                <GeoJSON
                  data={elevationSurface.fills}
                  style={(feature: Feature<Geometry, ElevationFeatureProperties> | undefined) => {
                    const properties = feature?.properties as
                      | ElevationFeatureProperties
                      | undefined

                    return {
                      color: properties?.color,
                      fillColor: properties?.fillColor,
                      fillOpacity: properties?.fillOpacity ?? 0,
                      opacity: properties?.opacity ?? 0,
                      weight: properties?.weight ?? 0,
                    }
                  }}
                />
              </Pane>

              <Pane name="elevation-contours" style={{ zIndex: 355 }}>
                <GeoJSON
                  data={elevationSurface.contours}
                  style={(feature: Feature<Geometry, ElevationFeatureProperties> | undefined) => {
                    const properties = feature?.properties as
                      | ElevationFeatureProperties
                      | undefined

                    return {
                      color: properties?.color,
                      opacity: properties?.opacity ?? 0,
                      weight: properties?.weight ?? 0,
                      dashArray: properties?.dashArray,
                    }
                  }}
                />
              </Pane>
            </>
          )}

          {filters.activeLayers.greenAreas && (
            <Pane name="greens" style={{ zIndex: 320 }}>
              {dataset.greenAreas.map((polygon) => (
                <Polygon
                  key={polygon.id}
                  positions={polygon.coordinates.map(([lat, lng]) => [lat, lng])}
                  pathOptions={{
                    color: '#4d7f5e',
                    fillColor: '#88b78f',
                    fillOpacity: emphasizeTerrain ? 0.16 : 0.22,
                    dashArray: '4 6',
                    opacity: emphasizeTerrain ? 0.72 : 0.82,
                    weight: emphasizeTerrain ? 0.9 : 1.1,
                  }}
                >
                  <Tooltip sticky className="map-tooltip">
                    {polygon.name}
                  </Tooltip>
                </Polygon>
              ))}
            </Pane>
          )}

          {filters.activeLayers.pollutionSurface && !!pollutionPlumes.length && (
            <Pane name="pollution-plumes" style={{ zIndex: 362, pointerEvents: 'none' }}>
              <SVGOverlay
                bounds={BURSA_FOCUS_BOUNDS}
                attributes={{
                  className: 'pollution-svg-overlay',
                  preserveAspectRatio: 'none',
                  viewBox: POLLUTION_OVERLAY_VIEWBOX,
                }}
              >
                <defs>
                  <filter
                    id="pollution-cloud-filter"
                    x="-28%"
                    y="-28%"
                    width="156%"
                    height="156%"
                    colorInterpolationFilters="sRGB"
                  >
                    <feGaussianBlur in="SourceGraphic" stdDeviation="10" result="blurred" />
                    <feTurbulence
                      type="fractalNoise"
                      baseFrequency="0.012 0.018"
                      numOctaves="2"
                      seed="17"
                      result="noise"
                    >
                      <animate
                        attributeName="baseFrequency"
                        dur="20s"
                        values="0.012 0.018;0.016 0.025;0.012 0.018"
                        repeatCount="indefinite"
                      />
                    </feTurbulence>
                    <feDisplacementMap
                      in="blurred"
                      in2="noise"
                      scale="17"
                      xChannelSelector="R"
                      yChannelSelector="G"
                      result="displaced"
                    />
                    <feGaussianBlur in="displaced" stdDeviation="7" result="softened" />
                    <feMerge>
                      <feMergeNode in="softened" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>

                <g className="pollution-overlay-group">
                  {pollutionPlumes.map((plume) => (
                    <g key={plume.id} className="pollution-plume-group">
                      {plume.layers.map((layer) => {
                        const layerStyle: PlumeLayerStyle = {
                          '--plume-duration': `${layer.duration}s`,
                          '--plume-delay': `${layer.delay}s`,
                          '--plume-drift-x': `${layer.driftX}px`,
                          '--plume-drift-y': `${layer.driftY}px`,
                          '--plume-scale': String(layer.scale),
                          '--plume-rotation': `${layer.rotation}deg`,
                          transformOrigin: `${plume.center.x}px ${plume.center.y}px`,
                        }

                        return (
                          <path
                            key={layer.id}
                            className={`pollution-plume-path ${layer.variant}`}
                            d={layer.path}
                            fill={layer.color}
                            fillOpacity={layer.opacity}
                            filter="url(#pollution-cloud-filter)"
                            style={layerStyle}
                          />
                        )
                      })}
                    </g>
                  ))}
                </g>
              </SVGOverlay>
            </Pane>
          )}

          {filters.activeLayers.roads && (
            <Pane name="roads" style={{ zIndex: 380 }}>
              {dataset.roads.map((line) => {
                const style = roadStyle(line.category, emphasizeTerrain)

                return (
                  <Polyline
                    key={line.id}
                    positions={line.coordinates.map(([lat, lng]) => [lat, lng])}
                    pathOptions={{
                      color: style.color,
                      opacity: style.opacity,
                      weight: style.weight,
                      lineCap: 'round',
                      lineJoin: 'round',
                    }}
                  >
                    <Tooltip sticky className="map-tooltip">
                      {line.name}
                    </Tooltip>
                  </Polyline>
                )
              })}
            </Pane>
          )}

          {filters.activeLayers.industries && (
            <Pane name="industries" style={{ zIndex: 520 }}>
              {dataset.industries.map((industry) => (
                <Marker
                  key={industry.id}
                  position={[industry.lat, industry.lng]}
                  icon={industryIcon(industry.category)}
                >
                  <Tooltip sticky className="map-tooltip">
                    <strong>{industry.name}</strong>
                    <br />
                    Sınıf: {industry.category}
                  </Tooltip>
                </Marker>
              ))}
            </Pane>
          )}

          {filters.activeLayers.stations && (
            <Pane name="stations" style={{ zIndex: 680 }}>
              {visibleStations.map((station) => {
                const snapshot = snapshotByStationId.get(station.id)
                const selected = station.id === filters.stationId
                const markerColor = pollutionBand(snapshot?.currentValue ?? 10).color

                return (
                  <Marker
                    key={station.id}
                    position={[station.lat, station.lng]}
                    icon={stationIcon(markerColor, selected)}
                    eventHandlers={{
                      click: () => onSelectStation(station.id),
                    }}
                  >
                    <Tooltip sticky className="map-tooltip">
                      <strong>{station.name}</strong>
                      <br />
                      Son ortalama: {formatNumber(snapshot?.currentValue ?? null)} µg/m3
                      <br />
                      Anomali z: {formatNumber(snapshot?.anomalyZScore ?? null, 2)}
                    </Tooltip>
                  </Marker>
                )
              })}
            </Pane>
          )}

          {selectedStation && (
            <Pane name="buffer" style={{ zIndex: 620 }}>
              <Circle
                center={[selectedStation.lat, selectedStation.lng]}
                radius={filters.bufferRadius}
                pathOptions={{
                  color: '#0f766e',
                  fillColor: '#2dd4bf',
                  fillOpacity: 0.05,
                  dashArray: '7 7',
                  weight: 2,
                }}
              >
                <Tooltip sticky className="map-tooltip">
                  {selectedStation.name}
                  <br />
                  Buffer: {filters.bufferRadius} m
                </Tooltip>
              </Circle>
            </Pane>
          )}
        </MapContainer>

        <div className="map-legend scientific-map-legend">
  

          <div className="legend-block">
            <strong>Kirletici yoğunluğu</strong>
            <div className="legend-row">
              <span className="legend-dot" style={{ background: '#1f7a5b' }} />
              <span>0-34 µg/m3</span>
            </div>
            <div className="legend-row">
              <span className="legend-dot" style={{ background: '#ca8a04' }} />
              <span>35-59 µg/m3</span>
            </div>
            <div className="legend-row">
              <span className="legend-dot" style={{ background: '#d97706' }} />
              <span>60-89 µg/m3</span>
            </div>
            <div className="legend-row">
              <span className="legend-dot" style={{ background: '#b42318' }} />
              <span>90+ µg/m3</span>
            </div>
          </div>

          {emphasizeTerrain && (
            <div className="legend-block">
              <strong>Yükselti yüzeyi</strong>
              <div className="elevation-legend-scale" aria-hidden="true" />
              <div className="legend-row">
                <span className="legend-line contour contour-minor" />
                <span>150 m izohips</span>
              </div>
              <div className="legend-row">
                <span className="legend-line contour contour-major" />
                <span>300 m ana izohips</span>
              </div>
     
            </div>
          )}

          <div className="legend-block">
            <strong>Katman sembolleri</strong>
            <div className="legend-row">
              <span className="legend-marker station" />
              <span>İstasyon</span>
            </div>
            <div className="legend-row">
              {legendIndustryIcon()}
              <span>Sanayi / fabrika</span>
            </div>
            <div className="legend-row">
              <span className="legend-line road" />
              <span>Ana yol ağı</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
