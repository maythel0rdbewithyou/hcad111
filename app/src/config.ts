// Where the generated data lives: app/public/data (scripts/build_parcels.sh
// copies it there), deployed with the app.
const base = import.meta.env.BASE_URL;

// Parcel tiles: by default the chunked archive in data/parcels/ (see
// chunkedSource.ts). Set VITE_PMTILES_URL to use a single hosted .pmtiles file
// instead (e.g. on R2 or any host that supports Range requests and CORS).
export const PMTILES_URL: string | undefined = import.meta.env.VITE_PMTILES_URL || undefined;
export const PMTILES_CHUNKS_URL = new URL(`${base}data/parcels`, window.location.href).href;

export const SEARCH_BASE_URL: string =
  import.meta.env.VITE_SEARCH_BASE_URL ?? `${base}data/search`;

export const GLYPHS_URL = `${new URL(base, window.location.href).href}fonts/{fontstack}/{range}.pbf`;

export const USGS_IMAGERY =
  'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}';

// Initial view: all of Texas.
export const INITIAL_VIEW = { center: [-99.3, 31.3] as [number, number], zoom: 5.2 };
