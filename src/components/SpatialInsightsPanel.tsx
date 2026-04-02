import type { FilterState } from '../types'
import type { SpatialCellView, SpatialSurfaceAggregation } from '../utils/spatialAnalysis'
import { formatNumber, formatPercent } from '../utils/format'
import { InfoHint } from './InfoHint'

interface SpatialInsightsPanelProps {
  loading: boolean
  error: string | null
  notices: string[]
  unsupportedReason: string | null
  filters: FilterState
  surface: SpatialSurfaceAggregation | null
}

function proximityLabel(value: number) {
  if (value >= 0.7) {
    return 'Yuksek'
  }

  if (value >= 0.45) {
    return 'Orta'
  }

  return 'Dusuk'
}

function surfaceMethodLabel(value: FilterState['surfaceMethod']) {
  return value === 'idw' ? 'IDW' : 'Kriging'
}

function trainingScopeLabel(value: FilterState['spatialTrainingScope']) {
  return value === 'measured'
    ? 'Olculen istasyonlar'
    : 'Olculen + belediye sensoru'
}

function cellName(cell: SpatialCellView) {
  return `Hucre ${cell.row + 1}-${cell.col + 1}`
}

function CellMetricTable({
  title,
  description,
  cells,
}: {
  title: string
  description: string
  cells: SpatialCellView[]
}) {
  return (
    <section className="card table-card spatial-table-card">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Mekansal Ozet</span>
          <h3>{title}</h3>
        </div>
        <p>{description}</p>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Hucre</th>
              <th>Deger</th>
              <th>Asim orani</th>
              <th>Yola mesafe</th>
              <th>Sanayi mesafe</th>
              <th>Yakinlik</th>
            </tr>
          </thead>
          <tbody>
            {cells.map((cell) => (
              <tr key={cell.id}>
                <td>{cellName(cell)}</td>
                <td>{formatNumber(cell.value)}</td>
                <td>{formatPercent(cell.exceedanceRatio ?? 0, 1)}</td>
                <td>{formatNumber(cell.nearestPrimaryRoadM, 0)} m</td>
                <td>{formatNumber(cell.nearestIndustryM, 0)} m</td>
                <td>{proximityLabel(cell.proximityIndex)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export function SpatialInsightsPanel({
  loading,
  error,
  notices,
  unsupportedReason,
  filters,
  surface,
}: SpatialInsightsPanelProps) {
  if (loading) {
    return (
      <section className="card spatial-placeholder-card">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Mekansal Analiz</span>
            <h3>Paket yukleniyor</h3>
          </div>
          <p>Aktif kirletici icin aylik yuzeyler ve hucre ozellikleri getiriliyor.</p>
        </div>
      </section>
    )
  }

  if (error) {
    return (
      <section className="card spatial-placeholder-card">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Mekansal Analiz</span>
            <h3>Paket acilamadi</h3>
          </div>
          <p>{error}</p>
        </div>
      </section>
    )
  }

  if (unsupportedReason || !surface || surface.unsupportedReason) {
    return (
      <section className="card spatial-placeholder-card">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Mekansal Analiz</span>
            <h3>Bu kombinasyon desteklenmiyor</h3>
          </div>
          <p>{unsupportedReason ?? surface?.unsupportedReason ?? 'Kullanilabilir mekansal dilim yok.'}</p>
        </div>
      </section>
    )
  }

  const topCell = surface.topPollutedCells[0] ?? null
  const cleanCell = surface.cleanestCells[0] ?? null
  const exceedanceCell = surface.highestExceedanceCells[0] ?? null
  const proximityCell = surface.highestProximityCells[0] ?? null

  return (
    <div className="insights-grid spatial-insights-grid">
      <section className="card cards-card">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Mekansal Ozet</span>
            <h3>Bilimsel yuzey okumalari</h3>
          </div>
          <p>
            {surface.label} dilimi, {surfaceMethodLabel(surface.effectiveMethod)} ve{' '}
            {trainingScopeLabel(surface.trainingScope)} ile birlestirildi.
          </p>
        </div>

        <div className="metric-grid">
          <article className="metric-card">
            <span>En kirli hucre</span>
            <strong>{topCell ? cellName(topCell) : 'Yok'}</strong>
            <small>{topCell ? `${formatNumber(topCell.value)} ug/m3` : 'Hesaplanamadi'}</small>
          </article>
          <article className="metric-card">
            <span>En temiz hucre</span>
            <strong>{cleanCell ? cellName(cleanCell) : 'Yok'}</strong>
            <small>{cleanCell ? `${formatNumber(cleanCell.value)} ug/m3` : 'Hesaplanamadi'}</small>
          </article>
          <article className="metric-card">
            <span>En yogun asim</span>
            <strong>{exceedanceCell ? cellName(exceedanceCell) : 'Yok'}</strong>
            <small>
              {exceedanceCell
                ? `%${Math.round((exceedanceCell.exceedanceRatio ?? 0) * 100)} gun`
                : 'Hesaplanamadi'}
            </small>
          </article>
          <article className="metric-card">
            <span>Yakinlik baskisi</span>
            <strong>{proximityCell ? cellName(proximityCell) : 'Yok'}</strong>
            <small>
              {proximityCell
                ? proximityLabel(proximityCell.proximityIndex)
                : 'Hesaplanamadi'}
            </small>
          </article>
        </div>

        <div className="spatial-method-notes">
          <div className="diagnostic-card diagnostic-card-neutral">
            <div className="diagnostic-card-head">
              <h4>Yontem</h4>
              <InfoHint
                label="Yuzey yontemi"
                hint="Kriging yalnizca 10+ istasyon ve LOOCV RMSE avantaji varsa acilir. Uygun degilse uygulama IDW'ye geri doner."
              />
            </div>
            <strong>{surfaceMethodLabel(filters.surfaceMethod)}</strong>
            <p>
              Etkin hesap: <strong>{surfaceMethodLabel(surface.effectiveMethod)}</strong>
            </p>
          </div>
          <div className="diagnostic-card diagnostic-card-cool">
            <div className="diagnostic-card-head">
              <h4>Egitim kumesi</h4>
              <InfoHint
                label="Egitim kumesi"
                hint="Varsayilan kapsam olculmus istasyonlardir. Model tabanli seri hicbir zaman yuzey egitimine dahil edilmez."
              />
            </div>
            <strong>{trainingScopeLabel(surface.trainingScope)}</strong>
            <p>{surface.days} gunluk gozlem penceresi birlestirildi.</p>
          </div>
        </div>

        {!!notices.length && (
          <ul className="spatial-notice-list">
            {notices.map((notice) => (
              <li key={notice}>{notice}</li>
            ))}
          </ul>
        )}
      </section>

      <CellMetricTable
        title="Kirli huceler"
        description="Yuzey ortalamasina gore en yuksek hucreler."
        cells={surface.topPollutedCells}
      />

      <CellMetricTable
        title="Asim yogunlugu"
        description="Esik ustu gun orani en yuksek hucreler."
        cells={surface.highestExceedanceCells}
      />

      <CellMetricTable
        title="Yakinlik baskisi"
        description="Yol ve sanayi etkisine en acik hucreler."
        cells={surface.highestProximityCells}
      />
    </div>
  )
}
