import { startTransition, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'

import { ControlPanel } from './components/ControlPanel'
import { InsightsPanel } from './components/InsightsPanel'
import { MapPanel } from './components/MapPanel'
import { DEFAULT_FILTERS } from './constants'
import { useDataset } from './hooks/useDataset'
import type { FilterState, LayerKey } from './types'
import { analyzeDataset } from './utils/analytics'
import { exportElementAsPng, exportRowsAsCsv } from './utils/export'
import './App.css'

function App() {
  const { data, loading, error } = useDataset()
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS)
  const [exporting, setExporting] = useState<'png' | null>(null)
  const reportRef = useRef<HTMLDivElement>(null)
  const deferredFilters = useDeferredValue(filters)

  useEffect(() => {
    if (!data) {
      return
    }

    if (!filters.startDate || !filters.endDate) {
      startTransition(() => {
        setFilters((current) => ({
          ...current,
          startDate: current.startDate || data.metadata.coverageStart,
          endDate: current.endDate || data.metadata.coverageEnd,
        }))
      })
    }
  }, [data, filters.endDate, filters.startDate])

  const analysis = useMemo(() => {
    if (!data) {
      return null
    }

    return analyzeDataset(data, deferredFilters)
  }, [data, deferredFilters])

  function handleFilterChange<Key extends keyof FilterState>(
    key: Key,
    value: FilterState[Key],
  ) {
    startTransition(() => {
      setFilters((current) => {
        if (key === 'startDate') {
          const startDate = String(value)
          return {
            ...current,
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

  function handleReset() {
    startTransition(() =>
      setFilters({
        ...DEFAULT_FILTERS,
        startDate: data?.metadata.coverageStart ?? '',
        endDate: data?.metadata.coverageEnd ?? '',
      }),
    )
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
          <span className="eyebrow">Bursa Hava Kirliligi</span>
          <h1>Veri paketi yukleniyor</h1>
          <p>Statik veri demeti bellege aliniyor ve analiz motoru hazirlaniyor.</p>
        </div>
      </main>
    )
  }

  if (error || !data || !analysis) {
    return (
      <main className="app-shell loading-state">
        <div className="status-card error">
          <span className="eyebrow">Yukleme Hatasi</span>
          <h1>Veri paketi acilamadi</h1>
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
            <span className="eyebrow">Bursa Hava Kirliligi Bilimsel Analiz Platformu</span>
          </div>

          <div className="hero-title-row">
            <h1>Istasyon tabanli zaman-mekan hava kirliligi laboratuvari</h1>
            <div className="export-actions hero-export-actions">
              <button
                type="button"
                className="primary-button"
                onClick={() => exportRowsAsCsv(analysis.exportRows, 'bursa-hava-serisi.csv')}
              >
                CSV disa aktar
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={handlePngExport}
                disabled={exporting !== null}
              >
                {exporting === 'png' ? 'PNG hazirlaniyor' : 'PNG disa aktar'}
              </button>
            </div>
          </div>

          <p>
            Zaman serisi, meteoroloji baglami ve cevresel buffer metriklerini tek
            arayuzde okur.
          </p>
        </div>
      </header>

      <section className="workspace-grid">
        <ControlPanel
          filters={filters}
          stations={data.stations}
          coverageStart={data.metadata.coverageStart}
          coverageEnd={data.metadata.coverageEnd}
          onChange={handleFilterChange}
          onLayerToggle={handleLayerToggle}
          onReset={handleReset}
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
                <span className="eyebrow">Veri Notlari</span>
                <h3>Kaynaklar ve veri butunlugu</h3>
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
                <h4>Veri Butunlugu</h4>
                <div className="quality-strip footer-quality-strip">
                  {data.metadata.completenessOverview?.map((row) => (
                    <article key={row.pollutant} className="quality-pill">
                      <span>{row.pollutant}</span>
                      <strong>%{Math.round(row.completenessRatio * 100)}</strong>
                      <small>veri dolulugu</small>
                    </article>
                  ))}
                </div>
              </section>
            </div>

            {!!data.metadata.dataIssues?.length && (
              <section className="provenance-block provenance-issues">
                <h4>Eksik Veri ve Uyarilar</h4>
                <ul className="provenance-list">
                  {data.metadata.dataIssues.map((issue) => (
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
