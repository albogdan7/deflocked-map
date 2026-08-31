import { useEffect, useRef } from "react";
import { MapContainer, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import type { Waypoint, CameraFeature, RouteGeoJson, LoopOption } from "../types";

(L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl = undefined;
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

export const LOOP_COLORS = [
  "#5b8bff",
  "#ff9f43",
  "#26de81",
  "#ff6b6b",
  "#a78bfa",
  "#22d3ee",
  "#fbbf24",
  "#f471b5",
];

// ── Camera FOV cone ──────────────────────────────────────────────────────────
function buildCone(lat: number, lon: number, bearingDeg: number, fovDeg = 70, rangeM = 75): [number, number][] {
  const R = 6371000;
  const latR = (lat * Math.PI) / 180;
  const leftDeg = (bearingDeg - fovDeg / 2 + 360) % 360;
  const steps = 10;
  const pts: [number, number][] = [[lat, lon]];
  for (let i = 0; i <= steps; i++) {
    const b = ((leftDeg + (fovDeg / steps) * i) * Math.PI) / 180;
    const dlat = ((rangeM / R) * Math.cos(b) * 180) / Math.PI;
    const dlon = ((rangeM / R) * Math.sin(b) * 180) / Math.PI / Math.cos(latR);
    pts.push([lat + dlat, lon + dlon]);
  }
  pts.push([lat, lon]);
  return pts;
}

// ── Camera layer ─────────────────────────────────────────────────────────────
const CAMERA_ICON = L.divIcon({
  className: "",
  html: '<div class="camera-dot"></div>',
  iconSize: [8, 8],
  iconAnchor: [4, 4],
});
const CAMERA_ON_ROUTE_ICON = L.divIcon({
  className: "",
  html: '<div class="camera-dot on-route"></div>',
  iconSize: [10, 10],
  iconAnchor: [5, 5],
});

interface CameraLayerProps {
  features: CameraFeature[];
  onRoute: boolean;
}

function CameraLayer({ features, onRoute }: CameraLayerProps) {
  const map = useMap();
  const layerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!layerRef.current) layerRef.current = L.layerGroup().addTo(map);
    layerRef.current.clearLayers();

    const dotColor = onRoute ? "#ffb84d" : "#ff4f4f";
    const coneOpacity = onRoute ? 0.25 : 0.18;

    features.forEach((f) => {
      const [lon, lat] = f.geometry.coordinates;
      const dir = f.properties?.direction;
      const bearing = dir != null && !isNaN(parseFloat(String(dir))) ? parseFloat(String(dir)) : null;

      if (bearing !== null && layerRef.current) {
        L.polygon(buildCone(lat, lon, bearing), {
          color: dotColor, fillColor: dotColor,
          fillOpacity: coneOpacity, weight: 0, interactive: false,
        }).addTo(layerRef.current);
      }

      if (layerRef.current) {
        L.marker([lat, lon], { icon: onRoute ? CAMERA_ON_ROUTE_ICON : CAMERA_ICON })
          .bindPopup(
            `<b>${f.properties?.operator || "ALPR Camera"}</b>` +
            (bearing !== null ? `<br>Direction: ${Math.round(bearing)}°` : "") +
            `<br>Zone: ${f.properties?.surveillanceZone || "unknown"}`
          )
          .addTo(layerRef.current);
      }
    });

    return () => { layerRef.current?.clearLayers(); };
  }, [features, onRoute, map]);

  return null;
}

// ── Waypoint markers ──────────────────────────────────────────────────────────
function makeWpIcon(type: string) {
  return L.divIcon({
    className: "",
    html: `<div class="wp-dot wp-${type}"></div>`,
    iconSize: type === "mid" ? [12, 12] : [16, 16],
    iconAnchor: type === "mid" ? [6, 6] : [8, 8],
  });
}

interface WaypointLayerProps {
  waypoints: Waypoint[];
  onUpdate: (id: number, lat: number, lon: number) => void;
  onRemove: (id: number) => void;
}

