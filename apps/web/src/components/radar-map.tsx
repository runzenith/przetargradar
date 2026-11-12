import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet.markercluster';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import { LocateFixed, Maximize2, Minus, Plus } from 'lucide-react';
export type MapPoint = {
  name: string;
  lat: number;
  lng: number;
  region: string;
  city: string;
  buyerRegion: string | null;
  count: number;
};
export function RadarMap({
  points,
  onSelect,
  selected,
  compact = false,
}: {
  points: MapPoint[];
  onSelect?: (p: MapPoint) => void;
  selected?: MapPoint | null;
  compact?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const instance = useRef<L.Map | null>(null);
  const select = useRef(onSelect);
  select.current = onSelect;
  const [tileError, setTileError] = useState(false);
  useEffect(() => {
    if (!host.current) return;
    const map = L.map(host.current, {
      zoomControl: false,
      scrollWheelZoom: !compact,
      fadeAnimation: false,
      minZoom: 5,
      maxZoom: 16,
    }).setView([52.05, 19.25], 6);
    instance.current = map;
    const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · Miejscowości: <a href="https://www.geonames.org/">GeoNames</a>',
    }).addTo(map);
    tiles.on('tileerror', () => setTileError(true));
    L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(map);
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(host.current);
    return () => {
      observer.disconnect();
      map.remove();
      instance.current = null;
    };
  }, [compact]);
  useEffect(() => {
    const map = instance.current;
    if (!map) return;
    const group = L.markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 48,
      iconCreateFunction: (cluster) => {
        const count = cluster
          .getAllChildMarkers()
          .reduce(
            (n, m) => n + Number((m.options as { tenderCount?: number }).tenderCount ?? 1),
            0,
          );
        return L.divIcon({
          className: 'radar-cluster',
          html: `<span>${count}</span>`,
          iconSize: [48, 48],
        });
      },
    });
    for (const p of points) {
      const marker = L.marker([p.lat, p.lng], {
        title: `${p.name}: ${p.count} zamówień`,
        keyboard: true,
        icon: L.divIcon({
          className: 'radar-pin',
          html: `<span>${p.count}</span>`,
          iconSize: [38, 38],
          iconAnchor: [19, 19],
        }),
        ...{ tenderCount: p.count },
      });
      const label = document.createElement('span');
      label.textContent = `${p.name} · ${p.count} zamówień`;
      marker.bindTooltip(label, { direction: 'top', offset: [0, -18] });
      marker.on('click', () => {
        select.current?.(p);
        map.flyTo([p.lat, p.lng], Math.max(map.getZoom(), 10), { duration: 0.7 });
      });
      group.addLayer(marker);
    }
    map.addLayer(group);
    if (points.length && compact)
      map.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng] as L.LatLngTuple)), {
        maxZoom: 11,
        padding: [45, 45],
      });
    return () => {
      map.removeLayer(group);
    };
  }, [points, compact]);
  useEffect(() => {
    if (selected) instance.current?.flyTo([selected.lat, selected.lng], 10, { duration: 0.7 });
  }, [selected]);
  return (
    <div className={'radar-map-shell ' + (compact ? 'compact-map' : '')}>
      <div className="radar-map-canvas" ref={host} aria-label="Interaktywna mapa zamówień" />
      {!compact && (
        <div className="map-brand">
          <span className="live-pulse" /> RADAR / POLSKA <small>Eksploruj możliwości</small>
        </div>
      )}
      <div className="map-tools">
        <button
          title="Przybliż"
          aria-label="Przybliż mapę"
          onClick={() => instance.current?.zoomIn()}
        >
          <Plus size={18} />
        </button>
        <button title="Oddal" aria-label="Oddal mapę" onClick={() => instance.current?.zoomOut()}>
          <Minus size={18} />
        </button>
        <button
          title="Pokaż wszystkie lokalizacje"
          aria-label="Pokaż wszystkie lokalizacje"
          onClick={() => {
            if (points.length)
              instance.current?.fitBounds(
                L.latLngBounds(points.map((p) => [p.lat, p.lng] as L.LatLngTuple)),
                { padding: [50, 50], maxZoom: 11 },
              );
            else instance.current?.setView([52.05, 19.25], 6);
          }}
        >
          <LocateFixed size={18} />
        </button>
        {!compact && (
          <button
            title="Pełny ekran"
            aria-label="Pełny ekran mapy"
            onClick={() => {
              const shell = host.current?.parentElement;
              if (document.fullscreenElement) void document.exitFullscreen();
              else void shell?.requestFullscreen?.();
            }}
          >
            <Maximize2 size={17} />
          </button>
        )}
      </div>
      {tileError && (
        <div className="map-tile-error" role="status">
          Podkład mapy jest chwilowo niedostępny. Punkty i lista zamówień pozostają dostępne.
        </div>
      )}
    </div>
  );
}
