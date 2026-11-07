import { useCallback, useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import { PMTiles, Protocol } from 'pmtiles';
import 'maplibre-gl/dist/maplibre-gl.css';
// Emit MapLibre's (self-contained) worker as an asset and point MapLibre at it;
// its default lookup relative to its own module breaks once bundled.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { baseStyle } from './mapStyle';
import { INITIAL_VIEW, PMTILES_CHUNKS_URL, PMTILES_URL } from './config';
import { ChunkedSource } from './chunkedSource';
import { addParcelLayers, FILL_LAYER, PARCEL_SOURCE, setHover, setSelected, type ParcelProps } from './parcelLayers';
import { ParcelPanel } from './ParcelPanel';
import { SearchBox } from './SearchBox';
import type { SearchHit } from './search';

maplibregl.setWorkerUrl(workerUrl);
const protocol = new Protocol();
maplibregl.addProtocol('pmtiles', protocol.tile);
const tiles = new PMTiles(PMTILES_URL ?? new ChunkedSource(PMTILES_CHUNKS_URL));
protocol.add(tiles);
const TILES_KEY = tiles.source.getKey();

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [parcel, setParcel] = useState<ParcelProps | null>(null);
  const [zoom, setZoom] = useState(INITIAL_VIEW.zoom);

  const select = useCallback((p: ParcelProps | null) => {
    setParcel(p);
    if (mapRef.current) setSelected(mapRef.current, p?.pin ?? null);
  }, []);

  /** Fly to a search result, then open its parcel once the tiles are in. */
  const flyToHit = useCallback((hit: SearchHit) => {
    const map = mapRef.current;
    if (!map) return;
    setParcel(null);
    setSelected(map, hit.pin);
    map.flyTo({ center: [hit.lon, hit.lat], zoom: Math.max(map.getZoom(), 18), speed: 1.6, essential: true });
    map.once('idle', () => {
      const f = map.querySourceFeatures(PARCEL_SOURCE, {
        sourceLayer: 'parcels',
        filter: ['==', ['get', 'pin'], hit.pin],
      })[0];
      // Several accounts can share a parcel; show the one that was searched.
      const props = f ? (f.properties as ParcelProps) : { pin: hit.pin };
      setParcel(props.acct === hit.acct ? props : { ...props, acct: hit.acct, owner: hit.owner, situs: hit.situs });
    });
  }, []);

  useEffect(() => {
    const map = new maplibregl.Map({
      container: containerRef.current!,
      style: baseStyle(),
      center: INITIAL_VIEW.center,
      zoom: INITIAL_VIEW.zoom,
      maxZoom: 21,
      hash: true,
      attributionControl: { compact: false },
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');
    map.addControl(new maplibregl.GeolocateControl({}), 'bottom-right');
    map.addControl(new maplibregl.ScaleControl({ unit: 'imperial' }), 'bottom-left');

    map.on('load', () => {
      addParcelLayers(map, TILES_KEY);
      setZoom(map.getZoom());
    });
    map.on('zoomend', () => setZoom(map.getZoom()));

    // Hover highlight (mouse only — touch devices just tap).
    let hovered: string | null = null;
    map.on('mousemove', FILL_LAYER, (e) => {
      const pin = (e.features?.[0]?.properties as ParcelProps | undefined)?.pin ?? null;
      if (pin !== hovered) {
        hovered = pin;
        setHover(map, pin);
      }
      map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', FILL_LAYER, () => {
      hovered = null;
      setHover(map, null);
      map.getCanvas().style.cursor = '';
    });

    map.on('click', (e) => {
      const f = map.queryRenderedFeatures(e.point, { layers: [FILL_LAYER] })[0];
      select(f ? (f.properties as ParcelProps) : null);
    });

    (window as unknown as { map: maplibregl.Map }).map = map; // handy for debugging
    return () => map.remove();
  }, [select]);

  return (
    <>
      <div ref={containerRef} className="map" />
      <SearchBox onPick={flyToHit} />
      {zoom < 14 && <div className="hint">Zoom in to see property lines</div>}
      {parcel && <ParcelPanel parcel={parcel} onClose={() => select(null)} />}
    </>
  );
}
