import { useState } from "react";

async function geocode(query) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`;
  const res = await fetch(url, { headers: { "Accept-Language": "en" } });
  const data = await res.json();
  if (!data.length) throw new Error(`Could not find "${query}"`);
  return [parseFloat(data[0].lat), parseFloat(data[0].lon)];
}

function formatTime(seconds) {
  if (!seconds) return "—";
  const m = Math.round(seconds / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

export default function RoutePanel({ onRoute, onClear, loading, error, routeStats }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [mode, setMode] = useState("walk");
  const [avoidCameras, setAvoidCameras] = useState(true);
  const [geocoding, setGeocoding] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!from.trim() || !to.trim()) return;
    setGeocoding(true);
    try {
      const [origin, destination] = await Promise.all([geocode(from), geocode(to)]);
      onRoute({ origin, destination, mode, avoidCameras });
    } catch (err) {
      // surface geocode errors via parent error state
      onRoute({ origin: null, destination: null, mode, avoidCameras, _geoError: err.message });
    } finally {
      setGeocoding(false);
    }
  }

  const busy = loading || geocoding;

  return (
    <div className="panel">
      <h1>
        <span>De</span>flocked Map
      </h1>
      <form onSubmit={handleSubmit} style={{ display: "contents" }}>
        <div className="input-row">
          <label>From</label>
          <input
            type="text"
            placeholder="Start address or place"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            disabled={busy}
          />
        </div>
        <div className="input-row">
          <label>To</label>
          <input
            type="text"
            placeholder="Destination address or place"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            disabled={busy}
          />
        </div>

        <div className="mode-row">
          <button
            type="button"
            className={`mode-btn${mode === "walk" ? " active" : ""}`}
            onClick={() => setMode("walk")}
          >
            🚶 Walk
          </button>
          <button
            type="button"
            className={`mode-btn${mode === "bike" ? " active" : ""}`}
            onClick={() => setMode("bike")}
          >
            🚲 Bike
          </button>
        </div>

        <label className="avoid-row">
          <input
            type="checkbox"
            checked={avoidCameras}
            onChange={(e) => setAvoidCameras(e.target.checked)}
          />
          Avoid ALPR cameras
        </label>

        <button type="submit" className="go-btn" disabled={busy || !from.trim() || !to.trim()}>
          {busy ? "Routing…" : "Get Route"}
        </button>
      </form>

      {error && <div className="status-box error">{error}</div>}

      {routeStats && !error && (
        <div className="status-box success">
          <div className="stat-row">
            <span>Distance</span>
            <strong>{routeStats.length?.toFixed(2)} mi</strong>
          </div>
          <div className="stat-row">
            <span>Time</span>
            <strong>{formatTime(routeStats.time)}</strong>
          </div>
          <div className="stat-row">
            <span>Cameras nearby</span>
            <strong>{routeStats.camerasNearby}</strong>
          </div>
          <div className="stat-row">
            <span>Cameras on route</span>
            <strong>{routeStats.camerasOnRoute}</strong>
          </div>
        </div>
      )}

      {(routeStats || error) && (
        <button className="clear-btn" onClick={onClear}>
          Clear route
        </button>
      )}

      <div className="status-box" style={{ fontSize: 11 }}>
        Camera data: <a href="https://deflock.org" target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>DeFlock / OSM</a>
        {" · "}Routing: Valhalla / OSM
      </div>
    </div>
  );
}
