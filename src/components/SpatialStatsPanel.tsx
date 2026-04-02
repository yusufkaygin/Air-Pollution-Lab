import type {
  RiskOverlayAggregation,
  SourceSummaryAggregation,
  SpatialStatsAggregation,
} from '../utils/spatialAnalysis'
import { formatNumber, formatPercent, formatSigned } from '../utils/format'

interface SpatialStatsPanelProps {
  loading: boolean
  error: string | null
  unsupportedReason: string | null
  stats: SpatialStatsAggregation | null
  risk: RiskOverlayAggregation | null
  sourceSummary: SourceSummaryAggregation | null
}

function hotspotClassLabel(classification: string) {
  switch (classification) {
    case 'hotspot-99':
      return 'Hotspot %99'
    case 'hotspot-95':
      return 'Hotspot %95'
    case 'hotspot-90':
      return 'Hotspot %90'
    case 'coldspot-99':
      return 'Coldspot %99'
    case 'coldspot-95':
      return 'Coldspot %95'
    case 'coldspot-90':
      return 'Coldspot %90'
    default:
      return 'Anlamsiz'
  }
}

function dominantDriverLabel(sourceSummary: SourceSummaryAggregation | null) {
  if (!sourceSummary?.dominantDriver) {
    return 'Yok'
  }

  return sourceSummary.dominantDriver.label
}

