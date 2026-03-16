import clsx from 'clsx'

import {
  BUFFER_OPTIONS,
  LAYER_LABELS,
  POLLUTANTS,
  RESOLUTIONS,
  STATION_SOURCE_SCOPES,
} from '../constants'
import type { EventCatalogItem, FilterState, LayerKey, Station } from '../types'

interface ControlPanelProps {
  filters: FilterState
  stations: Station[]
  events: EventCatalogItem[]
  coverageStart: string
  coverageEnd: string
  onChange: <Key extends keyof FilterState>(key: Key, value: FilterState[Key]) => void
  onLayerToggle: (layer: LayerKey) => void
  onEventSelect: (eventId: string) => void
}

function formatEventRange(event: EventCatalogItem) {
  const formatter = new Intl.DateTimeFormat('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
  const start = formatter.format(new Date(event.startDate))
  const end = formatter.format(new Date(event.endDate))
  return start === end ? start : `${start} - ${end}`
}

export function ControlPanel({
  filters,
  stations,
  events,
  coverageStart,
  coverageEnd,
  onChange,
  onLayerToggle,
  onEventSelect,
}: ControlPanelProps) {
  const sortedEvents = [...events].sort((left, right) =>
    right.startDate.localeCompare(left.startDate),
  )

  return (
    <aside className="control-panel">
      <label className="field">
        <span>Kirletici</span>
        <select
          value={filters.pollutant}
          onChange={(event) =>
            onChange('pollutant', event.target.value as FilterState['pollutant'])
          }
        >
          {POLLUTANTS.map((pollutant) => (
            <option key={pollutant} value={pollutant}>
              {pollutant}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Veri kaynağı</span>
        <select
          value={filters.stationSourceScope}
          onChange={(event) =>
            onChange(
              'stationSourceScope',
              event.target.value as FilterState['stationSourceScope'],
            )
          }
        >
          {STATION_SOURCE_SCOPES.map((scope) => (
            <option key={scope.value} value={scope.value}>
              {scope.label}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>İstasyon</span>
        <select
          value={filters.stationId}
          onChange={(event) => onChange('stationId', event.target.value)}
        >
          <option value="all">Tüm istasyonlar</option>
          {stations.map((station) => (
            <option key={station.id} value={station.id}>
              {station.name}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Olaylar</span>
        <select value={filters.eventId} onChange={(event) => onEventSelect(event.target.value)}>
          <option value="">Özel tarih aralığı</option>
          {sortedEvents.map((item) => (
            <option key={item.eventId} value={item.eventId}>
              {`${item.name} | ${formatEventRange(item)}`}
            </option>
          ))}
        </select>
      </label>

      <div className="field">
        <span>Tarih aralığı</span>
        <div className="date-grid">
          <label className="date-field">
            <small>Başlangıç</small>
            <input
              type="date"
              min={coverageStart}
              max={filters.endDate || coverageEnd}
              value={filters.startDate}
              onChange={(event) => onChange('startDate', event.target.value)}
            />
          </label>
          <label className="date-field">
            <small>Bitiş</small>
            <input
              type="date"
              min={filters.startDate || coverageStart}
              max={coverageEnd}
              value={filters.endDate}
              onChange={(event) => onChange('endDate', event.target.value)}
            />
          </label>
        </div>
      </div>

      <label className="field">
        <span>Zaman çözünürlüğü</span>
        <select
          value={filters.resolution}
          onChange={(event) =>
            onChange('resolution', event.target.value as FilterState['resolution'])
          }
        >
          {RESOLUTIONS.map((resolution) => (
            <option key={resolution.value} value={resolution.value}>
              {resolution.label}
            </option>
          ))}
        </select>
      </label>

      <div className="field">
        <div className="field-label-row">
          <span>Buffer yarıçapı</span>
          <div className="field-help">
            <button
              type="button"
              className="info-button"
              aria-label="Buffer yarıçapı hakkında bilgi"
              aria-describedby="buffer-radius-hint"
            >
              i
            </button>
            <div id="buffer-radius-hint" className="field-hint" role="tooltip">
              İstasyon çevresindeki yol, yeşil alan, sanayi, yükseklik ve benzeri
              bağlamsal metriklerin hangi mesafede değerlendirileceğini belirler.
            </div>
          </div>
        </div>
        <div className="pill-row">
          {BUFFER_OPTIONS.map((bufferRadius) => (
            <button
              key={bufferRadius}
              type="button"
              className={clsx('pill-button', {
                active: filters.bufferRadius === bufferRadius,
              })}
              onClick={() => onChange('bufferRadius', bufferRadius)}
            >
              {bufferRadius} m
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <span>Katmanlar</span>
        <div className="layer-grid">
          {(Object.keys(filters.activeLayers) as LayerKey[]).map((layer) => (
            <button
              key={layer}
              type="button"
              className={clsx('layer-chip', {
                active: filters.activeLayers[layer],
              })}
              onClick={() => onLayerToggle(layer)}
            >
              {LAYER_LABELS[layer]}
            </button>
          ))}
        </div>
      </div>
    </aside>
  )
}
