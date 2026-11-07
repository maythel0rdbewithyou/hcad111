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
| Hosting | Cloudflare Pages free plan: app, search index and chunked parcel tiles |

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
  `data/out/` before copying the results (tiles split into chunks) into
  `app/public/data/` (git-ignored).
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

   MapLibre overzooms z16 tiles for closer views. `split_pmtiles.py` then cuts the
   archive into 8 MiB chunks for static hosting. The Tarrant build is 217 MB, with
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

## Deploy (Cloudflare Pages, free, no payment method)

Everything goes on **Cloudflare Pages**: the app, the fonts, the search index and the
parcel tiles. Pages caps each file at 25 MiB, so the pipeline splits
`parcels.pmtiles` into 8 MiB chunks (`app/public/data/parcels/000.bin`…, plus
`manifest.json`), and `app/src/chunkedSource.ts` reads them with HTTP Range
requests as if they were one archive. A Tarrant deploy is about 8,450 files and
530 MB. The Pages free plan allows 20,000 files per deploy.

### GitHub Actions (recommended)

`.github/workflows/deploy.yml` rebuilds the data from TAD, builds the app and
deploys it to Pages. It runs monthly and on demand (**Actions → Build data and
deploy → Run workflow**). One-time setup is in the repo's **Settings → Secrets and
variables → Actions**:

- **Secret** `CLOUDFLARE_API_TOKEN` (or `KEY`): a Cloudflare API token with
  *Account → Cloudflare Pages → Edit*.
- **Variable** `CLOUDFLARE_ACCOUNT_ID`: your Cloudflare account ID.
- **Variable** `PAGES_PROJECT` (optional, default `parcel-earth`).

The Pages project must already exist. Create it in the dashboard, or with:

```bash
npx wrangler pages project create parcel-earth --production-branch main
```

### From your own machine

```bash
scripts/build_parcels.sh
```

```bash
cd app && npm run build && npx wrangler pages deploy dist --project-name parcel-earth
```

### Optional: a single tiles file elsewhere

If you'd rather host one `parcels.pmtiles` on a host that supports Range requests
and CORS (e.g. R2 or S3), build with `VITE_PMTILES_URL=https://…/parcels.pmtiles`.
For R2, `deploy/r2-cors.json` has the CORS policy.

## Project layout

```
app/                     Vite + React + TS front end
  src/App.tsx            map setup, hover/click, search fly-to
  src/parcelLayers.ts    PMTiles source + red line / fill / label layers
  src/ParcelPanel.tsx    side panel
  src/chunkedSource.ts   reads the chunked pmtiles archive via Range requests
  src/SearchBox.tsx      search UI;  src/search.ts  shard loading + ranking
  public/fonts/          self-hosted SDF glyphs for labels
scripts/
  build_parcels.sh       pipeline entry point
  counties/tarrant.sh    Tarrant download/clean/join  (+ tarrant_prep_roll.py)
  build_search_index.py  sharded search index
  join_centers.py        attach parcel centers to accounts
  split_pmtiles.py       split parcels.pmtiles into chunks for Pages
  fetch_fonts.sh         re-download the glyphs
deploy/r2-cors.json      CORS policy if you host a single pmtiles file on R2 instead
data/                    raw downloads, work files and outputs (git-ignored)
```