function WaypointLayer({ waypoints, onUpdate, onRemove }: WaypointLayerProps) {
  const map = useMap();
  const stateRef = useRef<{ markers: Record<string, L.Marker>; dragging: Set<string> }>({
    markers: {},
    dragging: new Set(),
  });

  useEffect(() => {
    const { markers, dragging } = stateRef.current;
    const currentIds = new Set(waypoints.map((wp) => String(wp.id)));

    for (const id of Object.keys(markers)) {
      if (!currentIds.has(id)) {
        map.removeLayer(markers[id]);
        delete markers[id];
        dragging.delete(id);
      }
    }

    waypoints.forEach((wp, idx) => {
      const isStart = idx === 0;
      const isEnd = idx === waypoints.length - 1 && idx > 0;
      const type = isStart ? "start" : isEnd ? "end" : "mid";
      const icon = makeWpIcon(type);
      const id = String(wp.id);

      if (markers[id]) {
        if (!dragging.has(id)) markers[id].setLatLng([wp.lat, wp.lon]);
        markers[id].setIcon(icon);
      } else {
        const m = L.marker([wp.lat, wp.lon], { icon, draggable: true });
        m.on("dragstart", () => dragging.add(id));
        m.on("dragend", () => {
          dragging.delete(id);
          const { lat, lng } = m.getLatLng();
          onUpdate(wp.id, lat, lng);
        });
        m.on("contextmenu", (e) => {
          L.DomEvent.stopPropagation(e.originalEvent);
          L.DomEvent.preventDefault(e.originalEvent);
          onRemove(wp.id);
        });
        m.addTo(map);
        markers[id] = m;
      }
    });
  }, [waypoints, onUpdate, onRemove]);

  useEffect(() => {
    const { markers } = stateRef.current;
    return () => {
      Object.values(markers).forEach((m) => map.removeLayer(m));
      stateRef.current.markers = {};
    };
  }, [map]);

  return null;
}

// ── Route line drag helpers ───────────────────────────────────────────────────
function snapToRouteLL(latlng: L.LatLng, coords: [number, number][]): { lat: number; lng: number } {
  if (!coords.length) return latlng;
  const px = latlng.lng, py = latlng.lat;
  const cosLat = Math.cos(py * Math.PI / 180);
  let bestD2 = Infinity, bestLat = coords[0][0], bestLng = coords[0][1];
  for (let i = 0; i < coords.length - 1; i++) {
    const [ay, ax] = coords[i], [by, bx] = coords[i + 1];
    const dx = (bx - ax) * cosLat, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * cosLat * dx + (py - ay) * dy) / len2)) : 0;
    const cx = ax + t * (bx - ax), cy = ay + t * (by - ay);
    const d2 = ((px - cx) * cosLat) ** 2 + (py - cy) ** 2;
    if (d2 < bestD2) { bestD2 = d2; bestLat = cy; bestLng = cx; }
  }
  return { lat: bestLat, lng: bestLng };
}

function distToSegLL(py: number, px: number, ay: number, ax: number, by: number, bx: number): number {
  const cosLat = Math.cos(py * Math.PI / 180);
  const dx = (bx - ax) * cosLat, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * cosLat * dx + (py - ay) * dy) / len2)) : 0;
  return Math.hypot((py - (ay + t * (by - ay))), (px - (ax + t * (bx - ax))) * cosLat);
}

function findInsertIdx(lat: number, lon: number, waypoints: Waypoint[]): number {
  if (waypoints.length <= 1) return 1;
  let bestDist = Infinity, bestIdx = 1;
  for (let i = 0; i < waypoints.length - 1; i++) {
    const d = distToSegLL(lat, lon, waypoints[i].lat, waypoints[i].lon, waypoints[i + 1].lat, waypoints[i + 1].lon);
    if (d < bestDist) { bestDist = d; bestIdx = i + 1; }
  }
  return bestIdx;
}

const GHOST_ICON = L.divIcon({
  className: "",
  html: '<div class="route-ghost-dot"></div>',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});
