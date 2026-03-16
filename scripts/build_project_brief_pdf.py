from __future__ import annotations

import argparse
import json
import textwrap
from collections import Counter
from datetime import datetime
from pathlib import Path

import matplotlib.dates as mdates
import matplotlib.pyplot as plt
from matplotlib.backends.backend_pdf import PdfPages
from matplotlib.patches import FancyArrowPatch, FancyBboxPatch


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DATASET = ROOT / "public" / "data" / "bursa-air-quality-v1.json"
DEFAULT_BOUNDARY = ROOT / "public" / "data" / "bursa-boundary.json"
DEFAULT_OUTPUT = ROOT / "docs" / "generated" / "bursa-proje-ozeti.pdf"
DEFAULT_ASSETS = ROOT / "docs" / "generated" / "assets"

plt.rcParams["font.family"] = "DejaVu Sans"

PAGE_BG = "#f7f2ea"
PANEL_BG = "#fffdf8"
INK = "#1f2620"
MUTED = "#58635c"
ACCENT = "#0f766e"
ACCENT_2 = "#d97706"
ACCENT_3 = "#b45309"
GRID = "#d8d2c5"
RED = "#b6493a"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build a concise Bursa project brief PDF.")
    parser.add_argument("--dataset", default=str(DEFAULT_DATASET))
    parser.add_argument("--boundary", default=str(DEFAULT_BOUNDARY))
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT))
    return parser.parse_args()


