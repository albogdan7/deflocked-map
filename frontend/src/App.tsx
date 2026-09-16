import { useState, useCallback } from "react";
import { useAuth } from "@clerk/clerk-react";
import MapView from "./components/MapView";
import RunPanel from "./components/RunPanel";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { useRouteBuilder } from "./hooks/useRouteBuilder";
import { useGps } from "./hooks/useGps";
import { useSavedRoutes } from "./hooks/useSavedRoutes";
import { reverseGeocode } from "./api/geocoding";
import type { CameraFeature, SavedRoute } from "./types";

export default function App() {
  const { isSignedIn, userId, getToken } = useAuth();

  // UI state — lives here because it doesn't belong in any domain hook
  const [panelOpen, setPanelOpen] = useState(true);
  const [soloRoute, setSoloRoute] = useState(false);
  const [mode, setMode] = useState("walk");
  const [targetMiles, setTargetMiles] = useState(3);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [mapBounds, setMapBounds] = useState<string | null>(null);
  const [viewportCameras, setViewportCameras] = useState<CameraFeature[]>([]);

  const {
    waypoints, outBackActive, userSetStartRef,
    addWaypoint, insertWaypoint, updateWaypoint, removeWaypoint,
    setStart, setEnd, setGpsStart,
    closeLoop, reverseRoute, outAndBack, undoWaypoint, loadRoute, clear,
    route, camerasOnRoute, loading, error, routeStats,
    loopOptions, activeLoopIdx,
    generateLoop, selectLoop, exportGPX, googleMapsUrl,
    dirty, markClean,
  } = useRouteBuilder({ mode });

  const {
    gpsEnabled, gpsError, gpsStartAddress,
    handleGpsPosition, handleGpsError, toggleGps,
  } = useGps({ userSetStartRef, onGpsStart: setGpsStart });

  const {
    savedRoutes, busy: savedBusy,
    save: saveSavedRoute, update: updateSavedRoute, remove: deleteSavedRoute,
  } = useSavedRoutes(isSignedIn, userId ?? null, getToken);

  // The saved route currently open, so "Update" knows what to overwrite.
  const [loadedRoute, setLoadedRoute] = useState<SavedRoute | null>(null);
  // A saved route the user clicked while there was unsaved work — awaiting confirm.
  const [pendingLoad, setPendingLoad] = useState<SavedRoute | null>(null);
  // Bumped whenever a saved route is opened, to tell the map to recenter on it.
  const [fitSignal, setFitSignal] = useState(0);
  // Address text for the From/To fields when a saved route is opened, reverse-
  // geocoded from its endpoints (saved routes store only coordinates).
  const [loadedFromAddr, setLoadedFromAddr] = useState<string | null>(null);
  const [loadedToAddr, setLoadedToAddr] = useState<string | null>(null);

  const handleClear = useCallback(() => {
    clear();
    setSoloRoute(false);
    setLoadedRoute(null);
  }, [clear]);

  const handleGenerateLoop = useCallback(async () => {
    if (waypoints.length < 1) return;
    const start = waypoints[0];
    // With a distinct destination, route A→B padded to the target distance;
    // otherwise generate a closed loop from the start.
    const end = waypoints.length >= 2 ? waypoints[waypoints.length - 1] : null;
    const ok = await generateLoop(start, targetMiles, end);
    if (ok) setSoloRoute(false);
  }, [waypoints, targetMiles, generateLoop]);

  const handleSaveRoute = useCallback(async (name: string) => {
    if (!route) return;
    const created = await saveSavedRoute({
      name: name || `Route ${new Date().toLocaleDateString()}`,
      waypoints: waypoints.map((wp) => ({ lat: wp.lat, lon: wp.lon })),
      mode,
      miles: routeStats?.length ?? 0,
      geometry: route,
      stats: routeStats,
    });
    setLoadedRoute(created);
    markClean();
  }, [route, saveSavedRoute, waypoints, mode, routeStats, markClean]);

  const openRoute = useCallback((entry: SavedRoute) => {
    setMode(entry.mode);
    loadRoute(entry.waypoints, { route: entry.route, stats: entry.stats });
    setLoadedRoute(entry);
    setFitSignal((n) => n + 1);
    // Reverse-geocode the endpoints so the From/To fields show real addresses.
    const wps = entry.waypoints;
    const start = wps[0];
    const end = wps.length >= 2 ? wps[wps.length - 1] : null;
    setLoadedFromAddr(null);
    setLoadedToAddr(end ? null : "");
    if (start) reverseGeocode(start.lat, start.lon).then(setLoadedFromAddr).catch(() => {});
    if (end) reverseGeocode(end.lat, end.lon).then(setLoadedToAddr).catch(() => {});
  }, [loadRoute]);

  const handleLoadSavedRoute = useCallback((entry: SavedRoute) => {
    // Only interrupt if there's unsaved current work to lose.
    if (dirty && (route || waypoints.length > 0)) {
      setPendingLoad(entry);
    } else {
      openRoute(entry);
    }
  }, [dirty, route, waypoints.length, openRoute]);

  const handleUpdateRoute = useCallback(async () => {
    if (!loadedRoute || !route) return;
    const body = {
      name: loadedRoute.name,
      waypoints: waypoints.map((wp) => ({ lat: wp.lat, lon: wp.lon })),
      mode,
      miles: routeStats?.length ?? 0,
      geometry: route,
      stats: routeStats,
    };
    await updateSavedRoute(loadedRoute.id, body);
    setLoadedRoute((prev) => (prev ? { ...prev, ...body, actualMiles: body.miles, route: body.geometry, stats: body.stats } : prev));
    markClean();
  }, [loadedRoute, route, waypoints, mode, routeStats, updateSavedRoute, markClean]);

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
        onAddWaypoint={addWaypoint}
        onInsertWaypoint={insertWaypoint}
        onUpdateWaypoint={updateWaypoint}
        onRemoveWaypoint={removeWaypoint}
        onSelectLoop={selectLoop}
        gpsEnabled={gpsEnabled}
        showHeatmap={showHeatmap}
        soloRoute={soloRoute}
        onGpsPosition={handleGpsPosition}
        onGpsError={handleGpsError}
        fitSignal={fitSignal}
      />

      {/* Floating map action buttons */}
      <div className="map-actions">
        <button
          className={`map-btn${gpsEnabled ? " active" : ""}${gpsError ? " gps-err" : ""}`}
          onClick={toggleGps}
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
          onClick={closeLoop}
          disabled={waypoints.length < 2 || loading}
          title="Close loop back to start"
        >
          <span className="map-btn-icon">↺</span>
          <span className="map-btn-label">RETURN</span>
        </button>
        <button
          className="map-btn"
          onClick={reverseRoute}
          disabled={waypoints.length < 2}
          title="Reverse route direction"
        >
          <span className="map-btn-icon">⇄</span>
          <span className="map-btn-label">REVERSE</span>
        </button>
        <button
          className="map-btn"
          onClick={outAndBack}
          disabled={waypoints.length < 2 || outBackActive}
          title="Out and back — adds return path. Add/remove a point to reset."
        >
          <span className="map-btn-icon">↔</span>
          <span className="map-btn-label">OUT+BACK</span>
        </button>
        <button
          className="map-btn"
          onClick={undoWaypoint}
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
      {panelOpen && (
        <RunPanel
          mode={mode}
          setMode={setMode}
          targetMiles={targetMiles}
          setTargetMiles={setTargetMiles}
          waypointCount={waypoints.length}
          startPoint={waypoints.length > 0 ? { lat: waypoints[0].lat, lon: waypoints[0].lon } : null}
          loopOptions={loopOptions}
          activeLoopIdx={activeLoopIdx}
          loading={loading}
          busy={loading || savedBusy}
          error={error}
          routeStats={routeStats}
          mapBounds={mapBounds}
          onSetStart={setStart}
          onSetEnd={setEnd}
          onClear={handleClear}
          onCloseLoop={closeLoop}
          onGenerateLoop={handleGenerateLoop}
          onSelectLoop={selectLoop}
          onExportGPX={exportGPX}
          googleMapsUrl={googleMapsUrl}
          savedRoutes={savedRoutes}
          onSaveRoute={handleSaveRoute}
          onLoadSavedRoute={handleLoadSavedRoute}
          onDeleteSavedRoute={deleteSavedRoute}
          loadedRouteName={dirty ? loadedRoute?.name ?? null : null}
          onUpdateRoute={handleUpdateRoute}
          onCollapse={() => setPanelOpen(false)}
          soloRoute={soloRoute}
          setSoloRoute={setSoloRoute}
          gpsStartAddress={gpsStartAddress}
          loadedFromAddress={loadedFromAddr}
          loadedToAddress={loadedToAddr}
          onSwap={reverseRoute}
        />
      )}

      <ConfirmDialog
        open={!!pendingLoad}
        title="Discard current route?"
        body={pendingLoad ? `You have unsaved changes. Open "${pendingLoad.name}" and discard your current route?` : ""}
        confirmLabel="Discard & open"
        cancelLabel="Keep editing"
        onConfirm={() => { if (pendingLoad) openRoute(pendingLoad); setPendingLoad(null); }}
        onCancel={() => setPendingLoad(null)}
      />
    </div>
  );
}
