import { useCallback, useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import { Protocol } from 'pmtiles';
import 'maplibre-gl/dist/maplibre-gl.css';
import { baseStyle } from './mapStyle';
import { INITIAL_VIEW } from './config';
import { addParcelLayers, FILL_LAYER, setHover, setSelected, type ParcelProps } from './parcelLayers';
import { ParcelPanel } from './ParcelPanel';

const protocol = new Protocol();
maplibregl.addProtocol('pmtiles', protocol.tile);

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [parcel, setParcel] = useState<ParcelProps | null>(null);
  const [zoom, setZoom] = useState(INITIAL_VIEW.zoom);

  const select = useCallback((p: ParcelProps | null) => {
    setParcel(p);
    if (mapRef.current) setSelected(mapRef.current, p?.pin ?? null);
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
      addParcelLayers(map);
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
      {zoom < 14 && <div className="hint">Zoom in to see property lines</div>}
      {parcel && <ParcelPanel parcel={parcel} onClose={() => select(null)} />}
    </>
  );
}