const DRAG_ICON = L.divIcon({
  className: "",
  html: '<div class="route-drag-dot"></div>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

// ── Active route line with drag-to-insert ─────────────────────────────────────
interface RouteLineProps {
  route: RouteGeoJson | null;
  waypoints: Waypoint[];
  onInsertWaypoint: (idx: number, lat: number, lon: number) => void;
  color?: string;
}

function RouteLine({ route, waypoints, onInsertWaypoint, color = "#5b8bff" }: RouteLineProps) {
  const map = useMap();
  const polylineRef = useRef<L.Polyline | null>(null);
  const ghostRef = useRef<L.Marker | null>(null);
  const thinCoordsRef = useRef<[number, number][]>([]);
  const waypointsRef = useRef(waypoints);
  const onInsertRef = useRef(onInsertWaypoint);

  useEffect(() => { waypointsRef.current = waypoints; }, [waypoints]);
  useEffect(() => { onInsertRef.current = onInsertWaypoint; }, [onInsertWaypoint]);
  useEffect(() => { polylineRef.current?.setStyle({ color }); }, [color]);

  useEffect(() => {
    const polyline = L.polyline([], {
      color: "#5b8bff", weight: 5, opacity: 0.9, lineJoin: "round", lineCap: "round",
    }).addTo(map);
    polylineRef.current = polyline;

    const ghost = L.marker([0, 0], { icon: GHOST_ICON, interactive: false, opacity: 0, zIndexOffset: 500 }).addTo(map);
    ghostRef.current = ghost;

    let isDragging = false;
    let tempMarker: L.Marker | null = null;
    let curLat: number | null = null, curLon: number | null = null;
    let initLat: number | null = null, initLon: number | null = null;
    let snapRaf: number | null = null, dragRaf: number | null = null;

    polyline.on("mousemove", (e) => {
      if (isDragging) return;
      if (snapRaf) return;
      const latlng = e.latlng;
      snapRaf = requestAnimationFrame(() => {
        snapRaf = null;
        const coords = thinCoordsRef.current;
        if (!coords.length) return;
        const snapped = snapToRouteLL(latlng, coords);
        ghost.setLatLng([snapped.lat, snapped.lng]);
        ghost.setOpacity(1);
        map.getContainer().classList.add("route-hover");
      });
    });

    polyline.on("mouseout", () => {
      if (snapRaf) { cancelAnimationFrame(snapRaf); snapRaf = null; }
      if (!isDragging) {
        ghost.setOpacity(0);
        map.getContainer().classList.remove("route-hover");
      }
    });

    polyline.on("click", (e) => L.DomEvent.stopPropagation(e));

    polyline.on("mousedown", (e) => {
      if (e.originalEvent.button !== 0) return;
      L.DomEvent.stopPropagation(e.originalEvent);
      L.DomEvent.preventDefault(e.originalEvent);

      isDragging = true;
      curLat = initLat = e.latlng.lat;
      curLon = initLon = e.latlng.lng;

      if (snapRaf) { cancelAnimationFrame(snapRaf); snapRaf = null; }
      ghost.setOpacity(0);
      map.dragging.disable();
      map.getContainer().classList.remove("route-hover");
      map.getContainer().classList.add("route-drag");

      tempMarker = L.marker([e.latlng.lat, e.latlng.lng], {
        icon: DRAG_ICON, interactive: false, zIndexOffset: 1000,
      }).addTo(map);

      const container = map.getContainer();

      function onMove(ev: MouseEvent) {
        if (dragRaf) return;
        const cx = ev.clientX, cy = ev.clientY;
        dragRaf = requestAnimationFrame(() => {
          dragRaf = null;
          const rect = container.getBoundingClientRect();
          const ll = map.containerPointToLatLng(L.point(cx - rect.left, cy - rect.top));
          tempMarker!.setLatLng(ll);
          curLat = ll.lat;
          curLon = ll.lng;
        });
      }

      function onUp() {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        if (dragRaf) { cancelAnimationFrame(dragRaf); dragRaf = null; }
        map.dragging.enable();
        map.getContainer().classList.remove("route-drag");
        isDragging = false;
        if (tempMarker) { map.removeLayer(tempMarker); tempMarker = null; }

        if (curLat !== null && curLon !== null && initLat !== null && initLon !== null) {
          const moved = Math.abs(curLat - initLat) + Math.abs(curLon - initLon);
          if (moved > 0.00005) {
            const idx = findInsertIdx(curLat, curLon, waypointsRef.current);
            onInsertRef.current(idx, curLat, curLon);
          }
        }
        curLat = curLon = initLat = initLon = null;
      }

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });

    return () => {
      if (snapRaf) cancelAnimationFrame(snapRaf);
      if (dragRaf) cancelAnimationFrame(dragRaf);
      map.removeLayer(polyline);
      map.removeLayer(ghost);
      polylineRef.current = null;
      ghostRef.current = null;
    };
  }, [map]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const pl = polylineRef.current;
    if (!pl) return;
    if (!route) {
      pl.setLatLngs([]);
      thinCoordsRef.current = [];
      ghostRef.current?.setOpacity(0);
      return;
    }
    const coords: [number, number][] = route.geometry.coordinates.map(([lon, lat]) => [lat, lon]);
    pl.setLatLngs(coords);
    const step = Math.max(1, Math.floor(coords.length / 200));
    thinCoordsRef.current = coords.filter((_, i) => i % step === 0 || i === coords.length - 1);
  }, [route]);

  return null;
}

// ── Inactive loop option lines ────────────────────────────────────────────────
interface InactiveRoutesProps {
  loopOptions: LoopOption[];
  activeLoopIdx: number;
  onSelectLoop: (idx: number) => void;
}

function InactiveRoutes({ loopOptions, activeLoopIdx, onSelectLoop }: InactiveRoutesProps) {
  const map = useMap();
  const onSelectRef = useRef(onSelectLoop);
  useEffect(() => { onSelectRef.current = onSelectLoop; }, [onSelectLoop]);

  useEffect(() => {
    if (!loopOptions.length) return;
    const polylines: L.Polyline[] = [];
    loopOptions.forEach((opt, idx) => {
      if (idx === activeLoopIdx) return;
      const coords: [number, number][] = opt.route.geometry.coordinates.map(([lon, lat]) => [lat, lon]);
      const color = LOOP_COLORS[idx % LOOP_COLORS.length];
      const pl = L.polyline(coords, {
        color, weight: 4, opacity: 0.5, dashArray: "10 7", lineJoin: "round", lineCap: "round",
      }).addTo(map);

      pl.on("click", (e) => { L.DomEvent.stopPropagation(e); onSelectRef.current(idx); });
      pl.on("mouseover", () => {
        pl.setStyle({ opacity: 0.9, weight: 5 });
        map.getContainer().classList.add("option-hover");
      });
      pl.on("mouseout", () => {
        pl.setStyle({ opacity: 0.5, weight: 4 });
        map.getContainer().classList.remove("option-hover");
      });
      polylines.push(pl);
    });
    return () => {
      polylines.forEach((pl) => map.removeLayer(pl));
      map.getContainer().classList.remove("option-hover");
    };
  }, [loopOptions, activeLoopIdx, map]);

  return null;
}

// ── GPS live-tracking dot ─────────────────────────────────────────────────────
const GPS_ICON = L.divIcon({
  className: "",
  html: '<div class="gps-marker"><div class="gps-pulse"></div><div class="gps-core"></div></div>',
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

interface GpsTrackerProps {
  enabled: boolean;
  onPosition: (lat: number, lon: number) => void;
  onError: (msg: string) => void;
}

function GpsTracker({ enabled, onPosition, onError }: GpsTrackerProps) {
  const map = useMap();
  const onPositionRef = useRef(onPosition);
  const onErrorRef = useRef(onError);
  useEffect(() => { onPositionRef.current = onPosition; }, [onPosition]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  useEffect(() => {
    if (!enabled) return;

    if (!navigator.geolocation) {
      onErrorRef.current("Geolocation not supported");
      return;
    }

    let marker: L.Marker | null = null;
    let circle: L.Circle | null = null;

    const watchId = navigator.geolocation.watchPosition(
      ({ coords: { latitude: lat, longitude: lon, accuracy } }) => {
        if (!marker) {
          marker = L.marker([lat, lon], { icon: GPS_ICON, zIndexOffset: 2000, interactive: false }).addTo(map);
          circle = L.circle([lat, lon], {
            radius: accuracy, color: "#5b8bff", fillColor: "#5b8bff",
            fillOpacity: 0.08, weight: 1, interactive: false,
          }).addTo(map);
          map.flyTo([lat, lon], Math.max(map.getZoom(), 15), { animate: true });
        } else {
          marker.setLatLng([lat, lon]);
          circle!.setLatLng([lat, lon]);
          circle!.setRadius(accuracy);
        }
        onPositionRef.current(lat, lon);
      },
      (err) => {
        const msgs: Record<number, string> = { 1: "Location access denied", 2: "Position unavailable", 3: "Request timed out" };
        onErrorRef.current(msgs[err.code] || "GPS unavailable");
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
      if (marker) map.removeLayer(marker);
      if (circle) map.removeLayer(circle);
    };
  }, [enabled, map]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}

// ── Camera density heatmap ────────────────────────────────────────────────────
interface HeatmapLayerProps {
  features: CameraFeature[];
}

function HeatmapLayer({ features }: HeatmapLayerProps) {
  const map = useMap();
  const layerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!layerRef.current) layerRef.current = L.layerGroup().addTo(map);
    layerRef.current.clearLayers();

    features.forEach((f) => {
      const [lon, lat] = f.geometry.coordinates;
      if (layerRef.current) {
        L.circle([lat, lon], {
          radius: 120,
          color: "transparent",
          fillColor: "#ff4f4f",
          fillOpacity: 0.045,
          weight: 0,
          interactive: false,
        }).addTo(layerRef.current);
      }
    });

    return () => { layerRef.current?.clearLayers(); };
  }, [features, map]);

  return null;
}

// ── Map click handler ─────────────────────────────────────────────────────────
interface MapClickHandlerProps {
  onAdd: (lat: number, lon: number) => void;
}

function MapClickHandler({ onAdd }: MapClickHandlerProps) {
  useMapEvents({ click: (e) => onAdd(e.latlng.lat, e.latlng.lng) });
  return null;
}

// ── Bounds tracker (for autocomplete viewbox) ─────────────────────────────────
interface BoundsTrackerProps {
  onBoundsChange: (bounds: string) => void;
}

function BoundsTracker({ onBoundsChange }: BoundsTrackerProps) {
  const map = useMap();

  function emit(m: L.Map) {
    const b = m.getBounds();
    onBoundsChange(`${b.getWest()},${b.getSouth()},${b.getEast()},${b.getNorth()}`);
  }

  useEffect(() => { emit(map); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useMapEvents({
    moveend: (e) => emit(e.target),
    zoomend: (e) => emit(e.target),
  });
  return null;
}

// ── Viewport camera loader ────────────────────────────────────────────────────
interface ViewportLoaderProps {
  onViewportChange: (features: CameraFeature[]) => void;
}

function ViewportLoader({ onViewportChange }: ViewportLoaderProps) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const load = (map: L.Map) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const zoom = map.getZoom();
      if (zoom < 10) { onViewportChange([]); return; }
      const b = map.getBounds();
      try {
        const url = `/api/cameras?minLon=${b.getWest()}&minLat=${b.getSouth()}&maxLon=${b.getEast()}&maxLat=${b.getNorth()}`;
        const data = await fetch(url).then((r) => r.json()) as { features?: CameraFeature[] };
        let features = data.features || [];
        const max = zoom >= 12 ? 2000 : zoom >= 11 ? 700 : 350;
        if (features.length > max) {
          const step = Math.ceil(features.length / max);
          features = features.filter((_, i) => i % step === 0);
        }
        onViewportChange(features);
      } catch { onViewportChange([]); }
    }, 400);
  };
  useMapEvents({ moveend: (e) => load(e.target), zoomend: (e) => load(e.target) });
  return null;
}

// ── Pan to start when first waypoint placed ───────────────────────────────────
interface StartFocusProps {
  waypoints: Waypoint[];
}

function StartFocus({ waypoints }: StartFocusProps) {
  const map = useMap();
  const prevLenRef = useRef(0);
  useEffect(() => {
    const prev = prevLenRef.current;
    prevLenRef.current = waypoints.length;
    if (waypoints.length === 1 && prev <= 1) {
      map.setView([waypoints[0].lat, waypoints[0].lon], Math.max(map.getZoom(), 14), { animate: true });
    }
  }, [waypoints, map]);
  return null;
}

// ── Main export ───────────────────────────────────────────────────────────────
interface MapViewProps {
  waypoints: Waypoint[];
  route: RouteGeoJson | null;
  loopOptions: LoopOption[];
  activeLoopIdx: number;
  camerasOnRoute: CameraFeature[];
  viewportCameras: CameraFeature[];
  onViewportChange: (features: CameraFeature[]) => void;
  onBoundsChange: (bounds: string) => void;
  onAddWaypoint: (lat: number, lon: number) => void;
  onInsertWaypoint: (idx: number, lat: number, lon: number) => void;
  onUpdateWaypoint: (id: number, lat: number, lon: number) => void;
  onRemoveWaypoint: (id: number) => void;
  onSelectLoop: (idx: number) => void;
  gpsEnabled: boolean;
  showHeatmap: boolean;
  soloRoute: boolean;
  onGpsPosition: (lat: number, lon: number) => void;
  onGpsError: (msg: string) => void;
}

export default function MapView({
  waypoints,
  route,
  loopOptions,
  activeLoopIdx,
  camerasOnRoute,
  viewportCameras,
  onViewportChange,
  onBoundsChange,
  onAddWaypoint,
  onInsertWaypoint,
  onUpdateWaypoint,
  onRemoveWaypoint,
  onSelectLoop,
  gpsEnabled,
  showHeatmap,
  soloRoute,
  onGpsPosition,
  onGpsError,
}: MapViewProps) {
  const onRouteIds = new Set(camerasOnRoute.map((f) => f.properties?.osmId).filter(Boolean));
  const viewportNotOnRoute = viewportCameras.filter((f) => !onRouteIds.has(f.properties?.osmId));
  const activeRouteColor = loopOptions?.length > 0
    ? LOOP_COLORS[activeLoopIdx % LOOP_COLORS.length]
    : "#5b8bff";

  return (
    <div className="map-container">
      <MapContainer center={[39.5, -98.35]} zoom={5} style={{ height: "100%", width: "100%" }} zoomControl={false}>
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          maxZoom={19}
          className="map-tiles-dark"
        />

        <MapClickHandler onAdd={onAddWaypoint} />
        <ViewportLoader onViewportChange={onViewportChange} />
        <BoundsTracker onBoundsChange={onBoundsChange} />
        <StartFocus waypoints={waypoints} />
        <GpsTracker enabled={gpsEnabled} onPosition={onGpsPosition} onError={onGpsError} />

        {!soloRoute && <InactiveRoutes loopOptions={loopOptions || []} activeLoopIdx={activeLoopIdx} onSelectLoop={onSelectLoop} />}
        <RouteLine route={route} waypoints={waypoints} onInsertWaypoint={onInsertWaypoint} color={activeRouteColor} />

        {showHeatmap ? (
          <HeatmapLayer features={[...viewportNotOnRoute, ...camerasOnRoute]} />
        ) : (
          <>
            <CameraLayer features={viewportNotOnRoute} onRoute={false} />
            <CameraLayer features={camerasOnRoute} onRoute={true} />
          </>
        )}

        <WaypointLayer waypoints={waypoints} onUpdate={onUpdateWaypoint} onRemove={onRemoveWaypoint} />
      </MapContainer>
    </div>
  );
}
