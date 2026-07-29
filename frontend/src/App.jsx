import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useUser } from "@clerk/clerk-react";
import MapView from "./components/MapView";
import RunPanel from "./components/RunPanel";

const LS_KEY = "deflockFitness_savedRoutes";

let _nextId = 1;
const newId = () => _nextId++;

export default function App() {
  const { isSignedIn, user } = useUser();
  const userId = user?.id;

  const [waypoints, setWaypoints] = useState([]);
  const [route, setRoute] = useState(null);
  const [camerasOnRoute, setCamerasOnRoute] = useState([]);
  const [viewportCameras, setViewportCameras] = useState([]);
  const [mapBounds, setMapBounds] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [routeStats, setRouteStats] = useState(null);
  const [mode, setMode] = useState("walk");
  const [avoidCameras, setAvoidCameras] = useState(true);
  const [targetMiles, setTargetMiles] = useState(3);

  const [loopOptions, setLoopOptions] = useState([]);
  const [activeLoopIdx, setActiveLoopIdx] = useState(0);

  // ── GPS tracking ──────────────────────────────────────────────────────────────
  const [panelOpen, setPanelOpen] = useState(true);
  const [soloRoute, setSoloRoute] = useState(false);
  const [gpsEnabled, setGpsEnabled] = useState(false);
  const [gpsPosition, setGpsPosition] = useState(null);
  const [gpsError, setGpsError] = useState(null);
  const [gpsStartAddress, setGpsStartAddress] = useState(null);
  const gpsStartSetRef = useRef(false); // true once we've placed the GPS-derived start
  const userSetStartRef = useRef(false); // true once user explicitly picked a FROM address

  // Set start waypoint from GPS on the first fix after enabling —
  // but only if the user hasn't already chosen a FROM address manually.
  useEffect(() => {
    if (!gpsEnabled) { gpsStartSetRef.current = false; setGpsStartAddress(null); return; }
    if (!gpsPosition || gpsStartSetRef.current) return;
    gpsStartSetRef.current = true;
    const { lat, lon } = gpsPosition;
    if (!userSetStartRef.current) {
      setWaypoints((prev) => {
        const start = { id: newId(), lat, lon };
        if (prev.length === 0) return [start];
        return [start, ...prev.slice(1)];
      });
    }
    setLoopOptions([]);
    fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&addressdetails=1`,
      { headers: { "Accept-Language": "en" } }
    )
      .then((r) => r.json())
      .then((d) => {
        if (userSetStartRef.current) return; // user's address takes priority
        const a = d.address || {};
        const street = [a.house_number, a.road].filter(Boolean).join(" ");
        const city = a.city || a.town || a.village || a.suburb || "";
        setGpsStartAddress([street || a.name || d.display_name?.split(",")[0] || "", city].filter(Boolean).join(", ") || "Current Location");
      })
      .catch(() => { if (!userSetStartRef.current) setGpsStartAddress("Current Location"); });
  }, [gpsPosition, gpsEnabled]);

  // ── Out+Back guard — disabled once applied, cleared on any structural change ──
  const [outBackActive, setOutBackActive] = useState(false);

  // ── Camera heatmap toggle ─────────────────────────────────────────────────────
  const [showHeatmap, setShowHeatmap] = useState(false);

  // ── Saved routes — DB when signed in, localStorage when not ─────────────────
  const [savedRoutes, setSavedRoutes] = useState([]);

  useEffect(() => {
    if (isSignedIn === undefined) return; // Clerk still loading
    if (isSignedIn && userId) {
      fetch("/api/routes", { headers: { "X-User-Id": userId } })
        .then((r) => r.json())
        .then((rows) => {
          setSavedRoutes(rows);
          // Migrate any localStorage routes into the user's account
          const local = JSON.parse(localStorage.getItem(LS_KEY) || "[]");
          if (!local.length) return;
          Promise.all(
            local.map((r) =>
              fetch("/api/routes", {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-User-Id": userId },
                body: JSON.stringify({ name: r.name, waypoints: r.waypoints, mode: r.mode, miles: r.actualMiles }),
              })
            )
          )
            .then(() => {
              localStorage.removeItem(LS_KEY);
              return fetch("/api/routes", { headers: { "X-User-Id": userId } });
            })
            .then((r) => r.json())
            .then(setSavedRoutes)
            .catch(() => {});
        })
        .catch(() => {});
    } else {
      try {
        setSavedRoutes(JSON.parse(localStorage.getItem(LS_KEY) || "[]"));
      } catch {
        setSavedRoutes([]);
      }
    }
  }, [isSignedIn, userId]);

  // ── Fetch multi-waypoint route ────────────────────────────────────────────────
  const fetchRoute = useCallback(async (wps, currentMode, currentAvoid) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          waypoints: wps.map((wp) => [wp.lat, wp.lon]),
          mode: currentMode,
          avoid_cameras: currentAvoid,
        }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Route failed"); }
      const data = await res.json();
      setRoute(data.route);
      setCamerasOnRoute(data.cameras_on_route || []);
      setRouteStats({
        length: data.route.properties.summary?.length ?? 0,
        camerasNearby: data.cameras_nearby ?? 0,
        camerasOnRoute: (data.cameras_on_route || []).length,
      });
    } catch (e) {
      setError(e.message);
      setRoute(null);
      setRouteStats(null);
      setCamerasOnRoute([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-route when ≥2 waypoints change (debounced 500ms).
  // Skip when loop options are active — selecting/inserting waypoints manages routing directly.
  useEffect(() => {
    if (loopOptions.length > 0) return;
    if (waypoints.length < 2) {
      setRoute(null);
      setRouteStats(null);
      setCamerasOnRoute([]);
      return;
    }
    const tid = setTimeout(() => fetchRoute(waypoints, mode, avoidCameras), 500);
    return () => clearTimeout(tid);
  }, [waypoints, mode, avoidCameras, fetchRoute, loopOptions]);

  // ── Waypoint CRUD ─────────────────────────────────────────────────────────────
  const handleAddWaypoint = useCallback((lat, lon) => {
    setWaypoints((prev) => [...prev, { id: newId(), lat, lon }]);
    setLoopOptions([]);
    setOutBackActive(false);
  }, []);

  const handleInsertWaypoint = useCallback((idx, lat, lon) => {
    setWaypoints((prev) => {
      const next = [...prev];
      next.splice(idx, 0, { id: newId(), lat, lon });
      return next;
    });
    setLoopOptions([]);
    setOutBackActive(false);
  }, []);

  const handleUpdateWaypoint = useCallback((id, lat, lon) => {
    setWaypoints((prev) => prev.map((wp) => (wp.id === id ? { ...wp, lat, lon } : wp)));
  }, []);

  const handleRemoveWaypoint = useCallback((id) => {
    setWaypoints((prev) => prev.filter((wp) => wp.id !== id));
    setLoopOptions([]);
    setOutBackActive(false);
  }, []);

  const handleClear = useCallback(() => {
    setWaypoints([]);
    setRoute(null);
    setCamerasOnRoute([]);
    setRouteStats(null);
    setError(null);
    setLoopOptions([]);
    setActiveLoopIdx(0);
    setOutBackActive(false);
    setSoloRoute(false);
    userSetStartRef.current = false; // allow GPS to take over again after full clear
  }, []);

  // ── Set start / end from address geocode ─────────────────────────────────────
  const handleSetStart = useCallback((lat, lon) => {
    userSetStartRef.current = true; // user explicitly picked FROM — GPS won't override
    setWaypoints((prev) => {
      const rest = prev.slice(1);
      return [{ id: newId(), lat, lon }, ...rest];
    });
    setLoopOptions([]);
    setOutBackActive(false);
  }, []);

  const handleSetEnd = useCallback((lat, lon) => {
    setWaypoints((prev) => {
      if (prev.length === 0) return [{ id: newId(), lat, lon }];
      const base = prev.length === 1 ? prev : prev.slice(0, -1);
      return [...base, { id: newId(), lat, lon }];
    });
    setLoopOptions([]);
    setOutBackActive(false);
  }, []);

  // ── Close loop ────────────────────────────────────────────────────────────────
  const handleCloseLoop = useCallback(() => {
    setWaypoints((prev) => {
      if (prev.length < 2) return prev;
      const first = prev[0];
      return [...prev, { id: newId(), lat: first.lat, lon: first.lon }];
    });
    setLoopOptions([]);
    setOutBackActive(false);
  }, []);

  // ── Generate loop (3 options) ─────────────────────────────────────────────────
  const handleGenerateLoop = useCallback(async () => {
    if (waypoints.length < 1) return;
    // If both FROM and TO are set, generate the loop from the TO location
    const start = waypoints[waypoints.length - 1];
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/loop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          start: [start.lat, start.lon],
          miles: targetMiles,
          mode,
          avoid_cameras: avoidCameras,
        }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Loop failed"); }
      const data = await res.json();

      const options = (data.options || []).map((opt) => ({
        route: opt.route,
        waypoints: opt.waypoints.map((wp) => ({ id: newId(), lat: wp[0], lon: wp[1] })),
        actualMiles: opt.actual_miles,
        camerasOnRoute: opt.cameras_on_route || [],
      }));

      if (!options.length) throw new Error("No valid loop found");

      setLoopOptions(options);
      setActiveLoopIdx(0);
      setRoute(options[0].route);
      setWaypoints([{ id: newId(), lat: start.lat, lon: start.lon }]);
      setCamerasOnRoute(options[0].camerasOnRoute);
      setSoloRoute(false);
      setRouteStats({
        length: options[0].actualMiles,
        camerasNearby: data.cameras_nearby ?? 0,
        camerasOnRoute: options[0].camerasOnRoute.length,
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [waypoints, targetMiles, mode, avoidCameras]);

  // ── Export route as GPX ───────────────────────────────────────────────────────
  const handleExportGPX = useCallback(() => {
    if (!route) return;
    const name = mode === "bike" ? "DeflockFitness Bike Route" : "DeflockFitness Walk Route";
    const coords = route.geometry.coordinates;
    // Synthetic timestamps at a realistic pace — required by Strava/MapMyRun for activity import.
    const speedMps = (mode === "bike" ? 10 : 3.5) * 1609.344 / 3600;
    const startTime = new Date();
    let cumSec = 0;

    function havM(la1, lo1, la2, lo2) {
      const R = 6371000, p1 = la1 * Math.PI / 180, p2 = la2 * Math.PI / 180;
      const dp = (la2 - la1) * Math.PI / 180, dl = (lo2 - lo1) * Math.PI / 180;
      const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    const pts = coords.map(([lon, lat], i) => {
      if (i > 0) {
        const [plon, plat] = coords[i - 1];
        cumSec += havM(plat, plon, lat, lon) / speedMps;
      }
      const t = new Date(startTime.getTime() + cumSec * 1000).toISOString();
      return `    <trkpt lat="${lat.toFixed(6)}" lon="${lon.toFixed(6)}"><time>${t}</time></trkpt>`;
    }).join("\n");

    const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="DeflockFitness" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>${name}</name>
    <trkseg>
${pts}
    </trkseg>
  </trk>
</gpx>`;
    const blob = new Blob([gpx], { type: "application/gpx+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "deflock-fitness-route.gpx";
    a.click();
    URL.revokeObjectURL(url);
  }, [route, mode]);

  const googleMapsUrl = useMemo(() => {
    if (!route) return null;
    const coords = route.geometry.coordinates;
    const travelmode = mode === "bike" ? "bicycling" : "walking";

    // Build a fixed-size sample that always includes the first and last coords.
    // Google Maps supports up to 9 intermediate waypoints (11 total with origin+dest).
    const MAX_MID = 8;
    const sampled = [coords[0]];
    if (coords.length > 2) {
      const step = Math.max(1, Math.floor((coords.length - 1) / (MAX_MID + 1)));
      for (let i = step; i < coords.length - 1 && sampled.length <= MAX_MID; i += step) {
        sampled.push(coords[i]);
      }
    }
    sampled.push(coords[coords.length - 1]);

    const [origLon, origLat] = sampled[0];
    const [destLon, destLat] = sampled[sampled.length - 1];
    const mid = sampled.slice(1, -1).map(([lon, lat]) => `${lat.toFixed(5)},${lon.toFixed(5)}`).join("|");
    let url = `https://www.google.com/maps/dir/?api=1&travelmode=${travelmode}&origin=${origLat.toFixed(5)},${origLon.toFixed(5)}&destination=${destLat.toFixed(5)},${destLon.toFixed(5)}`;
    if (mid) url += `&waypoints=${encodeURIComponent(mid)}`;
    return url;
  }, [route, mode]);

  // ── Select a different loop option ───────────────────────────────────────────
  const handleSelectLoop = useCallback((idx) => {
    const opt = loopOptions[idx];
    if (!opt) return;
    setActiveLoopIdx(idx);
    setRoute(opt.route);
    setCamerasOnRoute(opt.camerasOnRoute);
    setRouteStats((prev) => ({
      ...prev,
      length: opt.actualMiles,
      camerasOnRoute: opt.camerasOnRoute.length,
    }));
  }, [loopOptions]);

  // ── GPS callbacks ─────────────────────────────────────────────────────────────
  const handleGpsPosition = useCallback((lat, lon) => {
    setGpsError(null);
    setGpsPosition({ lat, lon });
  }, []);

  const handleGpsError = useCallback((msg) => {
    setGpsError(msg);
  }, []);

  const handleToggleGps = useCallback(() => {
    setGpsEnabled((prev) => !prev);
    setGpsError(null);
    setGpsPosition(null);
  }, []);

  // ── Map action handlers ───────────────────────────────────────────────────────
  const handleUndo = useCallback(() => {
    setWaypoints((prev) => prev.slice(0, -1));
    setLoopOptions([]);
    setOutBackActive(false);
  }, []);

  const handleReverse = useCallback(() => {
    setWaypoints((prev) => {
      if (prev.length < 2) return prev;
      return [...prev].reverse();
    });
    setLoopOptions([]);
  }, []);

  const handleOutAndBack = useCallback(() => {
    setWaypoints((prev) => {
      if (prev.length < 2) return prev;
      const reversed = [...prev].reverse().slice(1).map((wp) => ({ ...wp, id: newId() }));
      return [...prev, ...reversed];
    });
    setLoopOptions([]);
    setOutBackActive(true);
  }, []);

  // ── Saved routes ──────────────────────────────────────────────────────────────
  const handleSaveRoute = useCallback(async (name) => {
    if (!route) return;
    const body = {
      name: name || `Route ${new Date().toLocaleDateString()}`,
      waypoints: waypoints.map((wp) => ({ lat: wp.lat, lon: wp.lon })),
      mode,
      miles: routeStats?.length ?? 0,
    };
    if (isSignedIn && userId) {
      try {
        const res = await fetch("/api/routes", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-User-Id": userId },
          body: JSON.stringify(body),
        });
        const { id } = await res.json();
        setSavedRoutes((prev) => [{ id, name: body.name, waypoints: body.waypoints, mode: body.mode, actualMiles: body.miles, date: new Date().toLocaleDateString() }, ...prev].slice(0, 50));
      } catch {}
    } else {
      const entry = { id: Date.now(), name: body.name, waypoints: body.waypoints, mode: body.mode, actualMiles: body.miles, date: new Date().toLocaleDateString() };
      setSavedRoutes((prev) => {
        const updated = [entry, ...prev].slice(0, 50);
        try { localStorage.setItem(LS_KEY, JSON.stringify(updated)); } catch {}
        return updated;
      });
    }
  }, [route, waypoints, mode, routeStats, isSignedIn, userId]);

  const handleLoadSavedRoute = useCallback((entry) => {
    setMode(entry.mode);
    setWaypoints(entry.waypoints.map((wp) => ({ id: newId(), lat: wp.lat, lon: wp.lon })));
    setLoopOptions([]);
    setActiveLoopIdx(0);
    setOutBackActive(false);
  }, []);

  const handleDeleteSavedRoute = useCallback(async (id) => {
    setSavedRoutes((prev) => {
      const updated = prev.filter((r) => r.id !== id);
      if (!isSignedIn) {
        try { localStorage.setItem(LS_KEY, JSON.stringify(updated)); } catch {}
      }
      return updated;
    });
    if (isSignedIn && userId) {
      try { await fetch(`/api/routes/${id}`, { method: "DELETE", headers: { "X-User-Id": userId } }); } catch {}
    }
  }, [isSignedIn, userId]);

  return (
    <div className="app">
      <MapView
        waypoints={waypoints}
        route={route}
        loopOptions={loopOptions}
        activeLoopIdx={activeLoopIdx}
        camerasOnRoute={camerasOnRoute}
        viewportCameras={viewportCameras}
        onViewportChange={setViewportCameras}
        onBoundsChange={setMapBounds}
        onAddWaypoint={handleAddWaypoint}
        onInsertWaypoint={handleInsertWaypoint}
        onUpdateWaypoint={handleUpdateWaypoint}
        onRemoveWaypoint={handleRemoveWaypoint}
        onSelectLoop={handleSelectLoop}
        gpsEnabled={gpsEnabled}
        showHeatmap={showHeatmap}
        soloRoute={soloRoute}
        onGpsPosition={handleGpsPosition}
        onGpsError={handleGpsError}
      />

      {/* Floating map action buttons */}
      <div className="map-actions">
        <button
          className={`map-btn${gpsEnabled ? " active" : ""}${gpsError ? " gps-err" : ""}`}
          onClick={handleToggleGps}
          title={gpsError || (gpsEnabled ? "Disable GPS tracking" : "Enable GPS tracking")}
        >
          <span className="map-btn-icon">⊙</span>
          <span className="map-btn-label">{gpsError ? "ERR" : "GPS"}</span>
        </button>
        <button
          className={`map-btn${showHeatmap ? " active" : ""}`}
          onClick={() => setShowHeatmap((h) => !h)}
          title="Toggle camera density heatmap (zoom ≥ 12)"
        >
          <span className="map-btn-icon">⬡</span>
          <span className="map-btn-label">HEAT</span>
        </button>
        <button
          className="map-btn"
          onClick={handleCloseLoop}
          disabled={waypoints.length < 2 || loading}
          title="Close loop back to start"
        >
          <span className="map-btn-icon">↺</span>
          <span className="map-btn-label">RETURN</span>
        </button>
        <button
          className="map-btn"
          onClick={handleReverse}
          disabled={waypoints.length < 2}
          title="Reverse route direction"
        >
          <span className="map-btn-icon">⇄</span>
          <span className="map-btn-label">REVERSE</span>
        </button>
        <button
          className="map-btn"
          onClick={handleOutAndBack}
          disabled={waypoints.length < 2 || outBackActive}
          title="Out and back — adds return path. Add/remove a point to reset."
        >
          <span className="map-btn-icon">↔</span>
          <span className="map-btn-label">OUT+BACK</span>
        </button>
        <button
          className="map-btn"
          onClick={handleUndo}
          disabled={waypoints.length === 0}
          title="Remove last waypoint"
        >
          <span className="map-btn-icon">↩</span>
          <span className="map-btn-label">UNDO</span>
        </button>
        <button
          className="map-btn danger"
          onClick={handleClear}
          disabled={waypoints.length === 0}
          title="Clear all waypoints"
        >
          <span className="map-btn-icon">✕</span>
          <span className="map-btn-label">CLEAR</span>
        </button>
      </div>

      {!panelOpen && (
        <button className="panel-expand-btn" onClick={() => setPanelOpen(true)} title="Show panel">›</button>
      )}
      {panelOpen && <RunPanel
        mode={mode}
        setMode={setMode}
        avoidCameras={avoidCameras}
        setAvoidCameras={setAvoidCameras}
        targetMiles={targetMiles}
        setTargetMiles={setTargetMiles}
        waypointCount={waypoints.length}
        loopOptions={loopOptions}
        activeLoopIdx={activeLoopIdx}
        loading={loading}
        error={error}
        routeStats={routeStats}
        mapBounds={mapBounds}
        onSetStart={handleSetStart}
        onSetEnd={handleSetEnd}
        onClear={handleClear}
        onCloseLoop={handleCloseLoop}
        onGenerateLoop={handleGenerateLoop}
        onSelectLoop={handleSelectLoop}
        onExportGPX={handleExportGPX}
        googleMapsUrl={googleMapsUrl}
        savedRoutes={savedRoutes}
        onSaveRoute={handleSaveRoute}
        onLoadSavedRoute={handleLoadSavedRoute}
        onDeleteSavedRoute={handleDeleteSavedRoute}
        onCollapse={() => setPanelOpen(false)}
        soloRoute={soloRoute}
        setSoloRoute={setSoloRoute}
        gpsStartAddress={gpsStartAddress}
        onSwap={handleReverse}
        isSignedIn={!!isSignedIn}
      />}
    </div>
  );
}
