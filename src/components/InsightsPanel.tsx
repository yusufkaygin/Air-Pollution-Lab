import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import type { AnalysisResult, FilterState } from '../types'
import { formatNumber, formatPercent, formatSigned } from '../utils/format'

function toNumeric(
  value: number | string | ReadonlyArray<number | string> | undefined,
) {
  if (Array.isArray(value)) {
    return Number(value[0] ?? 0)
  }

  return Number(value ?? 0)
}

function simpleTooltip(
  value: number | string | ReadonlyArray<number | string> | undefined,
  label: string,
) {
  return [`${formatNumber(toNumeric(value))} ug/m3`, label]
}

interface InsightsPanelProps {
  analysis: AnalysisResult
  filters: FilterState
}

function trendTone(direction: AnalysisResult['trendSummary']['direction']) {
  if (direction === 'increasing') return 'warming'
  if (direction === 'decreasing') return 'cooling'
  return 'steady'
}

export function InsightsPanel({ analysis, filters }: InsightsPanelProps) {
  const stationNameById = new Map(
    analysis.selectedStations.map((station) => [station.id, station.name]),
  )

  return (
    <div className="insights-grid">
      <section className="card cards-card">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Ozet Metrikler</span>
            <h3>Anlik analitik gorunum</h3>
          </div>
          <p>{filters.pollutant} icin secili filtre kombinasyonunun temel istatistikleri.</p>
        </div>

        <div className="metric-grid">
          {analysis.overviewCards.map((card) => (
            <article key={card.label} className="metric-card">
              <span>{card.label}</span>
              <strong>{card.value}</strong>
              <small>{card.detail}</small>
            </article>
          ))}
        </div>

        <div className={`trend-callout ${trendTone(analysis.trendSummary.direction)}`}>
          <span className="eyebrow">Mann-Kendall + Theil-Sen</span>
          <p>
            Eglim su anda <strong>{analysis.trendSummary.direction}</strong> olarak
            siniflaniyor. Aylik seride medyan egim{' '}
            <strong>{formatSigned(analysis.trendSummary.slope, 2)}</strong>.
          </p>
        </div>
      </section>

      <section className="card chart-card">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Zaman Serisi</span>
            <h3>{filters.resolution} konsantrasyon egrisi</h3>
          </div>
          <p>Secili istasyon ve kirletici icin toplulastirilmis seri.</p>
        </div>

        <div className="chart-wrap">
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={analysis.aggregateSeries}>
              <CartesianGrid strokeDasharray="2 4" stroke="#d7d0c4" />
              <XAxis dataKey="label" minTickGap={24} stroke="#5d5c57" />
              <YAxis stroke="#5d5c57" />
              <Tooltip
                formatter={(value) => simpleTooltip(value, 'Ortalama')}
                labelFormatter={(label) => `Dilim: ${label}`}
              />
              <Bar dataKey="value" barSize={18} fill="#d9a441" fillOpacity={0.35} />
              <Line
                dataKey="value"
                type="monotone"
                stroke="#0f766e"
                strokeWidth={3}
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="card chart-card">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Ruzgar ve Kirlilik</span>
            <h3>Wind rose / pollution rose</h3>
          </div>
          <p>Yon bazinda ortalama ruzgar siddeti ve kirletici yogunlugu.</p>
        </div>

        <div className="chart-wrap">
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={analysis.roseData}>
              <CartesianGrid strokeDasharray="2 4" stroke="#d7d0c4" />
              <XAxis dataKey="direction" stroke="#5d5c57" />
              <YAxis yAxisId="left" stroke="#5d5c57" />
              <YAxis yAxisId="right" orientation="right" stroke="#5d5c57" />
              <Tooltip
                formatter={(value, name) => [
                  name === 'pollutionMean'
                    ? `${formatNumber(toNumeric(value))} ug/m3`
                    : `${formatNumber(toNumeric(value))} m/s`,
                  name === 'pollutionMean' ? 'Kirlilik' : 'Ruzgar',
                ]}
              />
              <Bar
                yAxisId="left"
                dataKey="pollutionMean"
                fill="#d97706"
                radius={[6, 6, 0, 0]}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="windMean"
                stroke="#1d4ed8"
                strokeWidth={3}
                dot={{ r: 3 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="card chart-card">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Etken Analizi</span>
            <h3>Buffer metrigi korelasyonlari</h3>
          </div>
          <p>{filters.bufferRadius} m baglam metrigi ile istasyon ortalamalari arasindaki iliski.</p>
        </div>

        <div className="chart-wrap">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={analysis.correlations} layout="vertical" margin={{ left: 12 }}>
              <CartesianGrid strokeDasharray="2 4" stroke="#d7d0c4" />
              <XAxis type="number" domain={[-1, 1]} stroke="#5d5c57" />
              <YAxis type="category" dataKey="metric" width={120} stroke="#5d5c57" />
              <Tooltip formatter={(value) => [formatNumber(toNumeric(value), 2), 'r']} />
              <Bar dataKey="correlation" radius={[0, 6, 6, 0]}>
                {analysis.correlations.map((row) => (
                  <Cell
                    key={row.metric}
                    fill={row.correlation >= 0 ? '#d94841' : '#1f7a5b'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="card table-card context-card">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Baglamsal Tablo</span>
            <h3>Istasyon cevresi ozetleri</h3>
          </div>
          <p>Onceden hesaplanan buffer metrikleri; ham bina katmani yerine ozet gosterilir.</p>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Istasyon</th>
                <th>Bina yogunlugu</th>
                <th>Yol yogunlugu</th>
                <th>Yesil orani</th>
                <th>Gecirimsiz</th>
                <th>Sanayi</th>
                <th>Yukseklik</th>
                <th>Egim</th>
              </tr>
            </thead>
            <tbody>
              {analysis.selectedContextMetrics.map((metric) => (
                <tr key={`${metric.stationId}-${metric.radiusM}`}>
                  <td>{stationNameById.get(metric.stationId) ?? metric.stationId}</td>
                  <td>{formatNumber(metric.buildingDensity, 2)}</td>
                  <td>{formatNumber(metric.roadDensity, 2)}</td>
                  <td>{formatPercent(metric.greenRatio, 1)}</td>
                  <td>{formatPercent(metric.imperviousRatio, 1)}</td>
                  <td>{metric.industryCount}</td>
                  <td>{formatNumber(metric.meanElevation, 0)} m</td>
                  <td>{formatNumber(metric.slopeMean, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card table-card event-card">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Olay Etkisi</span>
            <h3>{analysis.event?.name ?? 'Secili tarih araliginda olay yok'}</h3>
          </div>
          <p>
            Olay karti, secili tarih araligiyla kesisen yangin olaylari varsa otomatik
            olarak doldurulur.
          </p>
        </div>

        {analysis.event ? (
          <>
            <div className="event-summary">
              <div>
                <span>Kaynak</span>
                <strong>{analysis.event.source}</strong>
              </div>
              <div>
                <span>Guven</span>
                <strong>{formatPercent(analysis.event.confidence, 0)}</strong>
              </div>
              <div>
                <span>Hotspot</span>
                <strong>{analysis.event.hotspotCount}</strong>
              </div>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Istasyon</th>
                    <th>Rol</th>
                    <th>Mesafe</th>
                    <th>Yon uyumu</th>
                    <th>Once</th>
                    <th>Sira</th>
                    <th>Sonra</th>
                    <th>Baseline farki</th>
                  </tr>
                </thead>
                <tbody>
                  {analysis.eventImpactRows.map((row) => (
                    <tr key={row.stationId}>
                      <td>{row.stationName}</td>
                      <td>
                        <span className={`status-tag ${row.status}`}>{row.status}</span>
                      </td>
                      <td>{formatNumber(row.distanceKm, 1)} km</td>
                      <td>{formatNumber(row.alignmentScore, 2)}</td>
                      <td>{formatNumber(row.beforeMean)}</td>
                      <td>{formatNumber(row.duringMean)}</td>
                      <td>{formatNumber(row.afterMean)}</td>
                      <td>{formatSigned(row.deltaVsBaseline)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="empty-state">Bu tarih araliginda eslesen bir olay bulunmadi.</p>
        )}
      </section>
    </div>
  )
}
