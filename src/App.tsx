import { addWeeks, subWeeks } from 'date-fns'
import { startTransition, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'

import { ControlPanel } from './components/ControlPanel'
import { DataExplorerPanel } from './components/DataExplorerPanel'
import { ForecastPanel } from './components/ForecastPanel'
import { InsightsPanel } from './components/InsightsPanel'
import { MapPanel } from './components/MapPanel'
import { SpatialInsightsPanel } from './components/SpatialInsightsPanel'
import { SpatialStatsPanel } from './components/SpatialStatsPanel'
import { ANALYSIS_TABS, DEFAULT_FILTERS } from './constants'
import { useDataset } from './hooks/useDataset'
import { useMapLayers } from './hooks/useMapLayers'
import { useSpatialAnalysis } from './hooks/useSpatialAnalysis'
import type { AnalysisTab, FilterState, LayerKey } from './types'
import { analyzeDataset, type AnalyticsFilters } from './utils/analytics'
import { exportElementAsPng, exportRowsAsCsv } from './utils/export'
import { matchesStationFilters } from './utils/stations'
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

function App() {
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS)
  const [analysisTab, setAnalysisTab] = useState<AnalysisTab>('general')
  const [exporting, setExporting] = useState<'png' | null>(null)
  const reportRef = useRef<HTMLDivElement>(null)
  const { data, loading, error } = useDataset(filters.pollutant)
  const requestedMapLayers = useMemo(
    () => ({
      ...filters.activeLayers,
      neighborhoods: filters.activeLayers.neighborhoods || analysisTab === 'data-explorer',
    }),
    [analysisTab, filters.activeLayers],
  )
  const mapLayers = useMapLayers(requestedMapLayers)
  const analyticsFilters = useMemo<AnalyticsFilters>(
    () => ({
      pollutant: filters.pollutant,
      stationId: filters.stationId,
      stationSourceScope: filters.stationSourceScope,
      eventId: filters.eventId,
      resolution: filters.resolution,
      compareMode: filters.compareMode,
      bufferRadius: filters.bufferRadius,
      startDate: filters.startDate,
      endDate: filters.endDate,
    }),
    [
      filters.bufferRadius,
      filters.compareMode,
      filters.endDate,
      filters.eventId,
      filters.pollutant,
      filters.resolution,
      filters.startDate,
      filters.stationId,
      filters.stationSourceScope,
    ],
  )
  const deferredFilters = useDeferredValue(filters)
  const deferredAnalyticsFilters = useDeferredValue(analyticsFilters)

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

  const analysis = useMemo(() => {
    if (!data) {
      return null
    }

    return analyzeDataset(data, deferredAnalyticsFilters)
  }, [data, deferredAnalyticsFilters])

  const visibleStations = useMemo(
    () =>
      data?.stations.filter((station) =>
        matchesStationFilters(station, filters.stationSourceScope, filters.pollutant),
      ) ?? [],
    [data, filters.pollutant, filters.stationSourceScope],
  )

  const visibleDataIssues = useMemo(
    () =>
      (data?.metadata.dataIssues ?? []).filter(
        (issue) => !issue.id.startsWith('fires-fallback'),
      ),
    [data],
  )

  const spatialAnalysisEnabled =
    analysisTab === 'spatial' ||
    analysisTab === 'spatial-stats' ||
    analysisTab === 'forecast' ||
    filters.activeLayers.interpolationSurface ||
    filters.activeLayers.proximity ||
    filters.activeLayers.hotspots ||
    filters.activeLayers.risk

  const spatialAnalysis = useSpatialAnalysis(data, deferredFilters, spatialAnalysisEnabled)
  const surfaceLayerReason =
    spatialAnalysis.unsupportedReason ?? spatialAnalysis.surface?.unsupportedReason
  const statsLayerReason =
    spatialAnalysis.unsupportedReason ?? spatialAnalysis.stats?.unsupportedReason
  const riskLayerReason =
    spatialAnalysis.unsupportedReason ?? spatialAnalysis.risk?.unsupportedReason

  const layerAvailability = useMemo(
    () => ({
      interpolationSurface: {
        enabled: !surfaceLayerReason,
        reason: surfaceLayerReason ?? undefined,
      },
      proximity: {
        enabled: !surfaceLayerReason,
        reason: surfaceLayerReason ?? undefined,
      },
      hotspots: {
        enabled: !statsLayerReason,
        reason: statsLayerReason ?? undefined,
      },
      risk: {
        enabled: !riskLayerReason,
        reason: riskLayerReason ?? undefined,
      },
    }),
    [riskLayerReason, statsLayerReason, surfaceLayerReason],
  )

  const availableSurfaceMethods = useMemo<FilterState['surfaceMethod'][]>(() => {
    if (!spatialAnalysis.packageData) {
      return ['idw']
    }

    const allSlices = [
      ...spatialAnalysis.packageData.monthlySlices,
      ...spatialAnalysis.packageData.eventSlices,
    ]
    const methods = spatialAnalysis.packageData.availableMethods.filter((method) =>
      allSlices.some((slice) => slice.surfaces[filters.spatialTrainingScope]?.[method]?.supported),
    )

    return methods.length ? methods : spatialAnalysis.packageData.availableMethods
  }, [filters.spatialTrainingScope, spatialAnalysis.packageData])

  const exportRows = useMemo(() => {
    if (!analysis) {
      return []
    }

    if (analysisTab === 'spatial' && spatialAnalysis.surface?.exportRows.length) {
      return spatialAnalysis.surface.exportRows
    }

    if (analysisTab === 'spatial-stats') {
      return [
        ...(spatialAnalysis.stats?.exportRows ?? []),
        ...(spatialAnalysis.sourceSummary?.exportRows ?? []),
        ...(spatialAnalysis.risk?.exportRows ?? []),
      ]
    }

    if (analysisTab === 'forecast' && spatialAnalysis.forecast?.exportRows.length) {
      return spatialAnalysis.forecast.exportRows
    }

    return analysis.exportRows
  }, [
    analysis,
    analysisTab,
    spatialAnalysis.forecast,
    spatialAnalysis.risk,
    spatialAnalysis.sourceSummary,
    spatialAnalysis.stats,
    spatialAnalysis.surface,
  ])

  const exportFilename =
    analysisTab === 'spatial'
      ? `bursa-mekansal-${filters.pollutant.toLowerCase()}.csv`
      : analysisTab === 'spatial-stats'
        ? `bursa-mekansal-istatistik-${filters.pollutant.toLowerCase()}.csv`
        : analysisTab === 'forecast'
          ? `bursa-tahmin-${filters.pollutant.toLowerCase()}.csv`
          : 'bursa-hava-serisi.csv'

  function handleFilterChange<Key extends keyof FilterState>(
    key: Key,
    value: FilterState[Key],
  ) {
    startTransition(() => {
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
              selectedStation &&
              !matchesStationFilters(selectedStation, stationSourceScope, current.pollutant)
                ? 'all'
                : current.stationId,
          }
        }

        if (key === 'pollutant') {
          const pollutant = value as FilterState['pollutant']
          const selectedStation =
            current.stationId === 'all'
              ? null
              : data?.stations.find((station) => station.id === current.stationId) ?? null

          return {
            ...current,
            pollutant,
            stationId:
              selectedStation &&
              !matchesStationFilters(
                selectedStation,
                current.stationSourceScope,
                pollutant,
              )
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
    startTransition(() => {
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
    startTransition(() => {
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
          <p>Parçalı veri dosyaları açılıyor; ekran hazır olur olmaz sonuçlar anında güncellenecek.</p>
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
                onClick={() => {
                  void exportRowsAsCsv(exportRows, exportFilename)
                }}
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

          <p>Zaman serisi, meteoroloji bağlamı ve çevresel tampon metriklerini tek arayüzde okur.</p>
        </div>
      </header>

      <section className="workspace-grid">
        <ControlPanel
          filters={filters}
          stations={visibleStations}
          events={data.events}
          coverageStart={data.metadata.coverageStart}
          coverageEnd={data.metadata.coverageEnd}
          showSpatialControls={analysisTab !== 'general'}
          availableSurfaceMethods={availableSurfaceMethods}
          layerAvailability={layerAvailability}
          onChange={handleFilterChange}
          onLayerToggle={handleLayerToggle}
          onEventSelect={handleEventSelect}
        />

        <div className="workspace-main">
          <MapPanel
            dataset={data}
            mapLayers={mapLayers}
            filters={filters}
            analysis={analysis}
            spatialSurface={spatialAnalysis.surface}
            spatialStats={spatialAnalysis.stats}
            riskOverlay={spatialAnalysis.risk}
            spatialLoading={spatialAnalysis.loading}
            spatialUnsupportedReason={spatialAnalysis.unsupportedReason}
            onSelectStation={(stationId) => handleFilterChange('stationId', stationId)}
          />

          <div ref={reportRef}>
            <div className="analysis-tab-strip" role="tablist" aria-label="Analiz sekmeleri">
              {ANALYSIS_TABS.map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  role="tab"
                  aria-selected={analysisTab === tab.value}
                  className={`analysis-tab${analysisTab === tab.value ? ' active' : ''}`}
                  onClick={() => setAnalysisTab(tab.value)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {analysisTab === 'general' && <InsightsPanel analysis={analysis} filters={filters} />}

            {analysisTab === 'spatial' && (
              <SpatialInsightsPanel
                loading={spatialAnalysis.loading}
                error={spatialAnalysis.error}
                notices={spatialAnalysis.notices}
                unsupportedReason={spatialAnalysis.unsupportedReason}
                filters={filters}
                surface={spatialAnalysis.surface}
              />
            )}

            {analysisTab === 'spatial-stats' && (
              <SpatialStatsPanel
                loading={spatialAnalysis.loading}
                error={spatialAnalysis.error}
                unsupportedReason={spatialAnalysis.unsupportedReason}
                stats={spatialAnalysis.stats}
                risk={spatialAnalysis.risk}
                sourceSummary={spatialAnalysis.sourceSummary}
              />
            )}

            {analysisTab === 'forecast' && (
              <ForecastPanel
                loading={spatialAnalysis.loading}
                error={spatialAnalysis.error}
                unsupportedReason={spatialAnalysis.unsupportedReason}
                forecast={spatialAnalysis.forecast}
              />
            )}

            {analysisTab === 'data-explorer' && (
              <DataExplorerPanel
                dataset={data}
                analysis={analysis}
                filters={filters}
                neighborhoods={mapLayers.neighborhoods ?? data.neighborhoods}
              />
            )}
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
  )
}

export default App
