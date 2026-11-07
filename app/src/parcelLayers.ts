import type { LayerSpecification, Map as MlMap } from 'maplibre-gl';


export const PARCEL_SOURCE = 'parcels';
export const FILL_LAYER = 'parcels-fill';
const NONE = ['==', ['get', 'pin'], '__none__'] as const;

/** Properties baked into each parcel feature by scripts/build_parcels.sh */
export interface ParcelProps {
  pin: string;
  acct?: string;
  owner?: string;
  mail?: string;
  situs?: string;
  legal?: string;
  value?: number;
  acres?: number | string;
  n?: number;
  tval?: number;
  county?: string;
}

const layers: LayerSpecification[] = [
  {
    // Invisible fill so the whole parcel is clickable / hoverable.
    id: FILL_LAYER,
    type: 'fill',
    source: PARCEL_SOURCE,
    'source-layer': 'parcels',
    minzoom: 14,
    paint: { 'fill-color': '#ff0000', 'fill-opacity': 0 },
  },
  {
    id: 'parcels-hover',
    type: 'fill',
    source: PARCEL_SOURCE,
    'source-layer': 'parcels',
    minzoom: 14,
    filter: NONE as never,
    paint: { 'fill-color': '#ffd60a', 'fill-opacity': 0.22 },
  },
  {
    id: 'parcels-line',
    type: 'line',
    source: PARCEL_SOURCE,
    'source-layer': 'parcels',
    minzoom: 14,
    layout: { 'line-join': 'round' },
    paint: {
      'line-color': '#ff2b2b',
      'line-width': ['interpolate', ['linear'], ['zoom'], 14, 1, 16, 1.5, 18, 2.25, 20, 3],
      'line-opacity': ['interpolate', ['linear'], ['zoom'], 14, 0.7, 15, 0.95],
    },
  },
  {
    id: 'parcels-selected',
    type: 'line',
    source: PARCEL_SOURCE,
    'source-layer': 'parcels',
    minzoom: 14,
    filter: NONE as never,
    layout: { 'line-join': 'round' },
    paint: {
      'line-color': '#ffd60a',
      'line-width': ['interpolate', ['linear'], ['zoom'], 14, 2.5, 18, 4.5],
    },
  },
  {
    id: 'parcels-labels',
    type: 'symbol',
    source: PARCEL_SOURCE,
    'source-layer': 'labels',
    minzoom: 16,
    layout: {
      'text-field': ['get', 'label'],
      'text-font': ['Noto Sans Medium'],
      'text-size': ['interpolate', ['linear'], ['zoom'], 16, 10, 18, 12.5, 20, 15],
      'text-max-width': 7,
      'text-line-height': 1.1,
      'text-padding': 3,
      // Big parcels win label collisions; small neighbours are skipped.
      'symbol-sort-key': ['-', 0, ['to-number', ['get', 'acres'], 0]],
      'text-allow-overlap': false,
      'text-ignore-placement': false,
    },
    paint: {
      'text-color': '#ffffff',
      'text-halo-color': 'rgba(0,0,0,0.85)',
      'text-halo-width': 1.4,
      'text-halo-blur': 0.3,
    },
  },
];

/** tilesKey: the PMTiles archive key registered with the pmtiles protocol. */
export function addParcelLayers(map: MlMap, tilesKey: string) {
  map.addSource(PARCEL_SOURCE, {
    type: 'vector',
    url: `pmtiles://${tilesKey}`,
  });
  for (const l of layers) map.addLayer(l);
}

export function setHover(map: MlMap, pin: string | null) {
  map.setFilter('parcels-hover', pin ? ['==', ['get', 'pin'], pin] : (NONE as never));
}

export function setSelected(map: MlMap, pin: string | null) {
  map.setFilter('parcels-selected', pin ? ['==', ['get', 'pin'], pin] : (NONE as never));
}
