# Raw Data Staging

Bu klasor, gercek kaynaklardan cekilen cache dosyalarini tutar.

Beklenen alt klasorler:

- `official`: resmi hava kalitesi defaults ve aylik chunk JSON cevaplari
- `meteo`: Open-Meteo station cache dosyalari
- `layers`: Overpass bbox sorgulari
- `context`: istasyon cevresi icin Overpass around sorgulari
- `elevation`: yukseklik grid ve istasyon orneklem cache dosyalari
- `fires`: EONET veya FIRMS olay cache dosyalari

Varsayilan veri uretimi:

```powershell
python scripts/build_static_dataset.py `
  --mode fetch `
  --output public/data/bursa-air-quality-v1.json
```

Yerel CSV import modu gerekiyorsa:

```powershell
python scripts/build_static_dataset.py `
  --mode local `
  --output public/data/bursa-air-quality-v1.json `
  --air-quality-csv data/raw/air_quality.csv `
  --meteo-csv data/raw/meteo.csv `
  --context-csv data/raw/context_metrics.csv `
  --events-csv data/raw/events.csv
```
