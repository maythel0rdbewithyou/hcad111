#!/usr/bin/env bash
# Download the SDF glyph ranges MapLibre needs to draw owner-name labels, so the
# app hosts its own fonts (no font service, no key). Fonts: Noto Sans (SIL OFL),
# pre-rendered by github.com/protomaps/basemaps-assets.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
BASE="https://raw.githubusercontent.com/protomaps/basemaps-assets/main/fonts"
for font in "Noto Sans Regular" "Noto Sans Medium"; do
  dir="$ROOT/app/public/fonts/$font"; mkdir -p "$dir"
  # Basic Latin + Latin-1, Latin Extended-A/B, general punctuation
  for range in 0-255 256-511 8192-8447; do
    curl -fsSL --retry 3 -o "$dir/$range.pbf" "$BASE/${font// /%20}/$range.pbf"
  done
done
echo "fonts in app/public/fonts"
