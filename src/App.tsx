import { addWeeks, subWeeks } from 'date-fns'
import { useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { HiOutlineCog6Tooth } from 'react-icons/hi2'

import { ControlPanel } from './components/ControlPanel'
import { InsightsPanel } from './components/InsightsPanel'
import { MapPanel } from './components/MapPanel'
import { DEFAULT_FILTERS } from './constants'
import { useDataset } from './hooks/useDataset'
import type { FilterState, LayerKey, Station, StationSourceScope } from './types'
import { analyzeDataset } from './utils/analytics'
import { exportElementAsPng, exportRowsAsCsv } from './utils/export'
import './App.css'

function toInputDate(value: Date) {
  return value.toISOString().slice(0, 10)
}

function buildEventAnalysisWindow(startDate: string, endDate: string) {
  const eventStart = new Date(`${startDate.slice(0, 10)}T00:00:00Z`)
  const eventEnd = new Date(`${endDate.slice(0, 10)}T00:00:00Z`)

  return {
    startDate: toInputDate(subWeeks(eventStart, 1)),
    endDate: toInputDate(addWeeks(eventEnd, 2)),
  }
}

function stationMatchesScope(station: Station, scope: StationSourceScope) {
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

function App() {
  const { data, loading, error } = useDataset()
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS)
  const [exporting, setExporting] = useState<'png' | null>(null)
  const [showAnalysisOverlay, setShowAnalysisOverlay] = useState(false)
  const [analysisOverlayClosing, setAnalysisOverlayClosing] = useState(false)
  const reportRef = useRef<HTMLDivElement>(null)
  const overlayTimersRef = useRef<{
    fade: ReturnType<typeof setTimeout> | null
    hide: ReturnType<typeof setTimeout> | null
  }>({
    fade: null,
    hide: null,
  })
  const overlayFrameRef = useRef<number | null>(null)

  useEffect(() => {
    document.title = 'Hava Kirliliği Lab'
  }, [])

  useEffect(() => {
    if (!data) {
      return
    }

    if (!filters.startDate || !filters.endDate) {
      setFilters((current) => ({
        ...current,
        startDate: current.startDate || data.metadata.coverageStart,
        endDate: current.endDate || data.metadata.coverageEnd,
      }))
    }
  }, [data, filters.endDate, filters.startDate])

  function clearAnalysisOverlayTimers() {
    const timers = overlayTimersRef.current

    if (timers.fade) {
      clearTimeout(timers.fade)
      timers.fade = null
    }

    if (timers.hide) {
      clearTimeout(timers.hide)
      timers.hide = null
    }

    if (overlayFrameRef.current !== null) {
      cancelAnimationFrame(overlayFrameRef.current)
      overlayFrameRef.current = null
    }
  }

  useEffect(() => {
    return () => clearAnalysisOverlayTimers()
  }, [])

  const analysis = useMemo(() => {
    if (!data) {
      return null
    }

    return analyzeDataset(data, filters)
  }, [data, filters])
  const visibleStations = useMemo(
    () =>
      data?.stations.filter((station) =>
        stationMatchesScope(station, filters.stationSourceScope),
      ) ?? [],
    [data, filters.stationSourceScope],
  )

  const visibleDataIssues = useMemo(
    () =>
      (data?.metadata.dataIssues ?? []).filter(
        (issue) => !issue.id.startsWith('fires-fallback'),
      ),
    [data],
  )

  function showAnalysisOverlayNow() {
    const totalMs = 2000 + Math.floor(Math.random() * 1001)
    const fadeMs = 420

    clearAnalysisOverlayTimers()

    flushSync(() => {
      setShowAnalysisOverlay(true)
      setAnalysisOverlayClosing(false)
    })

    overlayTimersRef.current.fade = setTimeout(() => {
      setAnalysisOverlayClosing(true)
    }, Math.max(totalMs - fadeMs, 0))

    overlayTimersRef.current.hide = setTimeout(() => {
      setAnalysisOverlayClosing(false)
      setShowAnalysisOverlay(false)
    }, totalMs)
  }

  function runWithAnalysisOverlay(action: () => void) {
    showAnalysisOverlayNow()

    overlayFrameRef.current = requestAnimationFrame(() => {
      overlayFrameRef.current = null
      action()
    })
  }

  function handleFilterChange<Key extends keyof FilterState>(
    key: Key,
    value: FilterState[Key],
  ) {
    runWithAnalysisOverlay(() => {
      setFilters((current) => {
        if (key === 'stationSourceScope') {
          const stationSourceScope = value as FilterState['stationSourceScope']
          const selectedStation =
            current.stationId === 'all'
              ? null
              : data?.stations.find((station) => station.id === current.stationId) ?? null

          return {
            ...current,
            stationSourceScope,
            stationId:
              selectedStation && !stationMatchesScope(selectedStation, stationSourceScope)
                ? 'all'
                : current.stationId,
          }
        }

        if (key === 'startDate') {
          const startDate = String(value)
          return {
            ...current,
            eventId: '',
            resolution: current.eventId ? 'month' : current.resolution,
            startDate,
            endDate:
              current.endDate && current.endDate < startDate
                ? startDate
                : current.endDate,
          }
        }

        if (key === 'endDate') {
          const endDate = String(value)
          return {
            ...current,
            eventId: '',
            resolution: current.eventId ? 'month' : current.resolution,
            endDate,
            startDate:
              current.startDate && current.startDate > endDate
                ? endDate
                : current.startDate,
          }
        }

        return {
          ...current,
          [key]: value,
        }
      })
    })
  }

  function handleLayerToggle(layer: LayerKey) {
    runWithAnalysisOverlay(() => {
      setFilters((current) => ({
        ...current,
        activeLayers: {
          ...current.activeLayers,
          [layer]: !current.activeLayers[layer],
        },
      }))
    })
  }

  function handleEventSelect(eventId: string) {
    runWithAnalysisOverlay(() => {
      if (!data || !eventId) {
        setFilters((current) => ({
          ...current,
          eventId: '',
          resolution: 'month',
        }))
        return
      }

      const event = data.events.find((item) => item.eventId === eventId)

      if (!event) {
        setFilters((current) => ({
          ...current,
          eventId: '',
          resolution: 'month',
        }))
        return
      }

      const analysisWindow = buildEventAnalysisWindow(event.startDate, event.endDate)

      setFilters((current) => ({
        ...current,
        eventId,
        resolution: 'day',
        startDate: analysisWindow.startDate,
        endDate: analysisWindow.endDate,
      }))
    })
  }

  async function handlePngExport() {
    if (!reportRef.current) {
      return
    }

    try {
      setExporting('png')
      await exportElementAsPng(reportRef.current, 'bursa-hava-raporu.png')
    } finally {
      setExporting(null)
    }
  }

  if (loading) {
    return (
      <main className="app-shell loading-state">
        <div className="status-card">
          <span className="eyebrow">Hava Kirliliği Lab</span>
          <h1>Veri paketi yükleniyor</h1>
          <p>Statik veri demeti belleğe alınıyor ve analiz motoru hazırlanıyor.</p>
        </div>
      </main>
    )
  }

  if (error || !data || !analysis) {
    return (
      <main className="app-shell loading-state">
        <div className="status-card error">
          <span className="eyebrow">Yükleme Hatası</span>
          <h1>Veri paketi açılamadı</h1>
          <p>{error ?? 'Bilinmeyen hata'}</p>
        </div>
      </main>
    )
  }

  return (
    <>
      <div
        className={`analysis-overlay${showAnalysisOverlay ? ' visible' : ''}${
          analysisOverlayClosing ? ' closing' : ''
        }`}
        aria-hidden={!showAnalysisOverlay}
        aria-live={showAnalysisOverlay ? 'polite' : undefined}
        aria-busy={showAnalysisOverlay}
      >
        <div className="analysis-overlay-panel">
          <div className="analysis-visual" aria-hidden="true">
            <div className="analysis-orbit" />
            <div className="analysis-pulse">
              <HiOutlineCog6Tooth className="analysis-cog" aria-hidden="true" />
            </div>
          </div>

          <div className="analysis-copy">
            <h2>Analiz hazırlanıyor</h2>
            <p>Analiz motoru çalışıyor</p>
          </div>
        </div>
      </div>

      <main className="app-shell">
        <header className="hero-panel">
          <div className="hero-copy">
            <div className="hero-header-row">
              <span className="eyebrow">Hava Kirliliği Lab</span>
            </div>

            <div className="hero-title-row">
              <h1>Bursa Hava Kirliliği Laboratuvarı</h1>
              <div className="export-actions hero-export-actions">
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => exportRowsAsCsv(analysis.exportRows, 'bursa-hava-serisi.csv')}
                >
                  CSV dışa aktar
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={handlePngExport}
                  disabled={exporting !== null}
                >
                  {exporting === 'png' ? 'PNG hazırlanıyor' : 'PNG dışa aktar'}
                </button>
              </div>
            </div>

            <p>
              Zaman serisi, meteoroloji bağlamı ve çevresel buffer metriklerini tek
              arayüzde okur.
            </p>
          </div>
        </header>

        <section className="workspace-grid">
          <ControlPanel
            filters={filters}
            stations={visibleStations}
            events={data.events}
            coverageStart={data.metadata.coverageStart}
            coverageEnd={data.metadata.coverageEnd}
            onChange={handleFilterChange}
            onLayerToggle={handleLayerToggle}
            onEventSelect={handleEventSelect}
          />

          <div className="workspace-main">
            <MapPanel
              dataset={data}
              filters={filters}
              analysis={analysis}
              onSelectStation={(stationId) => handleFilterChange('stationId', stationId)}
            />

            <div ref={reportRef}>
              <InsightsPanel analysis={analysis} filters={filters} />
            </div>

            <section className="card provenance-panel">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">Veri Notları</span>
                  <h3>Kaynaklar ve veri bütünlüğü</h3>
                </div>
              </div>

              <div className="provenance-grid">
                <section className="provenance-block">
                  <h4>Kaynaklar</h4>
                  <ul className="provenance-list">
                    {data.metadata.sourceNotes.map((source) => (
                      <li key={source}>{source}</li>
                    ))}
                  </ul>
                </section>

                <section className="provenance-block">
                  <h4>Resmî ağ veri bütünlüğü</h4>
                  <div className="quality-strip footer-quality-strip">
                    {data.metadata.completenessOverview?.map((row) => (
                      <article key={row.pollutant} className="quality-pill">
                        <span>{row.pollutant}</span>
                        <strong>%{Math.round(row.completenessRatio * 100)}</strong>
                        <small>veri doluluğu</small>
                      </article>
                    ))}
                  </div>
                </section>
              </div>

              {!!(data.metadata.completenessOverview?.length || visibleDataIssues.length) && (
                <section className="provenance-block provenance-issues">
                  <h4>Eksik veri ve kaynak uyarıları</h4>
                  <ul className="provenance-list">
                    {data.metadata.completenessOverview?.map((row) => (
                      <li key={`missing-${row.pollutant}`}>
                        <strong>{row.pollutant}:</strong> eksik veri %
                        {Math.round((1 - row.completenessRatio) * 100)}
                      </li>
                    ))}
                    {visibleDataIssues.map((issue) => (
                      <li key={issue.id}>
                        <strong>{issue.source}:</strong> {issue.message}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </section>
          </div>
        </section>
      </main>
    </>
  )
}

export default App
