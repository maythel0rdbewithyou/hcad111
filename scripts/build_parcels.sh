#!/usr/bin/env bash
# Download, clean, join and tile county parcel data.
#
#   scripts/build_parcels.sh                # default county list (tarrant)
#   scripts/build_parcels.sh tarrant other  # several counties into one pmtiles
#
# Outputs:
#   data/out/parcels.pmtiles     vector tiles: layers "parcels" (z14-16) + "labels" (z15-16)
#   data/out/search/*.json       sharded search index (+ index.json manifest)
#   data/out/SOURCES.txt         where the data came from, and its dates
# and copies them into app/public/data/ for local dev.
#
# Requires: curl, unzip, python3, GDAL >= 3.6 (ogr2ogr, with SpatiaLite), tippecanoe >= 2.17.
# Set FORCE_DOWNLOAD=1 to re-download source files that already exist.
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
SCRIPTS="$ROOT/scripts"
OUT="$ROOT/data/out"
COUNTIES=("${@:-tarrant}")

log() { printf '\033[1;31m[%s]\033[0m %s\n' "${CURRENT:-build}" "$*" >&2; }
fetch() { # url dest
  if [[ -s "$2" && -z "${FORCE_DOWNLOAD:-}" ]]; then log "using cached $(basename "$2")"; return; fi
  log "downloading $1"
  curl -fL --retry 4 --retry-delay 2 -o "$2.part" "$1" && mv "$2.part" "$2"
}
for tool in curl unzip python3 ogr2ogr tippecanoe; do
  command -v "$tool" >/dev/null || { echo "missing required tool: $tool" >&2; exit 1; }
done

mkdir -p "$OUT"
parcel_layers=() label_layers=() account_files=() sources=()
for CURRENT in "${COUNTIES[@]}"; do
  RAW="$ROOT/data/raw/$CURRENT" WORK="$ROOT/data/work/$CURRENT"
  mkdir -p "$RAW" "$WORK"
  unset -f county_build
  # shellcheck source=/dev/null
  source "$SCRIPTS/counties/$CURRENT.sh"
  county_build
  parcel_layers+=(-L "parcels:$WORK/parcels.geojsons")
  label_layers+=(-L "labels:$WORK/labels.geojsons")
  account_files+=("$WORK/accounts.csv")
  sources+=("$WORK/source.txt")
done
CURRENT=tiles

cat "${sources[@]}" > "$OUT/SOURCES.txt"
log "tippecanoe -> parcels.pmtiles"
# z14-16 only: lines are hidden below z14, MapLibre overzooms past z16.
# Parcels must never be dropped, and z16 keeps full detail (no simplification).
# Label points are only kept from z15 up.
tippecanoe -o "$OUT/parcels.pmtiles" --force --quiet \
  -Z14 -z16 \
  "${parcel_layers[@]}" "${label_layers[@]}" \
  -j '{"labels":[">=","$zoom",15]}' \
  --no-feature-limit --no-tile-size-limit \
  --no-simplification-of-shared-nodes --simplify-only-low-zooms --no-tiny-polygon-reduction \
  --attribution='Parcels: county appraisal districts' \
  --name='Parcels' --description="$(tr '\n' ' ' < "$OUT/SOURCES.txt")"

log "search index"
python3 -I - "$OUT/search_meta.json" "$OUT/SOURCES.txt" <<'PY'
import json, sys, datetime
json.dump({"built": datetime.date.today().isoformat(), "sources": open(sys.argv[2]).read()}, open(sys.argv[1], "w"))
PY
python3 -I "$SCRIPTS/build_search_index.py" "$OUT/search" "$OUT/search_meta.json" "${account_files[@]}"

log "copying into app/public/data for local dev"
mkdir -p "$ROOT/app/public/data"
cp "$OUT/parcels.pmtiles" "$ROOT/app/public/data/parcels.pmtiles"
rm -rf "$ROOT/app/public/data/search" && cp -r "$OUT/search" "$ROOT/app/public/data/search"

ls -lh "$OUT/parcels.pmtiles" >&2
cat "$OUT/SOURCES.txt" >&2
log "done"
