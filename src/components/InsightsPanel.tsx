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

import type { AnalysisResult, EventImpactStation, FilterState } from '../types'
import {
  formatDateLabel,
  formatNumber,
  formatPercent,
  formatSigned,
} from '../utils/format'
import { InfoHint } from './InfoHint'

const RESOLUTION_LABELS: Record<FilterState['resolution'], string> = {
  day: 'Günlük',
  month: 'Aylık',
  season: 'Mevsimlik',
  year: 'Yıllık',
}

const TREND_LABELS: Record<AnalysisResult['trendSummary']['direction'], string> = {
  increasing: 'artıyor',
  decreasing: 'azalıyor',
  stable: 'yatay',
}

const STATUS_LABELS: Record<EventImpactStation['status'], string> = {
  exposed: 'Maruz',
  control: 'Kontrol',
}

const UI_TEXT_REPLACEMENTS: Array<[RegExp, string]> = [
  [/Ã‚Âµg\/m3/g, 'µg/m3'],
  [/Âµg\/m3/g, 'µg/m3'],
  [/\bday\b/gi, 'günlük'],
  [/\bmonth\b/gi, 'aylık'],
  [/\bseason\b/gi, 'mevsimlik'],
  [/\byear\b/gi, 'yıllık'],
  [/\bJanuary\b/g, 'Ocak'],
  [/\bFebruary\b/g, 'Şubat'],
  [/\bMarch\b/g, 'Mart'],
  [/\bApril\b/g, 'Nisan'],
  [/\bMay\b/g, 'Mayıs'],
  [/\bJune\b/g, 'Haziran'],
  [/\bJuly\b/g, 'Temmuz'],
  [/\bAugust\b/g, 'Ağustos'],
  [/\bSeptember\b/g, 'Eylül'],
  [/\bOctober\b/g, 'Ekim'],
  [/\bNovember\b/g, 'Kasım'],
  [/\bDecember\b/g, 'Aralık'],
  [/\bWinter\b/g, 'Kış'],
  [/\bSpring\b/g, 'İlkbahar'],
  [/\bSummer\b/g, 'Yaz'],
  [/\bAutumn\b/g, 'Sonbahar'],
]

