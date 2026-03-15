import clsx from 'clsx'

import {
  BUFFER_OPTIONS,
  LAYER_LABELS,
  POLLUTANTS,
  RESOLUTIONS,
} from '../constants'
import type { FilterState, LayerKey, Station } from '../types'

interface ControlPanelProps {
  filters: FilterState
  stations: Station[]
  coverageStart: string
  coverageEnd: string
  onChange: <Key extends keyof FilterState>(key: Key, value: FilterState[Key]) => void
  onLayerToggle: (layer: LayerKey) => void
  onReset: () => void
}

export function ControlPanel({
  filters,
  stations,
  coverageStart,
  coverageEnd,
  onChange,
  onLayerToggle,
  onReset,
}: ControlPanelProps) {
  return (
    <aside className="control-panel">
      <div className="panel-heading">
        <h2>Filtre seti</h2>
      </div>

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
        <span>Istasyon</span>
        <select
          value={filters.stationId}
          onChange={(event) => onChange('stationId', event.target.value)}
        >
          <option value="all">Tum istasyonlar</option>
          {stations.map((station) => (
            <option key={station.id} value={station.id}>
              {station.name}
            </option>
          ))}
        </select>
      </label>

      <div className="field">
        <span>Tarih araligi</span>
        <div className="date-grid">
          <label className="date-field">
            <small>Baslangic</small>
            <input
              type="date"
              min={coverageStart}
              max={filters.endDate || coverageEnd}
              value={filters.startDate}
              onChange={(event) => onChange('startDate', event.target.value)}
            />
          </label>
          <label className="date-field">
            <small>Bitis</small>
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
        <span>Zaman cozunurlugu</span>
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
        <span>Buffer yaricapi</span>
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

      <button type="button" className="reset-button" onClick={onReset}>
        Filtreleri sifirla
      </button>
    </aside>
  )
}
