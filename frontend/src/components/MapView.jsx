import { useEffect, useRef } from "react";
import { MapContainer, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

export const LOOP_COLORS = [
  "#5b8bff", // blue
  "#ff9f43", // orange
  "#26de81", // green
  "#ff6b6b", // red
  "#a78bfa", // purple
  "#22d3ee", // cyan
  "#fbbf24", // yellow
  "#f471b5", // pink
];

// ── Camera FOV cone ──────────────────────────────────────────────────────────
function buildCone(lat, lon, bearingDeg, fovDeg = 70, rangeM = 75) {
  const R = 6371000;
  const latR = (lat * Math.PI) / 180;
  const leftDeg = (bearingDeg - fovDeg / 2 + 360) % 360;
  const steps = 10;
  const pts = [[lat, lon]];
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

function CameraLayer({ features, onRoute }) {
  const map = useMap();
  const layerRef = useRef(null);

  useEffect(() => {
    if (!layerRef.current) layerRef.current = L.layerGroup().addTo(map);
    layerRef.current.clearLayers();

    const dotColor = onRoute ? "#ffb84d" : "#ff4f4f";
    const coneOpacity = onRoute ? 0.25 : 0.18;

    features.forEach((f) => {
      const [lon, lat] = f.geometry.coordinates;
      const dir = f.properties?.direction;
      const bearing = dir != null && !isNaN(parseFloat(dir)) ? parseFloat(dir) : null;

      if (bearing !== null) {
        L.polygon(buildCone(lat, lon, bearing), {
          color: dotColor, fillColor: dotColor,
          fillOpacity: coneOpacity, weight: 0, interactive: false,
        }).addTo(layerRef.current);
      }

      L.marker([lat, lon], { icon: onRoute ? CAMERA_ON_ROUTE_ICON : CAMERA_ICON })
        .bindPopup(
          `<b>${f.properties?.operator || "ALPR Camera"}</b>` +
          (bearing !== null ? `<br>Direction: ${Math.round(bearing)}°` : "") +
          `<br>Zone: ${f.properties?.surveillanceZone || "unknown"}`
        )
        .addTo(layerRef.current);
    });

    return () => layerRef.current?.clearLayers();
  }, [features, onRoute, map]);

  return null;
}

// ── Waypoint markers ──────────────────────────────────────────────────────────
function makeWpIcon(type) {
  return L.divIcon({
    className: "",
    html: `<div class="wp-dot wp-${type}"></div>`,
    iconSize: type === "mid" ? [12, 12] : [16, 16],
    iconAnchor: type === "mid" ? [6, 6] : [8, 8],
  });
}

function WaypointLayer({ waypoints, onUpdate, onRemove }) {
  const map = useMap();
  const stateRef = useRef({ markers: {}, dragging: new Set() });

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
          L.DomEvent.stopPropagation(e);
          L.DomEvent.preventDefault(e);
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
function snapToRouteLL(latlng, coords) {
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

function distToSegLL(py, px, ay, ax, by, bx) {
  const cosLat = Math.cos(py * Math.PI / 180);
  const dx = (bx - ax) * cosLat, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * cosLat * dx + (py - ay) * dy) / len2)) : 0;
  return Math.hypot((py - (ay + t * (by - ay))), (px - (ax + t * (bx - ax))) * cosLat);
}

function findInsertIdx(lat, lon, waypoints) {
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
function RouteLine({ route, waypoints, onInsertWaypoint, color = "#5b8bff" }) {
  const map = useMap();
  const polylineRef = useRef(null);
  const ghostRef = useRef(null);
  const thinCoordsRef = useRef([]); // downsampled coords for snap — fast O(n) with small n
  const waypointsRef = useRef(waypoints);
  const onInsertRef = useRef(onInsertWaypoint);

  useEffect(() => { waypointsRef.current = waypoints; }, [waypoints]);
  useEffect(() => { onInsertRef.current = onInsertWaypoint; }, [onInsertWaypoint]);
  useEffect(() => { polylineRef.current?.setStyle({ color }); }, [color]);

  // Create polyline & ghost dot once; all event handlers read state via refs
  useEffect(() => {
    const polyline = L.polyline([], {
      color: "#5b8bff", weight: 5, opacity: 0.9, lineJoin: "round", lineCap: "round",
    }).addTo(map);
    polylineRef.current = polyline;

    const ghost = L.marker([0, 0], { icon: GHOST_ICON, interactive: false, opacity: 0, zIndexOffset: 500 }).addTo(map);
    ghostRef.current = ghost;

    let isDragging = false;
    let tempMarker = null;
    let curLat = null, curLon = null, initLat = null, initLon = null;
    let snapRaf = null, dragRaf = null;

    polyline.on("mousemove", (e) => {
      if (isDragging) return;
      if (snapRaf) return; // already queued for this frame
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
      L.DomEvent.stopPropagation(e);
      L.DomEvent.preventDefault(e);

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

      function onMove(ev) {
        if (dragRaf) return;
        const cx = ev.clientX, cy = ev.clientY;
        dragRaf = requestAnimationFrame(() => {
          dragRaf = null;
          const rect = container.getBoundingClientRect();
          const ll = map.containerPointToLatLng(L.point(cx - rect.left, cy - rect.top));
          tempMarker.setLatLng(ll);
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

        const moved = Math.abs(curLat - initLat) + Math.abs(curLon - initLon);
        if (moved > 0.00005) {
          const idx = findInsertIdx(curLat, curLon, waypointsRef.current);
          onInsertRef.current(idx, curLat, curLon);
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

  // Update polyline coordinates + thin snap cache when route changes
  useEffect(() => {
    const pl = polylineRef.current;
    if (!pl) return;
    if (!route) {
      pl.setLatLngs([]);
      thinCoordsRef.current = [];
      ghostRef.current?.setOpacity(0);
      return;
    }
    const coords = route.geometry.coordinates.map(([lon, lat]) => [lat, lon]);
    pl.setLatLngs(coords);
    // Cache a thinned version (≤200 pts) so snapping stays fast regardless of route length
    const step = Math.max(1, Math.floor(coords.length / 200));
    thinCoordsRef.current = coords.filter((_, i) => i % step === 0 || i === coords.length - 1);
  }, [route]);

  return null;
}

// ── Inactive loop option lines ────────────────────────────────────────────────
function InactiveRoutes({ loopOptions, activeLoopIdx, onSelectLoop }) {
  const map = useMap();
  const onSelectRef = useRef(onSelectLoop);
  useEffect(() => { onSelectRef.current = onSelectLoop; }, [onSelectLoop]);

  useEffect(() => {
    if (!loopOptions.length) return;
    const polylines = [];
    loopOptions.forEach((opt, idx) => {
      if (idx === activeLoopIdx) return;
      const coords = opt.route.geometry.coordinates.map(([lon, lat]) => [lat, lon]);
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

function GpsTracker({ enabled, onPosition, onError }) {
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

    let marker = null;
    let circle = null;

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
          circle.setLatLng([lat, lon]);
          circle.setRadius(accuracy);
        }
        onPositionRef.current(lat, lon);
      },
      (err) => {
        const msgs = { 1: "Location access denied", 2: "Position unavailable", 3: "Request timed out" };
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
function HeatmapLayer({ features }) {
  const map = useMap();
  const layerRef = useRef(null);

  useEffect(() => {
    if (!layerRef.current) layerRef.current = L.layerGroup().addTo(map);
    layerRef.current.clearLayers();

    features.forEach((f) => {
      const [lon, lat] = f.geometry.coordinates;
      L.circle([lat, lon], {
        radius: 120,
        color: "transparent",
        fillColor: "#ff4f4f",
        fillOpacity: 0.045,
        weight: 0,
        interactive: false,
      }).addTo(layerRef.current);
    });

    return () => layerRef.current?.clearLayers();
  }, [features, map]);

  return null;
}

// ── Map click handler ─────────────────────────────────────────────────────────
function MapClickHandler({ onAdd }) {
  useMapEvents({ click: (e) => onAdd(e.latlng.lat, e.latlng.lng) });
  return null;
}

// ── Bounds tracker (for autocomplete viewbox) ─────────────────────────────────
function BoundsTracker({ onBoundsChange }) {
  const map = useMap();

  function emit(m) {
    const b = m.getBounds();
    onBoundsChange(`${b.getWest()},${b.getSouth()},${b.getEast()},${b.getNorth()}`);
  }

  // Fire immediately on mount so viewbox is populated before the user types
  useEffect(() => { emit(map); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useMapEvents({
    moveend: (e) => emit(e.target),
    zoomend: (e) => emit(e.target),
  });
  return null;
}

// ── Viewport camera loader ────────────────────────────────────────────────────
function ViewportLoader({ onViewportChange }) {
  const debounceRef = useRef(null);
  const load = (map) => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const zoom = map.getZoom();
      if (zoom < 10) { onViewportChange([]); return; }
      const b = map.getBounds();
      try {
        const url = `/api/cameras?minLon=${b.getWest()}&minLat=${b.getSouth()}&maxLon=${b.getEast()}&maxLat=${b.getNorth()}`;
        const data = await fetch(url).then((r) => r.json());
        let features = data.features || [];
        // Cap markers per zoom level to keep rendering smooth
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
function StartFocus({ waypoints }) {
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
}) {
  const onRouteIds = new Set(camerasOnRoute.map((f) => f.properties?.osmId).filter(Boolean));
  const viewportNotOnRoute = viewportCameras.filter((f) => !onRouteIds.has(f.properties?.osmId));
  const allCameras = [...viewportNotOnRoute, ...camerasOnRoute];
  const activeRouteColor = loopOptions?.length > 0
    ? LOOP_COLORS[activeLoopIdx % LOOP_COLORS.length]
    : "#5b8bff";

  return (
    <div className="map-container">
      <MapContainer center={[39.5, -98.35]} zoom={5} style={{ height: "100%", width: "100%" }} zoomControl={false}>
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          subdomains="abcd"
          maxZoom={19}
        />

        <MapClickHandler onAdd={onAddWaypoint} />
        <ViewportLoader onViewportChange={onViewportChange} />
        <BoundsTracker onBoundsChange={onBoundsChange} />
        <StartFocus waypoints={waypoints} />
        <GpsTracker enabled={gpsEnabled} onPosition={onGpsPosition} onError={onGpsError} />

        {!soloRoute && <InactiveRoutes loopOptions={loopOptions || []} activeLoopIdx={activeLoopIdx} onSelectLoop={onSelectLoop} />}
        <RouteLine route={route} waypoints={waypoints} onInsertWaypoint={onInsertWaypoint} color={activeRouteColor} />

        {showHeatmap ? (
          <HeatmapLayer features={allCameras} />
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
