# Hava Kirliliği Lab

React + TypeScript + Vite + Leaflet tabanli, backend gerektirmeyen Bursa hava kirliligi analiz uygulamasi.

Uygulama su an proje icinde statik olarak tutulan gercek veri paketini okur:

- son 5 yillik resmi gunluk hava kalitesi istasyon serisi
- gunluk meteoroloji baglami
- OSM tabanli yol / yesil alan / sanayi katmanlari
- istasyon buffer metrikleri
- CSV / PNG / SVG export

## Stack

- Frontend: React 19, TypeScript, Vite, Leaflet, Recharts
- Veri hazirlama: Python 3.12
- Python bagimliligi: `requests`
- Test: Vitest + unittest

## Baslatma

```powershell
python -m pip install -r requirements.txt
npm install
npm run generate:data
npm run dev
```

Production build:

```powershell
npm run build
npm run preview
```

## Scriptler

- `npm run dev`: gelistirme sunucusu
- `npm run build`: production build
- `npm run lint`: ESLint
- `npm run test`: frontend testleri
- `npm run test:py`: Python ETL testleri
- `npm run generate:data`: gercek kaynaklardan Bursa statik veri paketini uretir

## Veri Hatti

Varsayilan komut:

```powershell
python scripts/build_static_dataset.py `
  --mode fetch `
  --output public/data/bursa-air-quality-v1.json
```

Komut su isi yapar:

- Ulusal Hava Kalitesi Izleme Agi uzerinden Bursa istasyonlarini bulur
- bugun ve onceki 5 yil icin gunluk resmi hava kalitesi verisini aylik chunk'lar halinde ceker
- Open-Meteo Archive uzerinden gunluk sicaklik / nem / ruzgar / yagis serisini ceker
- Overpass API uzerinden yol, yesil alan ve sanayi katmanlarini ceker
- istasyon buffer metriklerini hesaplar
- yangin katalogu icin `FIRMS_MAP_KEY` varsa NASA FIRMS, yoksa EONET fallback kullanir
- tek statik JSON paket yazar

Tarih penceresini elle vermek istersen:

```powershell
python scripts/build_static_dataset.py `
  --mode fetch `
  --start-date 2021-03-15 `
  --end-date 2026-03-15 `
  --output public/data/bursa-air-quality-v1.json
```

Ham cache klasoru:

- `data/raw/official`
- `data/raw/meteo`
- `data/raw/layers`
- `data/raw/context`
- `data/raw/elevation`
- `data/raw/fires`

Yerel CSV import modu hala korunuyor:

```powershell
python scripts/build_static_dataset.py `
  --mode local `
  --output public/data/bursa-air-quality-v1.json `
  --air-quality-csv data/raw/air_quality.csv `
  --meteo-csv data/raw/meteo.csv `
  --context-csv data/raw/context_metrics.csv `
  --events-csv data/raw/events.csv
```

## Kaynaklar

- Resmi hava kalitesi: [Ulusal Hava Kalitesi Izleme Agi](https://sim.csb.gov.tr/STN/STN_Report/StationDataDownloadNew)
- Meteoroloji: [Open-Meteo Archive](https://archive-api.open-meteo.com/)
- Vektor katmanlar: [Overpass API](https://overpass-api.de/)
- Yangin fallback: [NASA EONET](https://eonet.gsfc.nasa.gov/api/v3/events)
- Opsiyonel tarihsel hotspot: [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/api/)

Notlar:

- V1 veri paketi gunluk resmi seri uzerine kurulu; 5 yillik saatlik arsiv bundle maliyeti nedeniyle statik pakete alinmadi.
- `FIRMS_MAP_KEY` tanimli degilse yangin katalogu EONET fallback ile sinirli kalir.
- Veri eksikleri uygulama icinde "Veri Notlari" ve butunluk yuzdeleri olarak gosterilir.

## Proje Yapisi

- [src/App.tsx](/C:/Users/Yusuf/zeynep-bitirme/src/App.tsx): ana dashboard ve veri kalite bandi
- [src/components/MapPanel.tsx](/C:/Users/Yusuf/zeynep-bitirme/src/components/MapPanel.tsx): Leaflet harita ve katmanlar
- [src/components/InsightsPanel.tsx](/C:/Users/Yusuf/zeynep-bitirme/src/components/InsightsPanel.tsx): grafik, tablo ve olay etkisi
- [src/utils/analytics.ts](/C:/Users/Yusuf/zeynep-bitirme/src/utils/analytics.ts): toplulastirma, trend, korelasyon ve event impact
- [etl/pipeline.py](/C:/Users/Yusuf/zeynep-bitirme/etl/pipeline.py): yerel CSV normalizasyonu
- [etl/real_sources.py](/C:/Users/Yusuf/zeynep-bitirme/etl/real_sources.py): gercek veri fetcher ve statik paketleyici
- [scripts/build_static_dataset.py](/C:/Users/Yusuf/zeynep-bitirme/scripts/build_static_dataset.py): veri uretim CLI
