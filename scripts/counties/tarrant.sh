# Tarrant County, TX — Tarrant Appraisal District (TAD). Sourced by build_parcels.sh.
# Must define county_build, which writes into $WORK:
#   parcels.geojsons  polygons (EPSG:4326) with the standard properties
#   labels.geojsons   one point per parcel: owner label + size for priority
#   accounts.csv      pin,acct,owner,situs,lon,lat   (search index input)
#   source.txt        human-readable provenance (URLs + data dates)

COUNTY_NAME="Tarrant County, TX"
TAD_PARCELS_URL="https://www.tad.org/content/gis-data/Parcels.zip"
TAD_ROLL_URL="https://www.tad.org/content/data-download/PropertyData(Delimited).ZIP"

county_build() {
  local raw="$RAW" work="$WORK"
  fetch "$TAD_PARCELS_URL" "$raw/Parcels.zip"
  fetch "$TAD_ROLL_URL" "$raw/PropertyData.zip"

  log "unzipping"
  rm -rf "$raw/x" && mkdir -p "$raw/x"
  unzip -oq "$raw/Parcels.zip" -d "$raw/x"
  unzip -oq "$raw/PropertyData.zip" -d "$raw/x"
  local shp; shp=$(ls "$raw"/x/*.shp | head -1)
  local layer; layer=$(basename "$shp" .shp)
  local roll="$raw/x/PropertyData(Delimited).txt"

  log "cleaning appraisal roll"
  local year
  year=$(python3 -I "$SCRIPTS/counties/tarrant_prep_roll.py" "$roll" "$work/owners.csv" "$work/accounts_raw.csv")

  # Shapefile is NAD83 / Texas North Central (US ft, EPSG:2276) per its .prj.
  # Reproject to EPSG:4326 so it lines up with web-mercator imagery.
  log "reprojecting parcels ($layer) to EPSG:4326"
  rm -f "$work/work.gpkg"
  ogr2ogr -f GPKG "$work/work.gpkg" "$shp" \
    -t_srs EPSG:4326 -nln parcels -nlt PROMOTE_TO_MULTI -makevalid \
    -select TAXPIN,CALCULATED -lco SPATIAL_INDEX=NO
  ogr2ogr -update -f GPKG "$work/work.gpkg" "$work/owners.csv" -nln owners
  ogrinfo -q "$work/work.gpkg" -sql "CREATE INDEX owners_pin ON owners(pin)"
  ogrinfo -q "$work/work.gpkg" -sql "CREATE INDEX parcels_pin ON parcels(TAXPIN)"

  log "joining owners -> parcels"
  rm -f "$work/parcels.geojsons" "$work/labels.geojsons" "$work/centers.csv"
  ogr2ogr -f GeoJSONSeq "$work/parcels.geojsons" "$work/work.gpkg" -dialect SQLite \
    -lco COORDINATE_PRECISION=7 -sql "
    SELECT p.geom,
           p.TAXPIN AS pin, o.acct, o.owner, o.mail, o.situs, o.legal,
           o.value, COALESCE(o.acres, ROUND(p.CALCULATED, 4)) AS acres,
           o.n, CAST(CASE WHEN o.n > 1 THEN o.tval END AS INTEGER) AS tval,
           '$COUNTY_NAME' AS county
    FROM parcels p LEFT JOIN owners o ON o.pin = p.TAXPIN
    WHERE GeometryType(p.geom) LIKE '%POLYGON%'"

  log "label points"
  ogr2ogr -f GeoJSONSeq "$work/labels.geojsons" "$work/work.gpkg" -dialect SQLite \
    -lco COORDINATE_PRECISION=6 -sql "
    SELECT ST_PointOnSurface(p.geom) AS geom,
           CASE WHEN o.n > 1 THEN o.owner || ' (+' || (o.n - 1) || ')' ELSE o.owner END AS label,
           p.TAXPIN AS pin, ROUND(p.CALCULATED, 3) AS acres
    FROM parcels p JOIN owners o ON o.pin = p.TAXPIN
    WHERE o.owner IS NOT NULL AND o.owner <> ''
      AND GeometryType(p.geom) LIKE '%POLYGON%'"

  log "parcel centers for search"
  ogr2ogr -f CSV "$work/centers.csv" "$work/work.gpkg" -dialect SQLite -sql "
    SELECT p.TAXPIN AS pin,
           ROUND(ST_X(ST_PointOnSurface(p.geom)), 5) AS lon,
           ROUND(ST_Y(ST_PointOnSurface(p.geom)), 5) AS lat,
           p.CALCULATED AS area
    FROM parcels p WHERE p.TAXPIN IS NOT NULL"
  python3 -I "$SCRIPTS/join_centers.py" "$work/accounts_raw.csv" "$work/centers.csv" "$work/accounts.csv"

  local gis_date; gis_date=$(ogrinfo -so "$shp" "$layer" | sed -n 's/.*DBF_DATE_LAST_UPDATE=//p')
  cat > "$work/source.txt" <<SRC
$COUNTY_NAME
  Parcels : $TAD_PARCELS_URL  (layer $layer, GIS date $gis_date)
  Owners  : $TAD_ROLL_URL  (appraisal year $year, downloaded $(date -u +%Y-%m-%d))
SRC
}
