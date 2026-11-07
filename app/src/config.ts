// Where the generated data lives. In dev these are served from app/public/data
// (the build script copies them there). In production, point VITE_PMTILES_URL
// at the R2 public URL of parcels.pmtiles.
const base = import.meta.env.BASE_URL;

export const PMTILES_URL: string =
  import.meta.env.VITE_PMTILES_URL ?? `${base}data/parcels.pmtiles`;

export const SEARCH_BASE_URL: string =
  import.meta.env.VITE_SEARCH_BASE_URL ?? `${base}data/search`;

export const GLYPHS_URL = `${new URL(base, window.location.href).href}fonts/{fontstack}/{range}.pbf`;

export const USGS_IMAGERY =
  'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}';

// Initial view: all of Texas.
export const INITIAL_VIEW = { center: [-99.3, 31.3] as [number, number], zoom: 5.2 };
