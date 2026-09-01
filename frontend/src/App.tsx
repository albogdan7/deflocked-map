import { useState, useCallback } from "react";
import { useAuth } from "@clerk/clerk-react";
import MapView from "./components/MapView";
import RunPanel from "./components/RunPanel";
import { useRouteBuilder } from "./hooks/useRouteBuilder";
import { useGps } from "./hooks/useGps";
import { useSavedRoutes } from "./hooks/useSavedRoutes";
import type { CameraFeature, SavedRoute } from "./types";

export default function App() {
  const { isSignedIn, userId, getToken } = useAuth();

  // UI state — lives here because it doesn't belong in any domain hook
  const [panelOpen, setPanelOpen] = useState(true);
  const [soloRoute, setSoloRoute] = useState(false);
  const [mode, setMode] = useState("walk");
  const [avoidCameras, setAvoidCameras] = useState(true);
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
  } = useRouteBuilder({ mode, avoidCameras });

  const {
    gpsEnabled, gpsError, gpsStartAddress,
    handleGpsPosition, handleGpsError, toggleGps,
  } = useGps({ userSetStartRef, onGpsStart: setGpsStart });

  const { savedRoutes, save: saveSavedRoute, remove: deleteSavedRoute } = useSavedRoutes(
    isSignedIn,
    userId ?? null,
    getToken
  );

  const handleClear = useCallback(() => {
    clear();
    setSoloRoute(false);
  }, [clear]);

  const handleGenerateLoop = useCallback(async () => {
    if (waypoints.length < 1) return;
    const start = waypoints[waypoints.length - 1];
    const ok = await generateLoop(start, targetMiles);
    if (ok) setSoloRoute(false);
  }, [waypoints, targetMiles, generateLoop]);

  const handleSaveRoute = useCallback(async (name: string) => {
    if (!route) return;
    await saveSavedRoute({
      name: name || `Route ${new Date().toLocaleDateString()}`,
      waypoints: waypoints.map((wp) => ({ lat: wp.lat, lon: wp.lon })),
      mode,
      miles: routeStats?.length ?? 0,
    });
  }, [route, saveSavedRoute, waypoints, mode, routeStats]);

  const handleLoadSavedRoute = useCallback((entry: SavedRoute) => {
    setMode(entry.mode);
    loadRoute(entry.waypoints);
  }, [loadRoute]);

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
          onCollapse={() => setPanelOpen(false)}
          soloRoute={soloRoute}
          setSoloRoute={setSoloRoute}
          gpsStartAddress={gpsStartAddress}
          onSwap={reverseRoute}
          isSignedIn={!!isSignedIn}
        />
      )}
    </div>
  );
}