def load_json(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def ensure_dir(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def fmt_date(date_text: str) -> str:
    value = datetime.fromisoformat(date_text.replace("Z", "+00:00"))
    return value.strftime("%d.%m.%Y")


def wrap(value: str, width: int) -> str:
    return textwrap.fill(value, width=width)


def add_panel(fig, x: float, y: float, w: float, h: float, radius: float = 0.02):
    panel = FancyBboxPatch(
        (x, y),
        w,
        h,
        boxstyle=f"round,pad=0.008,rounding_size={radius}",
        linewidth=0.8,
        edgecolor="#e7dece",
        facecolor=PANEL_BG,
        transform=fig.transFigure,
        zorder=1,
    )
    fig.patches.append(panel)


def fig_text(fig, x: float, y: float, text: str, **kwargs):
    defaults = dict(transform=fig.transFigure, color=INK, va="top", ha="left")
    defaults.update(kwargs)
    fig.text(x, y, text, **defaults)


def draw_bullets(fig, x: float, y: float, items: list[str], width: int = 48, step: float = 0.05):
    current_y = y
    for item in items:
        wrapped = wrap(item, width)
        fig_text(fig, x, current_y, f"• {wrapped}", fontsize=11, color=MUTED)
        current_y -= step * (wrapped.count("\n") + 1)


def draw_workflow_image(output_path: Path):
    fig = plt.figure(figsize=(10, 5.8), facecolor=PAGE_BG)
    ax = fig.add_axes([0.04, 0.08, 0.92, 0.84])
    ax.set_axis_off()

    nodes = [
        (0.08, 0.6, 0.22, 0.22, "Veri Kaynakları", "Resmî istasyonlar\nMeteoroloji\nOSM katmanları\nOlay kayıtları"),
        (0.39, 0.6, 0.22, 0.22, "ETL ve Doğrulama", "5 yıllık pencere\nBütünlük hesabı\nKatman üretimi\nTek paket"),
        (0.70, 0.6, 0.22, 0.22, "Statik Veri Paketi", "Tek JSON\nTekrar üretilebilir\nFrontend hazır"),
        (0.24, 0.18, 0.22, 0.22, "Analiz Modülleri", "Trend\nAnomali\nAşım epizodu\nOlay dönemi"),
        (0.54, 0.18, 0.22, 0.22, "Çıktılar", "Harita\nGrafik\nTablo\nTez bulgusu"),
    ]

    for x, y, w, h, title, body in nodes:
        box = FancyBboxPatch(
            (x, y),
            w,
            h,
            boxstyle="round,pad=0.02,rounding_size=0.03",
            linewidth=1.2,
            edgecolor="#d8d2c5",
            facecolor="#fffdf8",
        )
        ax.add_patch(box)
        ax.text(x + 0.02, y + h - 0.04, title, fontsize=13, fontweight="bold", color=INK, va="top")
        ax.text(x + 0.02, y + h - 0.11, body, fontsize=11, color=MUTED, va="top")

    arrows = [
        ((0.30, 0.71), (0.39, 0.71)),
        ((0.61, 0.71), (0.70, 0.71)),
        ((0.50, 0.60), (0.35, 0.40)),
        ((0.74, 0.60), (0.64, 0.40)),
        ((0.46, 0.29), (0.54, 0.29)),
    ]
    for start, end in arrows:
        ax.add_patch(
            FancyArrowPatch(
                start,
                end,
                arrowstyle="-|>",
                mutation_scale=14,
                linewidth=2.0,
                color=ACCENT,
            )
        )

    ax.text(0.08, 0.92, "Proje İş Akışı", fontsize=18, fontweight="bold", color=INK)
    ax.text(
        0.08,
        0.87,
        "Bu platform, veriyi canlı sorgudan değil tekrar üretilebilir statik veri paketinden okur.",
        fontsize=11.5,
        color=MUTED,
    )
    fig.savefig(output_path, dpi=200, facecolor=fig.get_facecolor(), bbox_inches="tight")
    plt.close(fig)


def draw_completeness_image(dataset: dict, output_path: Path):
    rows = dataset["metadata"]["completenessOverview"]
    source_counts = Counter(record["source"] for record in dataset["stationTimeSeries"])

    fig, axes = plt.subplots(1, 2, figsize=(11.2, 4.8), facecolor=PAGE_BG)
    for ax in axes:
        ax.set_facecolor(PANEL_BG)

    pollutants = [row["pollutant"] for row in rows]
    ratios = [row["completenessRatio"] * 100 for row in rows]
    colors = [ACCENT if ratio >= 80 else ACCENT_2 for ratio in ratios]

    axes[0].barh(pollutants, ratios, color=colors, edgecolor="none", height=0.58)
    axes[0].set_xlim(0, 100)
    axes[0].set_title("Resmî ağ veri bütünlüğü", loc="left", fontsize=14, fontweight="bold", color=INK)
    axes[0].set_xlabel("Doluluk (%)", color=MUTED)
    axes[0].grid(axis="x", color=GRID, linewidth=0.8, alpha=0.9)
    axes[0].tick_params(colors=MUTED)
    for index, ratio in enumerate(ratios):
        axes[0].text(ratio + 1.2, index, f"%{ratio:.2f}", va="center", fontsize=10.5, color=INK)

    labels = []
    values = []
    palette = []
    source_palette = {
        "Ulusal Hava Kalitesi İzleme Ağı": ACCENT,
        "Open-Meteo Air Quality": ACCENT_2,
        "Airqoon / Mudanya Municipality": RED,
    }
    for label, value in source_counts.items():
        labels.append(label.replace("Ulusal Hava Kalitesi İzleme Ağı", "Resmî ağ"))
        values.append(value)
        palette.append(source_palette.get(label, ACCENT_3))

    axes[1].bar(labels, values, color=palette, edgecolor="none", width=0.58)
    axes[1].set_title("Kayıt kaynağı dağılımı", loc="left", fontsize=14, fontweight="bold", color=INK)
    axes[1].grid(axis="y", color=GRID, linewidth=0.8, alpha=0.9)
    axes[1].tick_params(axis="y", colors=MUTED)
    axes[1].tick_params(axis="x", rotation=13, labelsize=9.5, colors=MUTED)
    for idx, value in enumerate(values):
        axes[1].text(idx, value + max(values) * 0.015, f"{value:,}".replace(",", "."), ha="center", fontsize=10, color=INK)

    for spine in ("top", "right"):
        axes[0].spines[spine].set_visible(False)
        axes[1].spines[spine].set_visible(False)
    axes[0].spines["left"].set_color(GRID)
    axes[0].spines["bottom"].set_color(GRID)
    axes[1].spines["left"].set_color(GRID)
    axes[1].spines["bottom"].set_color(GRID)

    fig.tight_layout()
    fig.savefig(output_path, dpi=220, facecolor=fig.get_facecolor(), bbox_inches="tight")
    plt.close(fig)


def draw_event_timeline_image(dataset: dict, output_path: Path):
    events = sorted(dataset["events"], key=lambda item: item["startDate"])
    fig, ax = plt.subplots(figsize=(11.2, 4.8), facecolor=PAGE_BG)
    ax.set_facecolor(PANEL_BG)

    y_positions = list(range(len(events)))[::-1]
    colors = {
        "fire": ACCENT_3,
        "industrial-fire": RED,
        "dust-transport": ACCENT_2,
        "wind-event": ACCENT,
    }
    start_values = [datetime.fromisoformat(event["startDate"].replace("Z", "+00:00")) for event in events]
    end_values = [datetime.fromisoformat(event["endDate"].replace("Z", "+00:00")) for event in events]

    for y, event, start, end in zip(y_positions, events, start_values, end_values):
        ax.plot([start, end], [y, y], linewidth=8, solid_capstyle="round", color=colors.get(event["eventType"], ACCENT))
        ax.scatter([start, end], [y, y], s=40, color=colors.get(event["eventType"], ACCENT), zorder=3)
        ax.text(end, y + 0.18, event["name"], fontsize=10.2, color=INK, va="bottom")

    ax.set_yticks(y_positions)
    ax.set_yticklabels([event["source"] for event in events], fontsize=9.5, color=MUTED)
    ax.set_title("Projede yer alan olay pencereleri", loc="left", fontsize=14, fontweight="bold", color=INK)
    ax.xaxis.set_major_locator(mdates.MonthLocator(interval=4))
    ax.xaxis.set_major_formatter(mdates.DateFormatter("%b %Y"))
    ax.grid(axis="x", color=GRID, linewidth=0.8)
    ax.tick_params(axis="x", rotation=0, colors=MUTED)
    ax.tick_params(axis="y", colors=MUTED)
    for spine in ("top", "right", "left"):
        ax.spines[spine].set_visible(False)
    ax.spines["bottom"].set_color(GRID)
    fig.tight_layout()
    fig.savefig(output_path, dpi=220, facecolor=fig.get_facecolor(), bbox_inches="tight")
    plt.close(fig)


def draw_station_map_image(dataset: dict, boundary: dict, output_path: Path):
    fig, ax = plt.subplots(figsize=(8.6, 6.3), facecolor=PAGE_BG)
    ax.set_facecolor(PANEL_BG)

    for polygon_group in boundary["coordinates"]:
        for polygon in polygon_group:
            xs = [point[0] for point in polygon]
            ys = [point[1] for point in polygon]
            ax.plot(xs, ys, color="#cabca8", linewidth=0.8, alpha=0.9)
            ax.fill(xs, ys, color="#eee6d7", alpha=0.7)

    source_style = {
        "official": dict(color=ACCENT, marker="o", size=54, label="Resmî istasyon"),
        "modeled": dict(color=ACCENT_2, marker="o", size=54, label="Model yardımcı seri"),
        "municipal-sensor": dict(color=RED, marker="*", size=95, label="Belediye sensörü"),
    }

    plotted_labels = set()
    for station in dataset["stations"]:
        style = source_style.get(station.get("dataSource", "official"), source_style["official"])
        label = style["label"] if style["label"] not in plotted_labels else None
        plotted_labels.add(style["label"])
        ax.scatter(
            station["lng"],
            station["lat"],
            s=style["size"],
            color=style["color"],
            marker=style["marker"],
            label=label,
            edgecolors=PANEL_BG,
            linewidths=0.8,
            alpha=0.9,
        )

    ax.set_title("Bursa istasyon ve yardımcı seri kapsamı", loc="left", fontsize=14, fontweight="bold", color=INK)
    ax.set_xlabel("Boylam", color=MUTED)
    ax.set_ylabel("Enlem", color=MUTED)
    ax.tick_params(colors=MUTED)
    ax.grid(color=GRID, linewidth=0.6, alpha=0.7)
    ax.legend(frameon=False, loc="lower left", fontsize=9.5)
    for spine in ax.spines.values():
        spine.set_color(GRID)
    fig.tight_layout()
    fig.savefig(output_path, dpi=220, facecolor=fig.get_facecolor(), bbox_inches="tight")
    plt.close(fig)


def render_page_one(pdf: PdfPages, dataset: dict, assets: dict[str, Path]):
    fig = plt.figure(figsize=(8.27, 11.69), facecolor=PAGE_BG)
    add_panel(fig, 0.05, 0.84, 0.90, 0.11, 0.03)
    fig_text(fig, 0.08, 0.91, "Bursa Hava Kirliliği Proje Özeti", fontsize=24, fontweight="bold")
    fig_text(fig, 0.08, 0.872, "Bilimsel çalışma ve tez kullanımı için kısa açıklama notu", fontsize=12, color=MUTED)
    fig_text(fig, 0.76, 0.905, fmt_date(dataset["metadata"]["generatedAt"]), fontsize=11, color=ACCENT)

    add_panel(fig, 0.05, 0.48, 0.42, 0.32)
    fig_text(fig, 0.08, 0.77, "Bu proje ne yapar?", fontsize=16, fontweight="bold")
    draw_bullets(
        fig,
        0.08,
        0.735,
        [
            "Bursa’daki hava kirliliği değişimini günlük, aylık, mevsimlik ve yıllık ölçekte izler.",
            "İstasyon çevresindeki yol, yeşil alan, sanayi ve yükseklik bağlamını birlikte okur.",
            "Belirli olayları seçip olay öncesi ve sonrası pencere içinde karşılaştırmalı analiz yapar.",
            "Trend, anomali, eşik aşımı ve bozulma sinyallerini aynı ekranda toplar.",
            "Tezde yöntem, bulgu, tartışma ve vaka analizi bölümleri için tekrar üretilebilir çıktı sağlar.",
        ],
        width=48,
        step=0.048,
    )

    add_panel(fig, 0.50, 0.48, 0.45, 0.32)
    img_ax = fig.add_axes([0.53, 0.515, 0.39, 0.24])
    img_ax.imshow(plt.imread(assets["workflow"]))
    img_ax.axis("off")

    add_panel(fig, 0.05, 0.10, 0.90, 0.30)
    fig_text(fig, 0.08, 0.365, "Proje kapsamı", fontsize=16, fontweight="bold")
    counts = {
        "İstasyon": len(dataset["stations"]),
        "Hava kalitesi kaydı": len(dataset["stationTimeSeries"]),
        "Meteoroloji kaydı": len(dataset["meteoTimeSeries"]),
        "Olay": len(dataset["events"]),
        "Yol katmanı": len(dataset["roads"]),
        "Yeşil alan": len(dataset["greenAreas"]),
        "Sanayi noktası": len(dataset["industries"]),
    }
    x_positions = [0.08, 0.32, 0.56, 0.76]
    y_positions = [0.31, 0.20]
    card_index = 0
    for label, value in counts.items():
        x = x_positions[card_index % 4]
        y = y_positions[card_index // 4]
        add_panel(fig, x, y, 0.17, 0.08, 0.02)
        fig_text(fig, x + 0.02, y + 0.055, label, fontsize=10, color=MUTED)
        fig_text(fig, x + 0.02, y + 0.032, f"{value:,}".replace(",", "."), fontsize=18, fontweight="bold", color=INK)
        card_index += 1

    fig_text(
        fig,
        0.08,
        0.145,
        wrap(
            "Önerilen kullanım modu: temel sonuçları resmî istasyonlar üzerinden üret, belediye sensörünü ve model serisini yalnız destekleyici karşılaştırma katmanı olarak yorumla.",
            110,
        ),
        fontsize=11,
        color=MUTED,
    )

    pdf.savefig(fig, facecolor=fig.get_facecolor())
    plt.close(fig)


def render_page_two(pdf: PdfPages, dataset: dict, assets: dict[str, Path]):
    fig = plt.figure(figsize=(8.27, 11.69), facecolor=PAGE_BG)
    add_panel(fig, 0.05, 0.86, 0.90, 0.08, 0.03)
    fig_text(fig, 0.08, 0.913, "Veri kaynakları ve güvenilirlik", fontsize=21, fontweight="bold")
    fig_text(fig, 0.08, 0.882, "Bu sayfa veri bütünlüğü, kaynak yapısı ve mekânsal kapsama odaklanır.", fontsize=11.5, color=MUTED)

    add_panel(fig, 0.05, 0.48, 0.54, 0.32)
    ax_left = fig.add_axes([0.075, 0.515, 0.50, 0.25])
    ax_left.imshow(plt.imread(assets["quality"]))
    ax_left.axis("off")

    add_panel(fig, 0.63, 0.48, 0.32, 0.32)
    fig_text(fig, 0.66, 0.77, "Nasıl okunmalı?", fontsize=16, fontweight="bold")
    draw_bullets(
        fig,
        0.66,
        0.735,
        [
            "Veri bütünlüğü kartı yalnız resmî ağın actual / expected sayımından hesaplanır.",
            "Model tabanlı seri boşluk doldurma için değil, arka plan karşılaştırması için kullanılır.",
            "Belediye sensör ağı şu aşamada sınırlıdır; yardımcı katman gibi değerlendirilmelidir.",
            "Zayıf istasyonlar bulgu üretirken ayrıca not edilmelidir.",
        ],
        width=31,
        step=0.052,
    )

    add_panel(fig, 0.05, 0.10, 0.90, 0.30)
    fig_text(fig, 0.08, 0.37, "Mekânsal kapsama görünümü", fontsize=16, fontweight="bold")
    ax_map = fig.add_axes([0.08, 0.13, 0.44, 0.20])
    ax_map.imshow(plt.imread(assets["map"]))
    ax_map.axis("off")

    fig_text(fig, 0.56, 0.33, "Başlıca kaynaklar", fontsize=14, fontweight="bold")
    draw_bullets(
        fig,
        0.56,
        0.30,
        [
            "Ulusal Hava Kalitesi İzleme Ağı: ana bilimsel omurga",
            "Open-Meteo Archive: günlük meteoroloji bağlamı",
            "OSM / Overpass: yol, sanayi ve yeşil alan katmanları",
            "Kürasyonlu olay kataloğu: yangın, toz taşınımı, lodos",
        ],
        width=42,
        step=0.05,
    )

    pdf.savefig(fig, facecolor=fig.get_facecolor())
    plt.close(fig)


def render_page_three(pdf: PdfPages, dataset: dict, assets: dict[str, Path]):
    fig = plt.figure(figsize=(8.27, 11.69), facecolor=PAGE_BG)
    add_panel(fig, 0.05, 0.86, 0.90, 0.08, 0.03)
    fig_text(fig, 0.08, 0.913, "Olaylar ve yorum alanları", fontsize=21, fontweight="bold")
    fig_text(fig, 0.08, 0.882, "Projede yer alan doğrulanmış olaylar ve bunlardan üretilebilecek sorular.", fontsize=11.5, color=MUTED)

    add_panel(fig, 0.05, 0.50, 0.90, 0.30)
    ax_timeline = fig.add_axes([0.08, 0.535, 0.84, 0.22])
    ax_timeline.imshow(plt.imread(assets["timeline"]))
    ax_timeline.axis("off")

    add_panel(fig, 0.05, 0.10, 0.42, 0.30)
    fig_text(fig, 0.08, 0.37, "Projede geçen olaylar", fontsize=16, fontweight="bold")
    event_lines = [
        f"{fmt_date(event['startDate'])} - {fmt_date(event['endDate'])}: {event['name']}"
        for event in dataset["events"]
    ]
    draw_bullets(fig, 0.08, 0.335, event_lines, width=44, step=0.044)

    add_panel(fig, 0.53, 0.10, 0.42, 0.30)
    fig_text(fig, 0.56, 0.37, "Bu projeyle sorulabilecek sorular", fontsize=16, fontweight="bold")
    draw_bullets(
        fig,
        0.56,
        0.335,
        [
            "Yangın veya toz taşınımı sırasında PM10 ve PM2.5 seviyeleri normal döneme göre arttı mı?",
            "Kış ve yaz dönemlerinde aynı istasyonun arka plan seviyesi ne kadar değişiyor?",
            "Yol yoğunluğu veya sanayi sayısı yüksek istasyonlarda ortalama seviye daha mı yüksek?",
            "Hafta içi ve hafta sonu sinyali trafik etkisini destekliyor mu?",
            "Belirli bir tarihteki pik kısa süreli bir olay mı, yoksa yapısal bir bozulma mı?",
        ],
        width=42,
        step=0.05,
    )

    pdf.savefig(fig, facecolor=fig.get_facecolor())
    plt.close(fig)


def render_page_four(pdf: PdfPages, dataset: dict):
    fig = plt.figure(figsize=(8.27, 11.69), facecolor=PAGE_BG)
    add_panel(fig, 0.05, 0.86, 0.90, 0.08, 0.03)
    fig_text(fig, 0.08, 0.913, "Tezde nasıl kullanılabilir?", fontsize=21, fontweight="bold")
    fig_text(fig, 0.08, 0.882, "Kısa, güvenli ve akademik olarak savunulabilir kullanım çerçevesi.", fontsize=11.5, color=MUTED)

    add_panel(fig, 0.05, 0.53, 0.42, 0.24)
    fig_text(fig, 0.08, 0.74, "Yöntem bölümünde", fontsize=16, fontweight="bold")
    draw_bullets(
        fig,
        0.08,
        0.705,
        [
            "5 yıllık günlük veri penceresi ve istasyon-temelli yaklaşım anlatılabilir.",
            "Buffer metriği, trend, anomali, aşım epizodu ve olay penceresi açıkça tanımlanabilir.",
            "Tekrar üretilebilir statik veri paketi yaklaşımı metodolojik güç olarak sunulabilir.",
        ],
        width=42,
        step=0.055,
    )

    add_panel(fig, 0.53, 0.53, 0.42, 0.24)
    fig_text(fig, 0.56, 0.74, "Bulgular bölümünde", fontsize=16, fontweight="bold")
    draw_bullets(
        fig,
        0.56,
        0.705,
        [
            "İstasyon bazlı dönem karşılaştırmaları tablo ve grafik olarak verilebilir.",
            "Olay odaklı vaka analizleri kısa alt başlıklar halinde sunulabilir.",
            "Mekânsal bağlam ile kirletici seviyesi ilişkileri açıklayıcı bulgu olarak yazılabilir.",
        ],
        width=42,
        step=0.055,
    )

    add_panel(fig, 0.05, 0.19, 0.42, 0.24)
    fig_text(fig, 0.08, 0.40, "Güçlü yanlar", fontsize=16, fontweight="bold")
    draw_bullets(
        fig,
        0.08,
        0.365,
        [
            "Resmî ağ veri bütünlüğü görünürdür.",
            "Olay, meteoroloji ve mekânsal bağlam birlikte okunur.",
            "Aynı araç hem keşif hem raporlama için kullanılabilir.",
        ],
        width=42,
        step=0.055,
    )

    add_panel(fig, 0.53, 0.19, 0.42, 0.24)
    fig_text(fig, 0.56, 0.40, "Dikkat edilmesi gerekenler", fontsize=16, fontweight="bold")
    draw_bullets(
        fig,
        0.56,
        0.365,
        [
            "Bu platform açıklayıcı analiz sağlar; tek başına nedenselliği kanıtlamaz.",
            "Model seri ve belediye sensörü ana bulgu yerine yardımcı kanıt olarak kullanılmalıdır.",
            "Eksik veri yüksek istasyonlar tezde ayrıca belirtilmelidir.",
        ],
        width=42,
        step=0.055,
    )

    fig_text(
        fig,
        0.08,
        0.12,
        wrap(
            "Kısa öneri: tezde ana anlatıyı resmî istasyon ağı üzerine kur; olay ve mekânsal bağlamı destekleyici yorum katmanı olarak kullan. Böylece proje hem görsel hem metodolojik bir araç olarak güçlü kalır.",
            115,
        ),
        fontsize=12,
        color=INK,
    )

    pdf.savefig(fig, facecolor=fig.get_facecolor())
    plt.close(fig)


def main() -> None:
    args = parse_args()
    dataset = load_json(Path(args.dataset))
    boundary = load_json(Path(args.boundary))
    output = Path(args.output)
    assets_dir = DEFAULT_ASSETS

    ensure_dir(output)
    assets_dir.mkdir(parents=True, exist_ok=True)

    workflow_path = assets_dir / "workflow.png"
    quality_path = assets_dir / "quality.png"
    timeline_path = assets_dir / "timeline.png"
    map_path = assets_dir / "map.png"

    draw_workflow_image(workflow_path)
    draw_completeness_image(dataset, quality_path)
    draw_event_timeline_image(dataset, timeline_path)
    draw_station_map_image(dataset, boundary, map_path)

    assets = {
        "workflow": workflow_path,
        "quality": quality_path,
        "timeline": timeline_path,
        "map": map_path,
    }

    with PdfPages(output) as pdf:
        render_page_one(pdf, dataset, assets)
        render_page_two(pdf, dataset, assets)
        render_page_three(pdf, dataset, assets)
        render_page_four(pdf, dataset)


if __name__ == "__main__":
    main()
