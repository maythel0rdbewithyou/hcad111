# Parcel Earth

A full-screen satellite map, a bit like Google Earth, that draws **red property
boundary lines** over the imagery and labels each parcel with its **owner's name**.
Click a parcel to see the owner, mailing address, parcel and account IDs, acreage,
appraised value and legal description. Search by address, owner or ID to fly to a parcel.

Everything runs at **$0** with **no API keys**. The app is static (no backend), the
imagery is public domain, and the parcel data is public-record county data that is
pre-built into a single [PMTiles](https://protomaps.com/docs/pmtiles) file.

| Piece | What it uses |
|---|---|
| App | Vite + React + TypeScript + [MapLibre GL JS](https://maplibre.org/) |
| Imagery | USGS The National Map `USGSImageryOnly` tiles (public domain, no key), native to z16 and overzoomed past that |
| Parcels | County shapefile + appraisal roll → GDAL/ogr2ogr → tippecanoe → `parcels.pmtiles` |
| Labels | Self-hosted Noto Sans glyphs in `app/public/fonts` (SIL OFL, from protomaps/basemaps-assets) |
| Search | A sharded JSON index built by the pipeline and searched in the browser (no geocoder) |
| Hosting | Cloudflare Pages (app + search index) and Cloudflare R2 (`parcels.pmtiles`), both on free tiers |

## Data: Tarrant County, TX (MVP)

Source: **Tarrant Appraisal District (TAD)**, free public downloads at
<https://www.tad.org/resources/data-downloads>.

| Dataset | URL | Data date |
|---|---|---|
| Parcel polygons (shapefile, NAD83 Texas North Central ftUS, EPSG:2276) | https://www.tad.org/content/gis-data/Parcels.zip | GIS layer `parcels_20260730` (updated **2026-07-30**) |
| Appraisal roll / owner export (pipe-delimited) | https://www.tad.org/content/data-download/PropertyData(Delimited).ZIP | **2026 appraisal year**, file dated 2026-11-07 (downloaded 2026-11-07) |
| Field layout of the roll | https://www.tad.org/content/forms/PropertyData&PropertyLocationLayouts.pdf | — |

Every build writes the exact files and dates it used to `data/out/SOURCES.txt`, and
the app's search manifest carries the same text.

Join results for the build above: 696,473 parcel polygons, of which 689,401 (99.0%)
matched an owner. The rest are mostly road and rail right-of-way. 731,464
real-property accounts (residential `R` and commercial `C`); mineral and business
personal-property accounts are skipped because they have no polygon of their own.
Where several accounts share one polygon (condos, split improvements), the parcel
shows the highest-value account, the account count and the total value, and every
account can still be found by search.

> Owner names, mailing addresses and values are public appraisal records. Check
> them against TAD before relying on them for anything legal or financial.
> Parcel lines are appraisal-district maps, not surveys.

## Run it locally

Prerequisites:
- Node 20+
- For building the data: `curl`, `unzip`, `python3`, GDAL ≥ 3.6 with SpatiaLite
  (`ogr2ogr`, `projinfo`), and tippecanoe ≥ 2.17

```bash
# Ubuntu/Debian
sudo apt-get install -y gdal-bin tippecanoe unzip
```

```bash
# macOS
brew install gdal tippecanoe
```

Then build the data and start the app:

```bash
scripts/build_parcels.sh
```

```bash
cd app && npm install && npm run dev
```

Open http://localhost:5173 and zoom in to Fort Worth or Arlington, or search for
`117 E Belknap`.

- `build_parcels.sh` downloads about 215 MB, takes about 3–5 minutes, and writes
  `data/out/` before copying the results into `app/public/data/` (git-ignored).
- The map URL keeps the view in the hash (`#zoom/lat/lon`), so links can be shared.

## How the pipeline works

`scripts/build_parcels.sh [county ...]` (default: `tarrant`) runs these steps:

1. **Download.** `scripts/counties/<county>.sh` defines `county_build`. Downloads are
   cached in `data/raw/<county>/`; set `FORCE_DOWNLOAD=1` to fetch fresh copies.
2. **Clean the roll.** `tarrant_prep_roll.py` keeps the R and C rows, normalizes
   whitespace and addresses, and writes one row per parcel (`owners.csv`) plus one
   row per account (`accounts_raw.csv`).
3. **Reproject + join (ogr2ogr).** The shapefile is reprojected to lon/lat into a
   GeoPackage with `-makevalid`, the owner CSV is loaded beside it, and a SQL `LEFT
   JOIN` on `TAXPIN = GIS_Link` produces `parcels.geojsons`. `ST_PointOnSurface`
   makes the label points and the search centers.
4. **Tile (tippecanoe).** The pipeline writes one `parcels.pmtiles` with two layers:
   - `parcels`: z14–16 polygons with only the displayed fields (`pin acct owner
     mail situs legal value acres n tval county`), never dropped, and unsimplified
     at z16.
   - `labels`: z15–16 owner-name points.

   MapLibre overzooms z16 tiles for closer views. The Tarrant build is 217 MB, with
   z16 tiles at 7 KB median and z14 tiles at 84 KB median (gzipped).
5. **Search index.** `build_search_index.py` writes `search/manifest.json` plus about
   8,400 small shards (median 10 KB, max 330 KB), keyed by the first characters of
   the owner, address, street name, account # and parcel ID. The browser fetches only
   the shard that matches what was typed. A single JSON for 720k accounts would be
   hundreds of MB.

### Projection and alignment

USGS orthoimagery is referenced to NAD83, and web maps draw it as if it were WGS84.
The pipeline therefore converts parcels to NAD83 lon/lat with **no datum shift**
(`ct_args` in `build_parcels.sh` pins this with `-ct`). Otherwise PROJ may apply a
grid shift of about 1–2 m on machines that have datum grids installed. Spot checks
in Fort Worth, Keller, Mansfield and Hurst show the lines on the curbs, fences and
building edges.

## Add another county

1. Find the county appraisal district's parcel GIS download and its roll/owner
   export, plus the field that links them. For example, Harris County Appraisal District (<https://hcad.org>) publishes both.
2. Create `scripts/counties/<name>.sh` (use `tarrant.sh` as a template) that defines
   `county_build`. It must write these files into `$WORK`:
   - `parcels.geojsons`: polygons in lon/lat with the standard properties above.
     `pin` is required, the rest are optional.
   - `labels.geojsons`: points with `label`, `pin`, `acres`.
   - `accounts.csv`: `pin,acct,owner,situs,lon,lat`.
   - `source.txt`: the URLs and data dates.

   Use `fetch URL DEST` to get cached downloads, and `$(ct_args EPSG:xxxx)` with the
   shapefile's CRS when reprojecting. Write the cleaning step for that county's roll
   format in Python, as `tarrant_prep_roll.py` does.
3. Build all counties into one tileset and one index:

   ```bash
   scripts/build_parcels.sh tarrant harris
   ```

4. Add the source URLs and dates to the Data section of this README.

## Deploy (Cloudflare Pages + R2, free tiers)

Both services need a free Cloudflare account. The free tiers, as of this writing,
cover:
- **R2:** 10 GB storage, 10M reads/month, free egress. One map tile is one read.
- **Pages:** unlimited static requests, 20,000 files per deploy, 25 MiB per file.

### 1. Upload the tiles to R2

1. In the Cloudflare dashboard, go to **R2**, create a bucket (e.g. `parcel-earth`)
   and upload `data/out/parcels.pmtiles`. The dashboard limits uploads to 300 MB.
   For larger files use the CLI:

   ```bash
   npx wrangler r2 object put parcel-earth/parcels.pmtiles --file data/out/parcels.pmtiles --remote
   ```

2. Under **Bucket → Settings → Public access**, enable the `r2.dev` subdomain, or
   connect a custom domain you already have on Cloudflare. The `r2.dev` URL is
   rate-limited and meant for light use; a custom domain also gets edge caching.
3. Under **Bucket → Settings → CORS policy**, paste `deploy/r2-cors.json` with your
   Pages URL filled in. PMTiles needs `Range` requests to be allowed.

### 2. Build and deploy the app to Pages

```bash
cd app
cp .env.example .env.production.local   # set VITE_PMTILES_URL to the R2 URL
npm run build                           # drops parcels.pmtiles from dist/
npx wrangler pages deploy dist --project-name parcel-earth
```

`dist/` holds the app, the fonts and the search index (`dist/data/search`, about
8.4k files). Re-running the deploy uploads only the files that changed. You can
also connect the Git repo in the Pages dashboard, but the search index is
git-ignored, so deploying with `wrangler` from a machine that has run the build is
simpler.

To update the data, re-run `scripts/build_parcels.sh`, re-upload `parcels.pmtiles`
and re-deploy the app.

## Project layout

```
app/                     Vite + React + TS front end
  src/App.tsx            map setup, hover/click, search fly-to
  src/parcelLayers.ts    PMTiles source + red line / fill / label layers
  src/ParcelPanel.tsx    side panel
  src/SearchBox.tsx      search UI;  src/search.ts  shard loading + ranking
  public/fonts/          self-hosted SDF glyphs for labels
scripts/
  build_parcels.sh       pipeline entry point
  counties/tarrant.sh    Tarrant download/clean/join  (+ tarrant_prep_roll.py)
  build_search_index.py  sharded search index
  join_centers.py        attach parcel centers to accounts
  fetch_fonts.sh         re-download the glyphs
deploy/r2-cors.json      CORS policy for the R2 bucket
data/                    raw downloads, work files and outputs (git-ignored)
```
