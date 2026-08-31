import { useEffect, useRef, useCallback, useMemo, useState } from "react";
import Map, { Source, Layer, Marker, type MapRef, type MapLayerMouseEvent } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Waypoint, CameraFeature, RouteGeoJson, LoopOption } from "../types";

export const LOOP_COLORS = [
  "#5b8bff", "#ff9f43", "#26de81", "#ff6b6b",
  "#a78bfa", "#22d3ee", "#fbbf24", "#f471b5",
];

const MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";

function buildCone(lat: number, lon: number, bearingDeg: number, fovDeg = 70, rangeM = 75): [number, number][] {
  const R = 6371000;
  const latR = (lat * Math.PI) / 180;
  const leftDeg = (bearingDeg - fovDeg / 2 + 360) % 360;
  const steps = 10;
  const pts: [number, number][] = [[lon, lat]];
  for (let i = 0; i <= steps; i++) {
    const b = ((leftDeg + (fovDeg / steps) * i) * Math.PI) / 180;
    const dlat = ((rangeM / R) * Math.cos(b) * 180) / Math.PI;
    const dlon = ((rangeM / R) * Math.sin(b) * 180) / Math.PI / Math.cos(latR);
    pts.push([lon + dlon, lat + dlat]);
  }
  pts.push([lon, lat]);
  return pts;
}

