import { useState, useRef, useEffect } from "react";
import { UserButton, SignInButton, SignedIn, SignedOut } from "@clerk/clerk-react";
import { LOOP_COLORS } from "./MapView";
import type { LoopOption, RouteStats, SavedRoute } from "../types";

const PACE_MIN_MI: Record<string, number> = { walk: 18, bike: 5 };

function estTime(miles: number, mode: string): string | null {
  if (!miles) return null;
  const min = Math.round(miles * (PACE_MIN_MI[mode] ?? 18));
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)}h ${min % 60}m`;
}

// ── Address autocomplete ──────────────────────────────────────────────────────
interface NominatimResult {
  place_id: string;
  lat: string;
  lon: string;
  display_name: string;
  address?: {
    house_number?: string;
    road?: string;
    city?: string;
    town?: string;
    village?: string;
    suburb?: string;
    state?: string;
    postcode?: string;
    name?: string;
  };
}

function formatLabel(s: NominatimResult): { primary: string; secondary: string } {
  const a = s.address || {};
  const street = [a.house_number, a.road].filter(Boolean).join(" ");
  const locality = a.city || a.town || a.village || a.suburb || "";
  const state = a.state || "";
  const zip = a.postcode || "";
  const primary = street || a.name || s.display_name.split(",")[0];
  const secondary = [locality, state, zip].filter(Boolean).join(", ");
  return { primary, secondary };
}

async function nominatim(q: string, viewbox: string | null, bounded: boolean, limit = 5): Promise<NominatimResult[]> {
  const p = new URLSearchParams({ q, format: "json", limit: String(limit), countrycodes: "us", addressdetails: "1" });
  if (viewbox) {
    p.set("viewbox", viewbox);
    if (bounded) p.set("bounded", "1");
  }
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${p}`, { headers: { "Accept-Language": "en" } });
  return res.json() as Promise<NominatimResult[]>;
}

interface AddressSearchProps {
  label: string;
  placeholder: string;
  onSelect: (lat: number, lon: number) => void;
  disabled: boolean;
  viewbox: string | null;
  syncValue?: string | null;
  onValueChange?: (value: string) => void;
}

