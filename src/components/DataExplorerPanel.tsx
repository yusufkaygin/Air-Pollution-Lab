import { useMemo, useState } from 'react'

import type {
  AnalysisResult,
  BursaDataset,
  FilterState,
  NeighborhoodFeature,
  TimeSeriesPoint,
} from '../types'
import { formatNumber, formatPercent, formatSigned } from '../utils/format'

interface DataExplorerPanelProps {
  dataset: BursaDataset
  analysis: AnalysisResult
  filters: FilterState
  neighborhoods: NeighborhoodFeature[]
}

interface Column<Row> {
  key: string
  header: string
  render: (row: Row) => string | number
}

function isInsideRange(timestamp: string, startDate: string, endDate: string) {
  const day = timestamp.slice(0, 10)
  if (startDate && day < startDate) {
    return false
  }
  if (endDate && day > endDate) {
    return false
  }
  return true
}

function circularMean(values: number[]) {
  if (!values.length) {
    return null
  }

  const sinTotal = values.reduce((sum, value) => sum + Math.sin((value * Math.PI) / 180), 0)
  const cosTotal = values.reduce((sum, value) => sum + Math.cos((value * Math.PI) / 180), 0)
  return (((Math.atan2(sinTotal, cosTotal) * 180) / Math.PI) + 360) % 360
}

