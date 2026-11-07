import type { StyleSpecification } from 'maplibre-gl';
import { GLYPHS_URL, USGS_IMAGERY } from './config';

export function baseStyle(): StyleSpecification {
  return {
    version: 8,
    glyphs: GLYPHS_URL,
    sources: {
      usgs: {
        type: 'raster',
        tiles: [USGS_IMAGERY],
        tileSize: 256,
        maxzoom: 16, // USGS imagery tops out here; MapLibre overzooms beyond
        attribution:
          'Imagery: <a href="https://www.usgs.gov/programs/national-geospatial-program/national-map" target="_blank" rel="noopener">USGS The National Map</a>',
      },
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': '#0b1a2a' } },
      { id: 'usgs-imagery', type: 'raster', source: 'usgs', paint: { 'raster-fade-duration': 150 } },
    ],
  };
}
