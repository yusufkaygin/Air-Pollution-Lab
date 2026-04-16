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
    return 'Yüksek'
  }

  if (value >= 0.45) {
    return 'Orta'
  }

  return 'Düşük'
}

function surfaceMethodLabel(value: FilterState['surfaceMethod']) {
  return value === 'idw' ? 'IDW' : 'Kriging'
}

function trainingScopeLabel(value: FilterState['spatialTrainingScope']) {
  return value === 'measured'
    ? 'Ölçülen istasyonlar'
    : 'Ölçülen + belediye sensörü'
}

function cellName(cell: SpatialCellView) {
  return `Hücre ${cell.row + 1}-${cell.col + 1}`
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
          <span className="eyebrow">Mekânsal Özet</span>
          <h3>{title}</h3>
        </div>
        <p>{description}</p>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Hücre</th>
              <th>Değer</th>
              <th>Aşım oranı</th>
              <th>Yola mesafe</th>
              <th>Sanayi mesafe</th>
              <th>Yakınlık</th>
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
            <span className="eyebrow">Mekânsal Analiz</span>
            <h3>Paket yükleniyor</h3>
          </div>
          <p>Aktif kirletici için aylık yüzeyler ve hücre özellikleri getiriliyor.</p>
        </div>
      </section>
    )
  }

  if (error) {
    return (
      <section className="card spatial-placeholder-card">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Mekânsal Analiz</span>
            <h3>Paket açılamadı</h3>
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
            <span className="eyebrow">Mekânsal Analiz</span>
            <h3>Bu kombinasyon desteklenmiyor</h3>
          </div>
          <p>{unsupportedReason ?? surface?.unsupportedReason ?? 'Kullanılabilir mekânsal dilim yok.'}</p>
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
            <span className="eyebrow">Mekânsal Özet</span>
            <h3>Bilimsel yüzey okumaları</h3>
          </div>
          <p>
            {surface.label} dilimi, {surfaceMethodLabel(surface.effectiveMethod)} ve{' '}
            {trainingScopeLabel(surface.trainingScope)} ile birleştirildi.
          </p>
        </div>

        <div className="metric-grid">
          <article className="metric-card">
            <span>En kirli hücre</span>
            <strong>{topCell ? cellName(topCell) : 'Yok'}</strong>
            <small>{topCell ? `${formatNumber(topCell.value)} µg/m3` : 'Hesaplanamadı'}</small>
          </article>
          <article className="metric-card">
            <span>En temiz hücre</span>
            <strong>{cleanCell ? cellName(cleanCell) : 'Yok'}</strong>
            <small>{cleanCell ? `${formatNumber(cleanCell.value)} µg/m3` : 'Hesaplanamadı'}</small>
          </article>
          <article className="metric-card">
            <span>En yoğun aşım</span>
            <strong>{exceedanceCell ? cellName(exceedanceCell) : 'Yok'}</strong>
            <small>
              {exceedanceCell
                ? `%${Math.round((exceedanceCell.exceedanceRatio ?? 0) * 100)} gün`
                : 'Hesaplanamadı'}
            </small>
          </article>
          <article className="metric-card">
            <span>Yakınlık baskısı</span>
            <strong>{proximityCell ? cellName(proximityCell) : 'Yok'}</strong>
            <small>
              {proximityCell
                ? proximityLabel(proximityCell.proximityIndex)
                : 'Hesaplanamadı'}
            </small>
          </article>
        </div>

        <div className="spatial-method-notes">
          <div className="diagnostic-card diagnostic-card-neutral">
            <div className="diagnostic-card-head">
              <h4>Yöntem</h4>
              <InfoHint
                label="Yüzey yöntemi"
                hint="Kriging yalnızca 10+ istasyon ve LOOCV RMSE avantajı varsa açılır. Uygun değilse uygulama IDW'ye geri döner."
              />
            </div>
            <strong>{surfaceMethodLabel(filters.surfaceMethod)}</strong>
            <p>
              Etkin hesap: <strong>{surfaceMethodLabel(surface.effectiveMethod)}</strong>
            </p>
          </div>
          <div className="diagnostic-card diagnostic-card-cool">
            <div className="diagnostic-card-head">
              <h4>Eğitim kümesi</h4>
              <InfoHint
                label="Eğitim kümesi"
                hint="Varsayılan kapsam ölçülmüş istasyonlardır. Model tabanlı seri hiçbir zaman yüzey eğitimine dahil edilmez."
              />
            </div>
            <strong>{trainingScopeLabel(surface.trainingScope)}</strong>
            <p>{surface.days} günlük gözlem penceresi birleştirildi.</p>
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
        title="Kirli hücreler"
        description="Yüzey ortalamasına göre en yüksek hücreler."
        cells={surface.topPollutedCells}
      />

      <CellMetricTable
        title="Aşım yoğunluğu"
        description="Eşik üstü gün oranı en yüksek hücreler."
        cells={surface.highestExceedanceCells}
      />

      <CellMetricTable
        title="Yakınlık baskısı"
        description="Yol ve sanayi etkisine en açık hücreler."
        cells={surface.highestProximityCells}
      />
    </div>
  )
}