export function SpatialStatsPanel({
  loading,
  error,
  unsupportedReason,
  stats,
  risk,
  sourceSummary,
}: SpatialStatsPanelProps) {
  if (loading) {
    return (
      <section className="card spatial-placeholder-card">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Mekansal Istatistik</span>
            <h3>Istatistik paketi yukleniyor</h3>
          </div>
          <p>Moran&apos;s I, Gi* hotspot, kaynak proxy ve cevresel risk katmanlari getiriliyor.</p>
        </div>
      </section>
    )
  }

  if (error) {
    return (
      <section className="card spatial-placeholder-card">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Mekansal Istatistik</span>
            <h3>Paket acilamadi</h3>
          </div>
          <p>{error}</p>
        </div>
      </section>
    )
  }

  if (unsupportedReason) {
    return (
      <section className="card spatial-placeholder-card">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Mekansal Istatistik</span>
            <h3>Bu kombinasyon desteklenmiyor</h3>
          </div>
          <p>{unsupportedReason}</p>
        </div>
      </section>
    )
  }

  const visibleSections = [
    !stats?.unsupportedReason && stats,
    !sourceSummary?.unsupportedReason && sourceSummary,
    !risk?.unsupportedReason && risk,
  ].filter(Boolean)

  if (!visibleSections.length) {
    return (
      <section className="card spatial-placeholder-card">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Mekansal Istatistik</span>
            <h3>Bu kombinasyon desteklenmiyor</h3>
          </div>
          <p>
            {stats?.unsupportedReason ??
              sourceSummary?.unsupportedReason ??
              risk?.unsupportedReason ??
              'Kullanilabilir mekansal istatistik dilimi yok.'}
          </p>
        </div>
      </section>
    )
  }

  const topRiskCell = risk?.topRiskCells[0] ?? null
  const dominantDriver = sourceSummary?.dominantDriver ?? null

  return (
    <div className="insights-grid spatial-insights-grid">
      <section className="card cards-card">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Mekansal Istatistik</span>
            <h3>Kume, neden ve risk ozeti</h3>
          </div>
          <p>
            Moran&apos;s I gozetilen ortalamalardan, kaynak ozet modeli grid proxylerinden,
            risk yuzeyi ise cevresel bilesim skorundan uretilir.
          </p>
        </div>

        <div className="metric-grid">
          <article className="metric-card">
            <span>Global Moran&apos;s I</span>
            <strong>{formatNumber(stats?.globalMoranI ?? null, 3)}</strong>
            <small>Uzaysal otokorelasyon seviyesi</small>
          </article>
          <article className="metric-card">
            <span>Anlamli hotspot</span>
            <strong>{stats?.topHotspots.length ?? 0}</strong>
            <small>Gi* pozitif z-skoru olan istasyonlar</small>
          </article>
          <article className="metric-card">
            <span>Proxy model skoru</span>
            <strong>{formatNumber(sourceSummary?.modelScore ?? null, 3)}</strong>
            <small>Standartlastirilmis regresyon R²</small>
          </article>
          <article className="metric-card">
            <span>Baskin surucu</span>
            <strong>{dominantDriverLabel(sourceSummary)}</strong>
            <small>
              {dominantDriver ? formatSigned(dominantDriver.coefficient, 2) : 'Hesaplanamadi'}
            </small>
          </article>
          <article className="metric-card">
            <span>En yuksek risk hucre</span>
            <strong>{topRiskCell ? `Hucre ${topRiskCell.row + 1}-${topRiskCell.col + 1}` : 'Yok'}</strong>
            <small>{topRiskCell ? `${formatPercent(topRiskCell.score, 0)} risk` : 'Hesaplanamadi'}</small>
          </article>
        </div>
      </section>

      {!stats?.unsupportedReason && stats && (
        <section className="card table-card spatial-table-card">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Gi*</span>
              <h3>Hotspot ve coldspot istasyonlari</h3>
            </div>
            <p>Mutlak z-skoruna gore siralanmis istasyonlar.</p>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Istasyon</th>
                  <th>Sinif</th>
                  <th>Deger</th>
                  <th>Z</th>
                  <th>P</th>
                </tr>
              </thead>
              <tbody>
                {stats.hotspots.slice(0, 12).map((hotspot) => (
                  <tr key={hotspot.stationId}>
                    <td>{hotspot.stationName}</td>
                    <td>{hotspotClassLabel(hotspot.classification)}</td>
                    <td>{formatNumber(hotspot.value)}</td>
                    <td>{formatNumber(hotspot.zScore, 2)}</td>
                    <td>{formatNumber(hotspot.pValue, 3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {!sourceSummary?.unsupportedReason && sourceSummary && (
        <section className="card table-card spatial-table-card">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Kaynak Proxy</span>
              <h3>Standartlastirilmis surucu katsayilari</h3>
            </div>
            <p>
              Pozitif katsayi daha yuksek kirlilikle, negatif katsayi koruyucu etkiyle
              iliskilidir.
            </p>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Surucu</th>
                  <th>Katsayi</th>
                  <th>Yon</th>
                </tr>
              </thead>
              <tbody>
                {sourceSummary.coefficients.map((coefficient) => (
                  <tr key={coefficient.key}>
                    <td>{coefficient.label}</td>
                    <td>{formatSigned(coefficient.coefficient, 3)}</td>
                    <td>{coefficient.coefficient >= 0 ? 'Artirici' : 'Bastirici'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {!risk?.unsupportedReason && risk && (
        <section className="card table-card spatial-table-card">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Cevresel Risk</span>
              <h3>En riskli huceler</h3>
            </div>
            <p>Pollution load, hotspot sinyali, yakinlik, yesil eksigi ve topo-sikisima bilesimi.</p>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Hucre</th>
                  <th>Risk</th>
                  <th>Etiket</th>
                  <th>Hotspot</th>
                  <th>Yakinlik</th>
                  <th>Yesil eksigi</th>
                </tr>
              </thead>
              <tbody>
                {risk.topRiskCells.map((cell) => (
                  <tr key={cell.id}>
                    <td>{`Hucre ${cell.row + 1}-${cell.col + 1}`}</td>
                    <td>{formatPercent(cell.score, 0)}</td>
                    <td>{cell.label}</td>
                    <td>{formatPercent(cell.hotspotComponent, 0)}</td>
                    <td>{formatPercent(cell.proximityComponent, 0)}</td>
                    <td>{formatPercent(cell.greenDeficit, 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
