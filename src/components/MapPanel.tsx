import { useEffect, useState } from 'react'
import {
  Circle,
  CircleMarker,
  MapContainer,
  Pane,
  Polygon,
  Polyline,
  TileLayer,
  Tooltip,
} from 'react-leaflet'

import { BURSA_CENTER, BURSA_FOCUS_BOUNDS } from '../constants'
import type { AnalysisResult, BursaDataset, FilterState } from '../types'
import { formatNumber } from '../utils/format'

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

function isEventVisible(
  startDate: string,
  endDate: string,
  eventStart: string,
  eventEnd: string,
) {
  if (!startDate && !endDate) {
    return true
  }

  const eventStartDate = eventStart.slice(0, 10)
  const eventEndDate = eventEnd.slice(0, 10)

  if (startDate && eventEndDate < startDate) {
    return false
  }

  if (endDate && eventStartDate > endDate) {
    return false
  }

  return true
}

function pollutionColor(value: number) {
  if (value >= 90) return '#b42318'
  if (value >= 60) return '#d97706'
  if (value >= 35) return '#ca8a04'
  return '#1f7a5b'
}

function elevationColor(value: number | undefined) {
  if (value === undefined) return '#c8d6cf'
  if (value >= 700) return '#304655'
  if (value >= 400) return '#56715d'
  if (value >= 200) return '#7f9a72'
  return '#aec28e'
}

function roadWeight(category: string) {
  if (category === 'motorway' || category === 'trunk') return 5
  if (category === 'primary') return 4
  if (category === 'secondary') return 3.5
  return 2.5
}

function boundaryToLeafletRings(boundary: BoundaryGeoJson | null) {
  if (!boundary) {
    return []
  }

  return boundary.coordinates.map((polygon) =>
    polygon[0].map(([lng, lat]) => [lat, lng] as [number, number]),
  )
}

