#!/usr/bin/env bash
# destripar-video.sh — baja un video y extrae frames para que Claude lo ANALICE VISUALMENTE
#
# Uso:
#   bash destripar-video.sh <videoUrl> <id> [segundos-entre-frames]
#
# El <videoUrl> sale del scraper de API (campo "videoUrl" en Apify instagram-reel-scraper)
# o de un barrido previo. Para YouTube no hace falta scraper: usar
#   yt-dlp -o video.mp4 <url>
# y saltar directo a la extracción de frames.
#
# Los frames quedan en outputs/teardowns/.frames/<id>/ para que Claude los lea con Read.
#
# Flujo completo (lo ejecuta el agente, no el humano):
#   1. Scraper de API con transcript → videoUrl + transcript
#   2. Este script → frames JPG
#   3. Claude lee los frames (Read) + el transcript → teardown en outputs/teardowns/
#
# ⚠️ Las URLs del CDN CADUCAN (horas a un día). Bajar el video en la MISMA sesión del scrape.
#
# Requisitos: ffmpeg + ffprobe + curl
# Ver .agent/skills/destripar-video-de-competencia/SKILL.md

set -euo pipefail

VIDEO_URL="${1:?Falta el videoUrl}"
ID="${2:?Falta el id/shortcode}"
INTERVAL="${3:-2}"   # 1 frame cada N segundos (default 2; usar 1 para videos <30s)

for bin in curl ffmpeg ffprobe; do
  command -v "$bin" >/dev/null 2>&1 || { echo "✗ Falta '$bin' en el PATH."; exit 1; }
done

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
OUTDIR="$ROOT/outputs/teardowns/.frames/$ID"
mkdir -p "$OUTDIR"

echo "→ Bajando video ($ID)..."
if ! curl -fsSL -o "$OUTDIR/$ID.mp4" "$VIDEO_URL"; then
  echo "✗ No se pudo bajar. Causa más probable: la URL del CDN ya caducó."
  echo "  Re-scrapear la fuente y reintentar en la misma sesión."
  exit 1
fi

DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUTDIR/$ID.mp4" | cut -d. -f1)
echo "→ Duración medida: ${DUR}s  ← dato duro para el teardown, no estimar"
echo "→ Extrayendo 1 frame cada ${INTERVAL}s..."

rm -f "$OUTDIR"/frame_*.jpg
ffmpeg -hide_banner -loglevel error -i "$OUTDIR/$ID.mp4" \
  -vf "fps=1/$INTERVAL,scale=480:-1" -q:v 3 "$OUTDIR/frame_%02d.jpg"

N=$(find "$OUTDIR" -name 'frame_*.jpg' | wc -l | tr -d ' ')
echo "→ Listo: $N frames en $OUTDIR"
echo "  Claude ahora lee los frames EN ORDEN (Read) + el transcript y arma el teardown."
echo "  Recordá: outputs/teardowns/.frames/ va en .gitignore."