function distToSegLL(py: number, px: number, ay: number, ax: number, by: number, bx: number): number {
  const cosLat = Math.cos(py * Math.PI / 180);
  const dx = (bx - ax) * cosLat, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * cosLat * dx + (py - ay) * dy) / len2)) : 0;
  return Math.hypot(py - (ay + t * (by - ay)), (px - (ax + t * (bx - ax))) * cosLat);
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
  waypoints, route, loopOptions, activeLoopIdx,
  camerasOnRoute, viewportCameras,
  onViewportChange, onBoundsChange,
  onAddWaypoint, onInsertWaypoint, onUpdateWaypoint, onRemoveWaypoint,
  onSelectLoop, gpsEnabled, showHeatmap, soloRoute,
  onGpsPosition, onGpsError,
}: MapViewProps) {
  const mapRef = useRef<MapRef>(null);
  const [cursor, setCursor] = useState("crosshair");
  const [gpsPos, setGpsPos] = useState<[number, number] | null>(null);
  const [gpsAccuracy, setGpsAccuracy] = useState(0);

  const waypointsRef = useRef(waypoints);
  const loopOptionsRef = useRef(loopOptions);
  useEffect(() => { waypointsRef.current = waypoints; }, [waypoints]);
  useEffect(() => { loopOptionsRef.current = loopOptions; }, [loopOptions]);

  // GPS watcher
  const firstGpsFix = useRef(false);
  useEffect(() => {
    if (!gpsEnabled) { firstGpsFix.current = false; setGpsPos(null); return; }
    if (!navigator.geolocation) { onGpsError("Geolocation not supported"); return; }
    const watchId = navigator.geolocation.watchPosition(
      ({ coords: { latitude: lat, longitude: lon, accuracy } }) => {
        setGpsPos([lon, lat]);
        setGpsAccuracy(accuracy);
        onGpsPosition(lat, lon);
        if (!firstGpsFix.current) {
          firstGpsFix.current = true;
          mapRef.current?.flyTo({ center: [lon, lat], zoom: Math.max(mapRef.current.getZoom() ?? 5, 15) });
        }
      },
      (err) => {
        const msgs: Record<number, string> = { 1: "Location access denied", 2: "Position unavailable", 3: "Request timed out" };
        onGpsError(msgs[err.code] ?? "GPS unavailable");
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [gpsEnabled, onGpsPosition, onGpsError]);

  // Fly to first waypoint
  const prevWpLenRef = useRef(0);
  useEffect(() => {
    if (waypoints.length === 1 && prevWpLenRef.current <= 1) {
      mapRef.current?.flyTo({ center: [waypoints[0].lon, waypoints[0].lat], zoom: Math.max(mapRef.current.getZoom() ?? 5, 14) });
    }
    prevWpLenRef.current = waypoints.length;
  }, [waypoints]);

  // Viewport camera loader
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadViewportCameras = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const map = mapRef.current?.getMap();
      if (!map) return;
      const zoom = map.getZoom();
      const b = map.getBounds();
      if (!b) return;
      onBoundsChange(`${b.getWest()},${b.getSouth()},${b.getEast()},${b.getNorth()}`);
      if (zoom < 10) { onViewportChange([]); return; }
      fetch(`/api/cameras?minLon=${b.getWest()}&minLat=${b.getSouth()}&maxLon=${b.getEast()}&maxLat=${b.getNorth()}`)
        .then(r => r.json())
        .then((data: { features?: CameraFeature[] }) => {
          let features = data.features ?? [];
          const max = zoom >= 12 ? 2000 : zoom >= 11 ? 700 : 350;
          if (features.length > max) {
            const step = Math.ceil(features.length / max);
            features = features.filter((_, i) => i % step === 0);
          }
          onViewportChange(features);
        })
        .catch(() => onViewportChange([]));
    }, 400);
  }, [onBoundsChange, onViewportChange]);

  // Interactive layer IDs for click detection
  const interactiveLayerIds = useMemo(() => {
    const ids: string[] = [];
    if (route) ids.push("route-line");
    loopOptions.forEach((_, i) => { if (i !== activeLoopIdx) ids.push(`loop-line-${i}`); });
    return ids;
  }, [route, loopOptions, activeLoopIdx]);

  const handleClick = useCallback((e: MapLayerMouseEvent) => {
    const feature = e.features?.[0];
    if (feature) {
      const id = feature.layer?.id ?? "";
      if (id === "route-line") {
        const wps = waypointsRef.current;
        if (wps.length >= 2) onInsertWaypoint(findInsertIdx(e.lngLat.lat, e.lngLat.lng, wps), e.lngLat.lat, e.lngLat.lng);
        return;
      }
      const m = id.match(/^loop-line-(\d+)$/);
      if (m) { onSelectLoop(Number(m[1])); return; }
    }
    onAddWaypoint(e.lngLat.lat, e.lngLat.lng);
  }, [onAddWaypoint, onInsertWaypoint, onSelectLoop]);

  const handleMouseMove = useCallback((e: MapLayerMouseEvent) => {
    const id = e.features?.[0]?.layer?.id ?? "";
    if (id === "route-line") setCursor("grab");
    else if (id.startsWith("loop-line-")) setCursor("pointer");
    else setCursor("crosshair");
  }, []);

  // GeoJSON data
  const onRouteIds = useMemo(() => new Set(camerasOnRoute.map(f => f.properties?.osmId).filter(Boolean)), [camerasOnRoute]);
  const viewportNotOnRoute = useMemo(() => viewportCameras.filter(f => !onRouteIds.has(f.properties?.osmId)), [viewportCameras, onRouteIds]);

  const viewportCamsData = useMemo(() => ({
    type: "FeatureCollection" as const,
    features: viewportNotOnRoute.map(f => ({ type: "Feature" as const, ...f })),
  }), [viewportNotOnRoute]);

  const allCamsData = useMemo(() => ({
    type: "FeatureCollection" as const,
    features: [...viewportNotOnRoute, ...camerasOnRoute].map(f => ({ type: "Feature" as const, ...f })),
  }), [viewportNotOnRoute, camerasOnRoute]);

  const onRouteCamsData = useMemo(() => ({
    type: "FeatureCollection" as const,
    features: camerasOnRoute.map(f => ({ type: "Feature" as const, ...f })),
  }), [camerasOnRoute]);

  const coneData = useMemo(() => ({
    type: "FeatureCollection" as const,
    features: [...viewportNotOnRoute, ...camerasOnRoute]
      .filter(f => f.properties?.direction != null && !isNaN(parseFloat(String(f.properties.direction))))
      .map(f => {
        const [lon, lat] = f.geometry.coordinates;
        return {
          type: "Feature" as const,
          geometry: { type: "Polygon" as const, coordinates: [buildCone(lat, lon, parseFloat(String(f.properties?.direction)))] },
          properties: { onRoute: onRouteIds.has(f.properties?.osmId) },
        };
      }),
  }), [viewportNotOnRoute, camerasOnRoute, onRouteIds]);

  const routeData = useMemo(() => route ? {
    type: "FeatureCollection" as const,
    features: [{ type: "Feature" as const, geometry: route.geometry as unknown as GeoJSON.Geometry, properties: route.properties }],
  } : null, [route]);

  const gpsCircleData = useMemo(() => {
    if (!gpsPos || !gpsAccuracy) return null;
    const [lon, lat] = gpsPos;
    const R = 6371000;
    const latR = (lat * Math.PI) / 180;
    const pts: [number, number][] = Array.from({ length: 65 }, (_, i) => {
      const a = (i / 64) * 2 * Math.PI;
      return [lon + (gpsAccuracy / R) * Math.sin(a) * 180 / Math.PI / Math.cos(latR),
              lat + (gpsAccuracy / R) * Math.cos(a) * 180 / Math.PI];
    });
    return { type: "FeatureCollection" as const, features: [{ type: "Feature" as const, geometry: { type: "Polygon" as const, coordinates: [pts] }, properties: {} }] };
  }, [gpsPos, gpsAccuracy]);

  const activeColor = loopOptions.length > 0 ? LOOP_COLORS[activeLoopIdx % LOOP_COLORS.length] : "#5b8bff";

  return (
    <div className="map-container">
      <Map
        ref={mapRef}
        initialViewState={{ longitude: -98.35, latitude: 39.5, zoom: 5 }}
        style={{ width: "100%", height: "100%" }}
        mapStyle={MAP_STYLE}
        cursor={cursor}
        interactiveLayerIds={interactiveLayerIds}
        onClick={handleClick}
        onMouseMove={handleMouseMove}
        onLoad={loadViewportCameras}
        onMoveEnd={loadViewportCameras}
      >
        {/* Camera FOV cones */}
        <Source id="cones" type="geojson" data={coneData}>
          <Layer id="cones-fill" type="fill" paint={{
            "fill-color": ["case", ["get", "onRoute"], "#ffb84d", "#ff4f4f"],
            "fill-opacity": 0.18,
          }} />
        </Source>

        {/* Camera dots or heatmap */}
        {showHeatmap ? (
          <Source id="cameras-heat" type="geojson" data={allCamsData}>
            <Layer id="camera-heatmap" type="heatmap" paint={{
              "heatmap-radius": 30,
              "heatmap-intensity": 1,
              "heatmap-color": [
                "interpolate", ["linear"], ["heatmap-density"],
                0, "rgba(255,79,79,0)",
                0.4, "rgba(255,79,79,0.5)",
                1, "rgba(255,79,79,0.9)",
              ],
              "heatmap-opacity": 0.7,
            }} />
          </Source>
        ) : (
          <>
            <Source id="cameras" type="geojson" data={viewportCamsData}>
              <Layer id="cameras-dot" type="circle" paint={{
                "circle-radius": 4,
                "circle-color": "#ff4f4f",
                "circle-stroke-width": 1,
                "circle-stroke-color": "rgba(255,255,255,0.5)",
              }} />
            </Source>
            <Source id="cameras-on-route" type="geojson" data={onRouteCamsData}>
              <Layer id="cameras-on-route-dot" type="circle" paint={{
                "circle-radius": 5,
                "circle-color": "#ffb84d",
                "circle-stroke-width": 1.5,
                "circle-stroke-color": "rgba(255,255,255,0.7)",
              }} />
            </Source>
          </>
        )}

        {/* Inactive loop options */}
        {!soloRoute && loopOptions.map((opt, idx) => idx !== activeLoopIdx ? (
          <Source key={`loop-src-${idx}`} id={`loop-src-${idx}`} type="geojson" data={{
            type: "FeatureCollection",
            features: [{ type: "Feature", geometry: opt.route.geometry as unknown as GeoJSON.Geometry, properties: opt.route.properties }],
          }}>
            <Layer id={`loop-line-${idx}`} type="line"
              layout={{ "line-cap": "round", "line-join": "round" }}
              paint={{ "line-color": LOOP_COLORS[idx % LOOP_COLORS.length], "line-width": 4, "line-opacity": 0.45, "line-dasharray": [4, 3] }}
            />
          </Source>
        ) : null)}

        {/* Active route */}
        {routeData && (
          <Source id="route" type="geojson" data={routeData}>
            <Layer id="route-line" type="line"
              layout={{ "line-cap": "round", "line-join": "round" }}
              paint={{ "line-color": activeColor, "line-width": 5, "line-opacity": 0.9 }}
            />
          </Source>
        )}

        {/* GPS accuracy ring */}
        {gpsEnabled && gpsCircleData && (
          <Source id="gps-accuracy" type="geojson" data={gpsCircleData}>
            <Layer id="gps-accuracy-fill" type="fill" paint={{ "fill-color": "#5b8bff", "fill-opacity": 0.08 }} />
            <Layer id="gps-accuracy-line" type="line" paint={{ "line-color": "#5b8bff", "line-width": 1, "line-opacity": 0.4 }} />
          </Source>
        )}

        {/* GPS dot */}
        {gpsEnabled && gpsPos && (
          <Marker longitude={gpsPos[0]} latitude={gpsPos[1]}>
            <div className="gps-marker">
              <div className="gps-pulse" />
              <div className="gps-core" />
            </div>
          </Marker>
        )}

        {/* Waypoint markers */}
        {waypoints.map((wp, idx) => {
          const type = idx === 0 ? "start" : idx === waypoints.length - 1 && idx > 0 ? "end" : "mid";
          return (
            <Marker key={wp.id} longitude={wp.lon} latitude={wp.lat} draggable
              onDragEnd={e => onUpdateWaypoint(wp.id, e.lngLat.lat, e.lngLat.lng)}
            >
              <div className={`wp-dot wp-${type}`} onContextMenu={e => { e.preventDefault(); onRemoveWaypoint(wp.id); }} />
            </Marker>
          );
        })}
      </Map>
    </div>
  );
}
