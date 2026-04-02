import { useState } from 'react'
import {
  Area,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import type { ForecastAggregation } from '../utils/spatialAnalysis'
import { formatDateLabel, formatNumber } from '../utils/format'
import { InfoHint } from './InfoHint'

interface ForecastPanelProps {
  loading: boolean
  error: string | null
  unsupportedReason: string | null
  forecast: ForecastAggregation | null
}

function trainingScopeLabel(value: ForecastAggregation['trainingScope']) {
  return value === 'measured'
    ? 'Olculen istasyonlar'
    : 'Olculen + belediye sensoru'
}

function forecastTooltipValue(value: number | string) {
  return `${formatNumber(Number(value), 1)} ug/m3`
}

export function ForecastPanel({
  loading,
  error,
  unsupportedReason,
  forecast,
}: ForecastPanelProps) {
  const supportedForecasts = forecast?.forecasts.filter((item) => item.supported) ?? []
  const [selectedHorizon, setSelectedHorizon] = useState<7 | 30>(7)

  if (loading) {
    return (
      <section className="card spatial-placeholder-card">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Tahmin</span>
            <h3>Forecast paketi yukleniyor</h3>
          </div>
          <p>Gunluk 7 ve 30 gunluk ensemble forecast dilimleri getiriliyor.</p>
        </div>
      </section>
    )
  }

  if (error) {
    return (
      <section className="card spatial-placeholder-card">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Tahmin</span>
            <h3>Paket acilamadi</h3>
          </div>
          <p>{error}</p>
        </div>
      </section>
    )
  }

  const reason = unsupportedReason ?? forecast?.unsupportedReason
  if (reason || !forecast || !supportedForecasts.length) {
    return (
      <section className="card spatial-placeholder-card">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Tahmin</span>
            <h3>Bu kombinasyon desteklenmiyor</h3>
          </div>
          <p>{reason ?? 'Kullanilabilir forecast paketi yok.'}</p>
        </div>
      </section>
    )
  }

  const activeForecast =
    supportedForecasts.find((item) => item.horizonDays === selectedHorizon) ??
    supportedForecasts[0]!
  const chartRows = activeForecast.points.map((point) => ({
    ...point,
    label: formatDateLabel(point.timestamp),
  }))
  const lastPoint = activeForecast.points[activeForecast.points.length - 1] ?? null

  return (
    <div className="insights-grid spatial-insights-grid">
      <section className="card cards-card">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Tahmin</span>
            <h3>Gunluk ensemble forecast</h3>
          </div>
          <p>
            Seasonal-naive + damped-trend ensemble, {trainingScopeLabel(forecast.trainingScope)}{' '}
            egitim kumesiyle uretilir.
          </p>
        </div>

        <div className="metric-grid">
          <article className="metric-card">
            <span>Ufuk</span>
            <strong>{activeForecast.horizonDays} gun</strong>
            <small>Secili tahmin penceresi</small>
          </article>
          <article className="metric-card">
            <span>Backtest MAE</span>
            <strong>{formatNumber(activeForecast.mae, 2)}</strong>
            <small>Mutlak hata ortalamasi</small>
          </article>
          <article className="metric-card">
            <span>Backtest RMSE</span>
            <strong>{formatNumber(activeForecast.rmse, 2)}</strong>
            <small>Kok ortalama kare hata</small>
          </article>
          <article className="metric-card">
            <span>Son tahmin</span>
            <strong>{lastPoint ? formatNumber(lastPoint.value, 1) : 'Veri yok'}</strong>
            <small>{lastPoint ? formatDateLabel(lastPoint.timestamp) : 'Hesaplanamadi'}</small>
          </article>
        </div>

        <div className="spatial-method-notes">
          <div className="diagnostic-card diagnostic-card-neutral">
            <div className="diagnostic-card-head">
              <h4>Horizon secimi</h4>
              <InfoHint
                label="Forecast ufku"
                hint="7 gunluk ufuk daha tepkisel, 30 gunluk ufuk daha yumusatilmistir. Iki seri de ayni ensemble model ailesinden gelir."
              />
            </div>
            <div className="forecast-horizon-row">
              {supportedForecasts.map((item) => (
                <button
                  key={item.horizonDays}
                  type="button"
                  className={`pill-button${activeForecast.horizonDays === item.horizonDays ? ' active' : ''}`}
                  onClick={() => setSelectedHorizon(item.horizonDays)}
                >
                  {item.horizonDays} gun
                </button>
              ))}
            </div>
          </div>
          <div className="diagnostic-card diagnostic-card-cool">
            <div className="diagnostic-card-head">
              <h4>Belirsizlik bandi</h4>
              <InfoHint
                label="Guven bandi"
                hint="Alt ve ust bantlar, holdout RMSE degerinden turetilen sabit aralikla gosterilir; saglik risk sinifi degildir."
              />
            </div>
            <strong>RMSE tabanli</strong>
            <p>Grafikte alan bandi, secili ufkun tahmini hata envelopesini gosterir.</p>
          </div>
        </div>
      </section>

      <section className="card table-card">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Trend</span>
            <h3>Forecast egirisi</h3>
          </div>
          <p>Gunluk tahmin degerleri ve belirsizlik bandi.</p>
        </div>

        <div className="chart-wrap">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartRows} margin={{ top: 12, right: 12, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(15, 23, 42, 0.08)" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} minTickGap={24} />
              <YAxis tick={{ fontSize: 12 }} width={52} />
              <Tooltip
                formatter={(value) => forecastTooltipValue(value as number | string)}
                labelFormatter={(label) => `Tarih: ${label}`}
              />
              <Area
                type="monotone"
                dataKey="upper"
                stroke="transparent"
                fill="rgba(37, 99, 235, 0.08)"
                activeDot={false}
              />
              <Area
                type="monotone"
                dataKey="lower"
                stroke="transparent"
                fill="#ffffff"
                activeDot={false}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke="#1d4ed8"
                strokeWidth={2.4}
                dot={false}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="card table-card spatial-table-card">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Tahmin Noktalari</span>
            <h3>Gunluk cikis tablosu</h3>
          </div>
          <p>Secili ufkun ilk 12 gunu gosterilir.</p>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Tarih</th>
                <th>Tahmin</th>
                <th>Alt</th>
                <th>Ust</th>
              </tr>
            </thead>
            <tbody>
              {activeForecast.points.slice(0, 12).map((point) => (
                <tr key={point.timestamp}>
                  <td>{formatDateLabel(point.timestamp)}</td>
                  <td>{formatNumber(point.value, 1)}</td>
                  <td>{formatNumber(point.lower, 1)}</td>
                  <td>{formatNumber(point.upper, 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