export function MapPanel({
  dataset,
  filters,
  analysis,
  onSelectStation,
}: MapPanelProps) {
  const [boundary, setBoundary] = useState<BoundaryGeoJson | null>(null)
  const snapshotByStationId = new Map(
    analysis.stationSnapshots.map((snapshot) => [snapshot.stationId, snapshot]),
  )
  const selectedStation =
    filters.stationId === 'all'
      ? null
      : dataset.stations.find((station) => station.id === filters.stationId) ?? null
  const visibleEvents = dataset.events.filter((event) =>
    isEventVisible(filters.startDate, filters.endDate, event.startDate, event.endDate),
  )
  const boundaryRings = boundaryToLeafletRings(boundary)

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
        if (controller.signal.aborted) {
          return
        }

        setBoundary(null)
      }
    }

    void loadBoundary()

    return () => controller.abort()
  }, [])

  return (
    <section className="map-panel card">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Harita Laboratuvari</span>
          <h3>Bursa mekansal baglami</h3>
        </div>
      </div>

      <div className="map-shell realistic-map-shell">
        <MapContainer
          bounds={BURSA_FOCUS_BOUNDS}
          center={BURSA_CENTER}
          zoom={10}
          className="leaflet-map"
          maxBounds={BURSA_FOCUS_BOUNDS}
          maxBoundsViscosity={0.9}
          scrollWheelZoom
        >
          <TileLayer
            attribution='Tiles &copy; Esri'
            crossOrigin="anonymous"
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          />
          <TileLayer
            attribution='Transportation &copy; Esri'
            crossOrigin="anonymous"
            opacity={0.42}
            url="https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}"
          />
          <TileLayer
            attribution='Labels &copy; Esri'
            crossOrigin="anonymous"
            opacity={0.78}
            url="https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
          />

          {!!boundaryRings.length && (
            <Pane name="boundary-highlight" style={{ zIndex: 235 }}>
              {boundaryRings.map((ring, index) => (
                <Polygon
                  key={`boundary-highlight-${index}`}
                  positions={ring}
                  pathOptions={{
                    stroke: false,
                    fillColor: '#f4d47b',
                    fillOpacity: 0.05,
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
                    color: '#f4d47b',
                    opacity: 1,
                    weight: 3,
                  }}
                />
              ))}
            </Pane>
          )}

          {filters.activeLayers.elevation && (
            <Pane name="elevation" style={{ zIndex: 250 }}>
              {dataset.elevationGrid.map((polygon) => (
                <Polygon
                  key={polygon.id}
                  positions={polygon.coordinates.map(([lat, lng]) => [lat, lng])}
                  pathOptions={{
                    color: elevationColor(polygon.value),
                    fillColor: elevationColor(polygon.value),
                    fillOpacity: 0.14,
                    weight: 1,
                  }}
                >
                  <Tooltip sticky>
                    {polygon.name}
                    <br />
                    Ortalama yukseklik: {polygon.value ?? 'n/a'} m
                  </Tooltip>
                </Polygon>
              ))}
            </Pane>
          )}

          {filters.activeLayers.greenAreas && (
            <Pane name="greens" style={{ zIndex: 300 }}>
              {dataset.greenAreas.map((polygon) => (
                <Polygon
                  key={polygon.id}
                  positions={polygon.coordinates.map(([lat, lng]) => [lat, lng])}
                  pathOptions={{
                    color: '#2e7d32',
                    fillColor: '#57b35f',
                    fillOpacity: 0.22,
                    weight: 1,
                  }}
                >
                  <Tooltip sticky>{polygon.name}</Tooltip>
                </Polygon>
              ))}
            </Pane>
          )}

          {filters.activeLayers.roads && (
            <Pane name="roads" style={{ zIndex: 350 }}>
              {dataset.roads.map((line) => (
                <Polyline
                  key={line.id}
                  positions={line.coordinates.map(([lat, lng]) => [lat, lng])}
                  pathOptions={{
                    color: '#f8fafc',
                    opacity: 0.95,
                    weight: roadWeight(line.category),
                  }}
                >
                  <Tooltip sticky>{line.name}</Tooltip>
                </Polyline>
              ))}
            </Pane>
          )}

          {filters.activeLayers.industries && (
            <Pane name="industries" style={{ zIndex: 450 }}>
              {dataset.industries.map((industry) => (
                <CircleMarker
                  key={industry.id}
                  center={[industry.lat, industry.lng]}
                  radius={5.5}
                  pathOptions={{
                    color: '#2a0d0d',
                    fillColor: '#d56f4d',
                    fillOpacity: 0.92,
                    weight: 1,
                  }}
                >
                  <Tooltip sticky>
                    {industry.name}
                    <br />
                    {industry.category}
                  </Tooltip>
                </CircleMarker>
              ))}
            </Pane>
          )}

          {filters.activeLayers.fireHotspots && (
            <Pane name="fires" style={{ zIndex: 500 }}>
              {visibleEvents.map((event) => (
                <Circle
                  key={event.eventId}
                  center={[event.center.lat, event.center.lng]}
                  radius={event.radiusKm * 1000}
                  pathOptions={{
                    color: '#ff5c35',
                    fillColor: '#ff914d',
                    fillOpacity: 0.12,
                    weight: 2,
                  }}
                >
                  <Tooltip sticky>
                    {event.name}
                    <br />
                    Hotspot sayisi: {event.hotspotCount}
                  </Tooltip>
                </Circle>
              ))}
            </Pane>
          )}

          {filters.activeLayers.stations && (
            <Pane name="stations" style={{ zIndex: 650 }}>
              {dataset.stations.map((station) => {
                const snapshot = snapshotByStationId.get(station.id)
                const selected = station.id === filters.stationId

                return (
                  <CircleMarker
                    key={station.id}
                    center={[station.lat, station.lng]}
                    eventHandlers={{
                      click: () => onSelectStation(station.id),
                    }}
                    radius={selected ? 10 : 8}
                    pathOptions={{
                      color: selected ? '#111827' : '#f8fafc',
                      fillColor: pollutionColor(snapshot?.currentValue ?? 10),
                      fillOpacity: 0.96,
                      weight: selected ? 3 : 2,
                    }}
                  >
                    <Tooltip sticky>
                      <strong>{station.name}</strong>
                      <br />
                      Son ortalama: {formatNumber(snapshot?.currentValue ?? null)} ug/m3
                      <br />
                      Anomali z: {formatNumber(snapshot?.anomalyZScore ?? null, 2)}
                    </Tooltip>
                  </CircleMarker>
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
                  color: '#14b8a6',
                  fillColor: '#67e8f9',
                  fillOpacity: 0.06,
                  dashArray: '7 7',
                  weight: 2,
                }}
              >
                <Tooltip sticky>
                  {selectedStation.name}
                  <br />
                  Buffer: {filters.bufferRadius} m
                </Tooltip>
              </Circle>
            </Pane>
          )}
        </MapContainer>

        <div className="map-legend">
          <span className="legend-title">Kirletici yogunlugu</span>
          <div className="legend-scale">
            <span style={{ background: '#1f7a5b' }} />
            <span style={{ background: '#ca8a04' }} />
            <span style={{ background: '#d97706' }} />
            <span style={{ background: '#b42318' }} />
          </div>
          <small>Dusuk - yuksek</small>
        </div>
      </div>
    </section>
  )
}