function PagedTable<Row>({
  title,
  description,
  columns,
  rows,
  pageSize = 10,
}: {
  title: string
  description: string
  columns: Column<Row>[]
  rows: Row[]
  pageSize?: number
}) {
  const [page, setPage] = useState(0)
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize))
  const safePage = Math.min(page, pageCount - 1)
  const visibleRows = rows.slice(safePage * pageSize, safePage * pageSize + pageSize)

  return (
    <section className="card table-card data-explorer-card">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Veri Gezgini</span>
          <h3>{title}</h3>
        </div>
        <p>{description}</p>
      </div>

      {rows.length === 0 ? (
        <div className="empty-state">Seçili filtrelerle gösterilecek satır yok.</div>
      ) : (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {columns.map((column) => (
                    <th key={column.key}>{column.header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row, index) => (
                  <tr key={`${title}-${safePage}-${index}`}>
                    {columns.map((column) => (
                      <td key={column.key}>{column.render(row)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pageCount > 1 && (
            <div className="table-pagination">
              <button type="button" onClick={() => setPage(Math.max(0, safePage - 1))} disabled={safePage === 0}>
                Önceki
              </button>
              <span>
                Sayfa {safePage + 1} / {pageCount}
              </span>
              <button
                type="button"
                onClick={() => setPage(Math.min(pageCount - 1, safePage + 1))}
                disabled={safePage >= pageCount - 1}
              >
                Sonraki
              </button>
            </div>
          )}
        </>
      )}
    </section>
  )
}

function buildSeriesRows(series: TimeSeriesPoint[]) {
  return series.map((point) => ({
    bucket: point.label,
    value: point.value,
    sampleCount: point.count,
    timestamp: point.timestamp.slice(0, 10),
  }))
}

export function DataExplorerPanel({
  dataset,
  analysis,
  filters,
  neighborhoods,
}: DataExplorerPanelProps) {
  const selectedStationIds = useMemo(
    () => new Set(analysis.selectedStations.map((station) => station.id)),
    [analysis.selectedStations],
  )

  const meteoRows = useMemo(() => {
    const buckets = new Map<
      string,
      {
        temperature: number[]
        humidity: number[]
        windSpeed: number[]
        windDirection: number[]
        pressure: number[]
        precipitation: number[]
      }
    >()

    for (const record of dataset.meteoTimeSeries) {
      if (!selectedStationIds.has(record.stationIdOrGridId)) {
        continue
      }
      if (!isInsideRange(record.timestamp, filters.startDate, filters.endDate)) {
        continue
      }

      const key = record.timestamp.slice(0, 10)
      const bucket = buckets.get(key) ?? {
        temperature: [],
        humidity: [],
        windSpeed: [],
        windDirection: [],
        pressure: [],
        precipitation: [],
      }
      bucket.temperature.push(record.temperatureC)
      bucket.humidity.push(record.humidityPct)
      bucket.windSpeed.push(record.windSpeedMs)
      bucket.windDirection.push(record.windDirDeg)
      if (record.surfacePressureHpa !== null) {
        bucket.pressure.push(record.surfacePressureHpa)
      }
      bucket.precipitation.push(record.precipitationMm)
      buckets.set(key, bucket)
    }

    return [...buckets.entries()]
      .map(([date, bucket]) => ({
        date,
        temperatureC:
          bucket.temperature.reduce((sum, value) => sum + value, 0) / bucket.temperature.length,
        humidityPct:
          bucket.humidity.reduce((sum, value) => sum + value, 0) / bucket.humidity.length,
        windSpeedMs:
          bucket.windSpeed.reduce((sum, value) => sum + value, 0) / bucket.windSpeed.length,
        windDirDeg: circularMean(bucket.windDirection),
        surfacePressureHpa: bucket.pressure.length
          ? bucket.pressure.reduce((sum, value) => sum + value, 0) / bucket.pressure.length
          : null,
        precipitationMm: bucket.precipitation.reduce((sum, value) => sum + value, 0),
      }))
      .sort((left, right) => right.date.localeCompare(left.date))
  }, [dataset.meteoTimeSeries, filters.endDate, filters.startDate, selectedStationIds])

  const overlappingEvents = useMemo(
    () =>
      dataset.events
        .filter(
          (event) =>
            (!filters.startDate || event.endDate.slice(0, 10) >= filters.startDate) &&
            (!filters.endDate || event.startDate.slice(0, 10) <= filters.endDate),
        )
        .sort((left, right) => right.startDate.localeCompare(left.startDate)),
    [dataset.events, filters.endDate, filters.startDate],
  )

  const neighborhoodRows = useMemo(
    () =>
      [...neighborhoods]
        .sort((left, right) => {
          if (right.stationIds.length !== left.stationIds.length) {
            return right.stationIds.length - left.stationIds.length
          }
          return (right.roadDensity ?? 0) - (left.roadDensity ?? 0)
        }),
    [neighborhoods],
  )

  return (
    <div className="insights-grid data-explorer-grid">
      <PagedTable
        title="Zaman serisi tablosu"
        description="Seçili zaman çözünürlüğünde oluşan analitik seri."
        columns={[
          { key: 'bucket', header: 'Dilim', render: (row) => row.bucket },
          { key: 'date', header: 'Tarih', render: (row) => row.timestamp },
          { key: 'value', header: 'Değer', render: (row) => formatNumber(row.value) },
          { key: 'count', header: 'Gözlem', render: (row) => row.sampleCount },
        ]}
        rows={buildSeriesRows(analysis.aggregateSeries)}
        pageSize={12}
      />

      <PagedTable
        title="Dönemsel karşılaştırma"
        description="Ay-ay, mevsim-mevsim veya aynı ay farklı yıl karşılaştırması."
        columns={[
          { key: 'bucket', header: 'Dilim', render: (row) => row.bucket },
          { key: 'date', header: 'Tarih', render: (row) => row.timestamp },
          { key: 'value', header: 'Değer', render: (row) => formatNumber(row.value) },
          { key: 'count', header: 'Gözlem', render: (row) => row.sampleCount },
        ]}
        rows={buildSeriesRows(analysis.comparisonSeries)}
        pageSize={12}
      />

      <PagedTable
        title="İstasyon özeti"
        description="Seçili kirletici için istasyonların son durum ve anomali görünümü."
        columns={[
          { key: 'station', header: 'İstasyon', render: (row) => row.name },
          { key: 'source', header: 'Kaynak', render: (row) => row.source },
          { key: 'value', header: 'Son ortalama', render: (row) => formatNumber(row.value) },
          { key: 'anomaly', header: 'Anomali z', render: (row) => formatSigned(row.anomaly, 2) },
          { key: 'mean', header: 'Dönem ort.', render: (row) => formatNumber(row.mean) },
        ]}
        rows={analysis.stationSnapshots.map((snapshot) => {
          const station = dataset.stations.find((item) => item.id === snapshot.stationId)
          return {
            name: station?.name ?? snapshot.stationId,
            source: station?.dataSource ?? '-',
            value: snapshot.currentValue,
            anomaly: snapshot.anomalyZScore,
            mean: snapshot.meanValue,
          }
        })}
        pageSize={10}
      />

      <PagedTable
        title="Meteoroloji özeti"
        description="Seçili istasyon kümesi için günlük ortalama meteoroloji tablosu."
        columns={[
          { key: 'date', header: 'Tarih', render: (row) => row.date },
          { key: 'temp', header: 'Sıcaklık °C', render: (row) => formatNumber(row.temperatureC, 1) },
          { key: 'humidity', header: 'Nem %', render: (row) => formatNumber(row.humidityPct, 0) },
          { key: 'pressure', header: 'Basınç hPa', render: (row) => formatNumber(row.surfacePressureHpa, 1) },
          { key: 'wind', header: 'Rüzgâr', render: (row) => `${formatNumber(row.windSpeedMs, 1)} m/s · ${formatNumber(row.windDirDeg, 0)}°` },
          { key: 'rain', header: 'Yağış mm', render: (row) => formatNumber(row.precipitationMm, 1) },
        ]}
        rows={meteoRows}
        pageSize={14}
      />

      <PagedTable
        title="Bağlamsal tampon metrikleri"
        description="Seçili istasyonlar için tampon yarıçapına bağlı çevresel metrikler."
        columns={[
          { key: 'station', header: 'İstasyon', render: (row) => row.stationName },
          { key: 'building', header: 'Bina yoğunluğu', render: (row) => formatPercent(row.buildingDensity, 1) },
          { key: 'road', header: 'Yol yoğunluğu', render: (row) => formatNumber(row.roadDensity, 2) },
          { key: 'green', header: 'Yeşil oran', render: (row) => formatPercent(row.greenRatio, 1) },
          { key: 'industry', header: 'Sanayi', render: (row) => row.industryCount },
          { key: 'elevation', header: 'Yükseklik', render: (row) => `${formatNumber(row.meanElevation, 0)} m` },
        ]}
        rows={analysis.selectedContextMetrics.map((metric) => ({
          ...metric,
          stationName:
            dataset.stations.find((station) => station.id === metric.stationId)?.name ?? metric.stationId,
        }))}
        pageSize={8}
      />

      <PagedTable
        title="Olay kataloğu"
        description="Yangın, toz taşınımı ve rüzgâr olayları filtre aralığına göre listelenir."
        columns={[
          { key: 'name', header: 'Olay', render: (row) => row.name },
          { key: 'type', header: 'Tür', render: (row) => row.eventType },
          { key: 'date', header: 'Aralık', render: (row) => `${row.startDate.slice(0, 10)} → ${row.endDate.slice(0, 10)}` },
          { key: 'source', header: 'Kaynak', render: (row) => row.source },
          { key: 'confidence', header: 'Güven', render: (row) => formatPercent(row.confidence, 0) },
        ]}
        rows={overlappingEvents}
        pageSize={8}
      />

      <PagedTable
        title="Mahalle özeti"
        description="Yüklenen mahalle katmanından türetilen statik özetler."
        columns={[
          { key: 'name', header: 'Mahalle', render: (row) => row.name },
          { key: 'district', header: 'İlçe', render: (row) => row.district ?? '-' },
          { key: 'stations', header: 'İstasyon', render: (row) => row.stationIds.length },
          { key: 'road', header: 'Yol yoğunluğu', render: (row) => formatNumber(row.roadDensity, 2) },
          { key: 'industry', header: 'Sanayi', render: (row) => row.industryCount },
          { key: 'green', header: 'Yeşil oran', render: (row) => formatPercent(row.greenRatio ?? 0, 1) },
          { key: 'elevation', header: 'Ortalama yükseklik', render: (row) => `${formatNumber(row.meanElevation, 0)} m` },
        ]}
        rows={neighborhoodRows}
        pageSize={10}
      />
    </div>
  )
}