function AddressSearch({ label, placeholder, onSelect, disabled, viewbox, syncValue, onValueChange }: AddressSearchProps) {
  const [value, setValue] = useState("");
  const [suggestions, setSuggestions] = useState<NominatimResult[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (syncValue != null) { setValue(syncValue); setSuggestions([]); }
  }, [syncValue]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value;
    setValue(q);
    onValueChange?.(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.trim().length < 2) { setSuggestions([]); return; }
    debounceRef.current = setTimeout(async () => {
      try {
        let data = await nominatim(q, viewbox, true);
        if (!data.length) data = await nominatim(q, viewbox, false);
        setSuggestions(data);
      } catch {
        setSuggestions([]);
      }
    }, 350);
  }

  function pick(s: NominatimResult) {
    const { primary, secondary } = formatLabel(s);
    const text = secondary ? `${primary}, ${secondary}` : primary;
    setValue(text);
    onValueChange?.(text);
    setSuggestions([]);
    onSelect(parseFloat(s.lat), parseFloat(s.lon));
  }

  async function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") { setSuggestions([]); return; }
    if (e.key === "Enter") {
      e.preventDefault();
      if (suggestions.length > 0) { pick(suggestions[0]); return; }
      const q = value.trim();
      if (!q) return;
      try {
        let data = await nominatim(q, viewbox, true, 1);
        if (!data.length) data = await nominatim(q, viewbox, false, 1);
        if (data.length) pick(data[0]);
      } catch {}
    }
  }

  function handleBlur() {
    setTimeout(() => setSuggestions([]), 150);
  }

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  return (
    <div>
      <div className="search-row">
        <span className="search-chip">{label}</span>
        <input
          className="search-input"
          type="text"
          placeholder={placeholder}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          disabled={disabled}
          autoComplete="off"
        />
      </div>
      {suggestions.length > 0 && (
        <div className="suggestions">
          {suggestions.map((s) => {
            const { primary, secondary } = formatLabel(s);
            return (
              <button
                key={s.place_id}
                className="suggestion-item"
                onMouseDown={(e) => { e.preventDefault(); pick(s); }}
              >
                <span className="suggestion-primary">{primary}</span>
                {secondary && <span className="suggestion-secondary">{secondary}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Panel ─────────────────────────────────────────────────────────────────────
interface RunPanelProps {
  mode: string;
  setMode: (mode: string) => void;
  avoidCameras: boolean;
  setAvoidCameras: (avoid: boolean) => void;
  targetMiles: number;
  setTargetMiles: (miles: number) => void;
  waypointCount: number;
  loopOptions: LoopOption[];
  activeLoopIdx: number;
  loading: boolean;
  error: string | null;
  routeStats: RouteStats | null;
  mapBounds: string | null;
  onSetStart: (lat: number, lon: number) => void;
  onSetEnd: (lat: number, lon: number) => void;
  onClear: () => void;
  onCloseLoop: () => void;
  onGenerateLoop: () => void;
  onSelectLoop: (idx: number) => void;
  onExportGPX: () => void;
  googleMapsUrl: string | null;
  savedRoutes: SavedRoute[];
  onSaveRoute: (name: string) => void;
  onLoadSavedRoute: (route: SavedRoute) => void;
  onDeleteSavedRoute: (id: number | string) => void;
  onCollapse: () => void;
  soloRoute: boolean;
  setSoloRoute: React.Dispatch<React.SetStateAction<boolean>>;
  gpsStartAddress: string | null;
  onSwap: () => void;
  isSignedIn: boolean;
}

export default function RunPanel({
  mode, setMode,
  avoidCameras, setAvoidCameras,
  targetMiles, setTargetMiles,
  waypointCount,
  loopOptions, activeLoopIdx,
  loading, error, routeStats,
  mapBounds,
  onSetStart, onSetEnd, onClear, onCloseLoop, onGenerateLoop, onSelectLoop,
  onExportGPX, googleMapsUrl,
  savedRoutes, onSaveRoute, onLoadSavedRoute, onDeleteSavedRoute,
  onCollapse,
  soloRoute, setSoloRoute,
  gpsStartAddress, onSwap,
  isSignedIn,
}: RunPanelProps) {
  const busy = loading;
  const actualMiles = routeStats?.length ?? 0;
  const pct = targetMiles > 0 ? Math.min(100, (actualMiles / targetMiles) * 100) : 0;

  const [saving, setSaving] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveFeedback, setSaveFeedback] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const [startText, setStartText] = useState("");
  const [endText, setEndText] = useState("");

  useEffect(() => {
    if (gpsStartAddress) setStartText(gpsStartAddress);
  }, [gpsStartAddress]);

  function handleSwap() {
    const tmp = startText;
    setStartText(endText);
    setEndText(tmp);
    onSwap();
  }

  function doSave(name: string) {
    onSaveRoute(name.trim() || `Route ${new Date().toLocaleDateString()}`);
    setSaving(false);
    setSaveName("");
    setSaveFeedback(true);
    setTimeout(() => setSaveFeedback(false), 2000);
  }

  return (
    <div className="panel">
      {/* Header */}
      <div className="panel-section">
        <div className="panel-header">
          <div>
            <h1><span>Deflock</span>Fitness</h1>
            <div className="panel-subtitle">Avoid ALPR cameras on your route</div>
          </div>
          <div className="header-actions">
            <SignedOut>
              <SignInButton mode="modal">
                <button className="auth-btn" title="Sign in to sync routes across devices">Sign in</button>
              </SignInButton>
            </SignedOut>
            <SignedIn>
              <UserButton />
            </SignedIn>
            <button className="panel-collapse-btn" onClick={onCollapse} title="Minimize panel">‹</button>
          </div>
        </div>
        {isSignedIn === false && savedRoutes.length === 0 && (
          <div className="auth-hint">Sign in to sync routes across devices</div>
        )}
      </div>

      {/* Address search */}
      <div className="panel-section">
        <AddressSearch label="From" placeholder="Start address or place…" onSelect={onSetStart} disabled={busy} viewbox={mapBounds} syncValue={startText} onValueChange={setStartText} />
        <div className="swap-row">
          <button className="swap-btn" onClick={handleSwap} title="Swap start and destination">⇅</button>
        </div>
        <AddressSearch label="To" placeholder="End address or place…" onSelect={onSetEnd} disabled={busy} viewbox={mapBounds} syncValue={endText} onValueChange={setEndText} />
      </div>

      {/* Distance + mode + avoid */}
      <div className="panel-section">
        <div className="distance-header">
          <span className="distance-label">Target</span>
          <div className="distance-value">{targetMiles}<span>mi</span></div>
        </div>
        <input
          type="range"
          className="miles-slider"
          min="0.5" max="26.2" step="0.5"
          value={targetMiles}
          onChange={(e) => setTargetMiles(parseFloat(e.target.value))}
        />

        <div className="mode-toggle">
          <button type="button" className={`mode-btn${mode === "walk" ? " active" : ""}`} onClick={() => setMode("walk")}>
            Walk / Run
          </button>
          <button type="button" className={`mode-btn${mode === "bike" ? " active" : ""}`} onClick={() => setMode("bike")}>
            Bike
          </button>
        </div>

        <label className="avoid-row">
          <input type="checkbox" checked={avoidCameras} onChange={(e) => setAvoidCameras(e.target.checked)} />
          Avoid ALPR cameras
        </label>
      </div>

      {/* Actions */}
      <div className="panel-section">
        {waypointCount === 0 && (
          <div className="hint-box">Set a start address or click the map to place a point</div>
        )}
        {waypointCount === 1 && (
          <div className="hint-box">Add more waypoints or generate a loop from here</div>
        )}

        <button className="gen-btn" onClick={onGenerateLoop} disabled={waypointCount < 1 || busy}>
          Generate Loop
        </button>

        <div className="secondary-row">
          <button className="sec-btn" onClick={onCloseLoop} disabled={waypointCount < 2 || busy}>
            Close Loop
          </button>
          <button className="sec-btn danger" onClick={onClear} disabled={waypointCount === 0 || busy}>
            Clear All
          </button>
        </div>
      </div>

      {/* Loop options */}
      {loopOptions && loopOptions.length > 1 && (
        <div className="panel-section">
          <div className="opts-header">
            <div className="opts-label">Route Options</div>
            <button
              className={`solo-toggle${soloRoute ? " active" : ""}`}
              onClick={() => setSoloRoute((s) => !s)}
              title={soloRoute ? "Show all routes" : "Show only selected route"}
            >
              {soloRoute ? "Show all" : "Solo"}
            </button>
          </div>
          <div className="loop-opts">
            {loopOptions.map((opt, idx) => (
              <button
                key={idx}
                className={`loop-opt-btn${idx === activeLoopIdx ? " active" : ""}`}
                style={{ "--opt-color": LOOP_COLORS[idx % LOOP_COLORS.length] } as React.CSSProperties}
                onClick={() => onSelectLoop(idx)}
              >
                <span className="opt-dot" />
                <span className="opt-info">
                  <span className="opt-name">Option {idx + 1}</span>
                  <span className="opt-sub">
                    <span className="opt-miles">{opt.actualMiles.toFixed(1)} mi</span>
                    <span className={`opt-cams ${opt.camerasOnRoute.length === 0 ? "clear" : "warn"}`}>
                      {opt.camerasOnRoute.length === 0
                        ? "0 cameras"
                        : `${opt.camerasOnRoute.length} cam${opt.camerasOnRoute.length > 1 ? "s" : ""}`}
                    </span>
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Stats */}
      {(loading || error || routeStats) && (
        <div className="panel-section">
          {loading && <div className="stats-box loading"><div className="stats-loading">Routing…</div></div>}
          {error && !loading && <div className="stats-box error"><div className="stats-error">{error}</div></div>}
          {routeStats && !loading && !error && (
            <div className="stats-box success">
              <div className="stats-primary">
                <span className="stats-distance">{actualMiles.toFixed(2)}</span>
                <span className="stats-unit">mi</span>
                {estTime(actualMiles, mode) && <span className="stats-time">{estTime(actualMiles, mode)}</span>}
              </div>
              {targetMiles > 0 && (
                <div className="progress-wrap">
                  <div className="progress-bar" style={{ width: `${pct}%` }} />
                </div>
              )}
              <div className="stats-meta">
                <span>{pct.toFixed(0)}% of {targetMiles} mi goal</span>
                <span className={`stats-cameras ${routeStats.camerasOnRoute === 0 ? "avoided" : "onpath"}`}>
                  {routeStats.camerasOnRoute === 0
                    ? `${routeStats.camerasNearby} cameras avoided`
                    : `${routeStats.camerasOnRoute} cameras on path`}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Export + Save */}
      {routeStats && !loading && !error && (
        <div className="panel-section">
          <div className="export-row">
            <button className="export-btn" onClick={onExportGPX}>↓ GPX (exact)</button>
            {googleMapsUrl && (
              <a className="export-btn export-maps" href={googleMapsUrl} target="_blank" rel="noreferrer">
                Maps ↗ approx.
              </a>
            )}
          </div>

          {saveFeedback ? (
            <div className="save-success">Route saved!</div>
          ) : saving ? (
            <form
              className="save-form"
              onSubmit={(e) => { e.preventDefault(); doSave(saveName); }}
            >
              <input
                className="search-input"
                placeholder="Route name…"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                autoFocus
              />
              <button type="submit" className="search-btn">Save</button>
              <button type="button" className="sec-btn" style={{ flex: "none", padding: "9px 10px" }} onClick={() => { setSaving(false); setSaveName(""); }}>✕</button>
            </form>
          ) : (
            <button className="export-btn" style={{ width: "100%" }} onClick={() => setSaving(true)}>
              ☆ Save Route
            </button>
          )}

          <div className="export-hint">
            GPX = full route · import into Strava, Garmin, MapMyRun
          </div>
          <div className="export-hint">
            Maps link re-routes between 10 points — distance will differ
          </div>
        </div>
      )}

      {/* Saved routes */}
      {savedRoutes && savedRoutes.length > 0 && (
        <div className="panel-section">
          <button className="saved-header-btn" onClick={() => setShowSaved((s) => !s)}>
            <span className="opts-label">Saved Routes ({savedRoutes.length})</span>
            <span className="saved-header-chevron">{showSaved ? "▲" : "▼"}</span>
          </button>
          {showSaved && (
            <div className="saved-list">
              {savedRoutes.map((r) => (
                <div key={r.id} className="saved-item">
                  <button className="saved-load" onClick={() => onLoadSavedRoute(r)}>
                    <span className="saved-name">{r.name}</span>
                    <span className="saved-meta">{r.actualMiles.toFixed(1)} mi · {r.mode} · {r.date}</span>
                  </button>
                  <button className="saved-del" onClick={() => onDeleteSavedRoute(r.id)}>✕</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Attribution */}
      <div className="attr-box">
        Camera data: <a href="https://deflock.org" target="_blank" rel="noreferrer">DeFlock / OSM</a>
        {" · "}Routing: Valhalla
        {" · "}Right-click marker to remove · Drag route to reshape
      </div>
    </div>
  );
}