function localizeUiText(value: string) {
  return UI_TEXT_REPLACEMENTS.reduce(
    (result, [pattern, replacement]) => result.replace(pattern, replacement),
    value,
  )
}

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
  return [`${formatNumber(toNumeric(value))} µg/m3`, label]
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
  const resolutionLabel = RESOLUTION_LABELS[filters.resolution]
  const localizedAggregateSeries = analysis.aggregateSeries.map((point) => ({
    ...point,
    label: localizeUiText(point.label),
  }))
  const analysisWindowStart = filters.startDate
    ? formatDateLabel(`${filters.startDate}T00:00:00Z`)
    : 'Veri yok'
  const analysisWindowEnd = filters.endDate
    ? formatDateLabel(`${filters.endDate}T00:00:00Z`)
    : 'Veri yok'

  return (
    <div className="insights-grid">
      <section className="card cards-card">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Özet Metrikler</span>
            <h3>Anlık analitik görünüm</h3>
          </div>
          <p>{filters.pollutant} için seçili filtre kombinasyonunun temel istatistikleri.</p>
        </div>

        <div className="metric-grid">
          {analysis.overviewCards.map((card) => (
            <article key={card.label} className="metric-card">
              <span>{localizeUiText(card.label)}</span>
              <strong>{localizeUiText(card.value)}</strong>
              <small>{localizeUiText(card.detail)}</small>
            </article>
          ))}
        </div>

        <div className={`trend-callout ${trendTone(analysis.trendSummary.direction)}`}>
          <span className="eyebrow">Mann-Kendall + Theil-Sen</span>
          <p>
            Eğilim şu anda <strong>{TREND_LABELS[analysis.trendSummary.direction]}</strong>{' '}
            olarak sınıflanıyor. Aylık seride medyan eğim{' '}
            <strong>{formatSigned(analysis.trendSummary.slope, 2)}</strong>.
          </p>
        </div>
      </section>

      <section className="card diagnostics-card">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Bilimsel Tanı</span>
            <h3>Değişim ve bozulma taraması</h3>
          </div>
          <p>
            Mevsimsellikten arındırılmış eğilim, yapısal kırılma, eşik epizotları ve
            arka plan ayrıştırması birlikte okunur.
          </p>
        </div>

        <div className="diagnostic-grid">
          {analysis.scientificDiagnostics.map((card) => (
            <article
              key={card.id}
              className={`diagnostic-card diagnostic-card-${card.tone}`}
            >
              <div className="diagnostic-card-head">
                <h4>{card.title}</h4>
                <InfoHint
                  label={`${card.title} hakkında bilgi`}
                  hint={card.helper}
                />
              </div>
              <strong>{localizeUiText(card.value)}</strong>
              <p>{localizeUiText(card.detail)}</p>
              <div className="diagnostic-stats">
                {card.stats.map((stat) => (
                  <span key={stat} className="diagnostic-stat">
                    {localizeUiText(stat)}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="card chart-card">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Zaman Serisi</span>
            <h3>{resolutionLabel} konsantrasyon eğrisi</h3>
          </div>
          <p>Seçili istasyon ve kirletici için toplulaştırılmış seri.</p>
        </div>

        <div className="chart-wrap">
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={localizedAggregateSeries}>
              <CartesianGrid strokeDasharray="2 4" stroke="#d7d0c4" />
              <XAxis
                dataKey="label"
                minTickGap={24}
                stroke="#5d5c57"
                tickFormatter={(value) => localizeUiText(String(value))}
              />
              <YAxis stroke="#5d5c57" />
              <Tooltip
                formatter={(value) => simpleTooltip(value, 'Ortalama')}
                labelFormatter={(label) => `Dilim: ${localizeUiText(String(label))}`}
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
            <span className="eyebrow">Rüzgâr ve Kirlilik</span>
            <h3>Rüzgâr gülü / kirlilik gülü</h3>
          </div>
          <p>Yön bazında ortalama rüzgâr şiddeti ve kirletici yoğunluğu.</p>
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
                    ? `${formatNumber(toNumeric(value))} µg/m3`
                    : `${formatNumber(toNumeric(value))} m/s`,
                  name === 'pollutionMean' ? 'Kirlilik' : 'Rüzgâr',
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
            <h3>Buffer metriği korelasyonları</h3>
          </div>
          <p>
            {filters.bufferRadius} m bağlam metriği ile istasyon ortalamaları arasındaki
            ilişki.
          </p>
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
            <span className="eyebrow">Bağlamsal Tablo</span>
            <h3>İstasyon çevresi özetleri</h3>
          </div>
          <p>Önceden hesaplanan buffer metrikleri; ham bina katmanı yerine özet gösterilir.</p>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>İstasyon</th>
                <th>Bina yoğunluğu</th>
                <th>Yol yoğunluğu</th>
                <th>Yeşil oranı</th>
                <th>Geçirimsiz</th>
                <th>Sanayi</th>
                <th>Yükseklik</th>
                <th>Eğim</th>
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
            <h3>{analysis.event?.name ?? 'Seçili tarih aralığında olay yok'}</h3>
          </div>
          <p>
            Olay filtresi seçildiğinde tarih aralığı otomatik uygulanır ve ilgili dönem
            analizleri gösterilir.
          </p>
        </div>

        {analysis.event ? (
          <>
            <div className="event-summary">
              <div>
                <span>Tarih</span>
                <strong>
                  {formatDateLabel(analysis.event.startDate)}
                  {' - '}
                  {formatDateLabel(analysis.event.endDate)}
                </strong>
              </div>
              <div>
                <span>Analiz penceresi</span>
                <strong>
                  {analysisWindowStart}
                  {' - '}
                  {analysisWindowEnd}
                </strong>
              </div>
              <div>
                <span>Kaynak</span>
                <strong>{analysis.event.source}</strong>
              </div>
              <div>
                <span>Güven</span>
                <strong>{formatPercent(analysis.event.confidence, 0)}</strong>
              </div>
              <div>
                <span>Hotspot</span>
                <strong>{analysis.event.hotspotCount}</strong>
              </div>
            </div>

            {analysis.eventImpactRows.length > 0 ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>İstasyon</th>
                      <th>Rol</th>
                      <th>Mesafe</th>
                      <th>Yön uyumu</th>
                      <th>Önce</th>
                      <th>Sıra</th>
                      <th>Sonra</th>
                      <th>Baseline farkı</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.eventImpactRows.map((row) => (
                      <tr key={row.stationId}>
                        <td>{row.stationName}</td>
                        <td>
                          <span className={`status-tag ${row.status}`}>
                            {STATUS_LABELS[row.status]}
                          </span>
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
            ) : (
              <p className="empty-state">
                Bu olay için tarih filtresi uygulandı. Mekânsal etki tablosu yalnız yangın
                ve tesis yangını tiplerinde hesaplanır.
              </p>
            )}
          </>
        ) : (
          <p className="empty-state">Bu tarih aralığında eşleşen bir olay bulunmadı.</p>
        )}
      </section>
    </div>
  )
}
