import type { Waypoint, CameraFeature, RouteGeoJson, LoopOption } from "../types";
import { nextId } from "../lib/nextId";

export interface FetchRouteResult {
  route: RouteGeoJson;
  camerasOnRoute: CameraFeature[];
  camerasNearby: number;
}

export interface FetchLoopResult {
  options: LoopOption[];
  camerasNearby: number;
}

export async function fetchRoute(
  waypoints: Waypoint[],
  mode: string,
  avoidCameras: boolean
): Promise<FetchRouteResult> {
  const res = await fetch("/api/route", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      waypoints: waypoints.map((wp) => [wp.lat, wp.lon]),
      mode,
      avoid_cameras: avoidCameras,
    }),
  });
  if (!res.ok) {
    const d = await res.json() as { error?: string };
    throw new Error(d.error || "Route failed");
  }
  const data = await res.json() as {
    route: RouteGeoJson;
    cameras_on_route?: CameraFeature[];
    cameras_nearby?: number;
  };
  return {
    route: data.route,
    camerasOnRoute: data.cameras_on_route ?? [],
    camerasNearby: data.cameras_nearby ?? 0,
  };
}

export async function fetchLoop(
  start: Waypoint,
  miles: number,
  mode: string,
  avoidCameras: boolean
): Promise<FetchLoopResult> {
  const res = await fetch("/api/loop", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      start: [start.lat, start.lon],
      miles,
      mode,
      avoid_cameras: avoidCameras,
    }),
  });
  if (!res.ok) {
    const d = await res.json() as { error?: string };
    throw new Error(d.error || "Loop failed");
  }
  const data = await res.json() as {
    options?: Array<{
      route: RouteGeoJson;
      waypoints: [number, number][];
      actual_miles: number;
      cameras_on_route?: CameraFeature[];
    }>;
    cameras_nearby?: number;
  };

  const options: LoopOption[] = (data.options ?? []).map((opt) => ({
    route: opt.route,
    waypoints: opt.waypoints.map((wp) => ({ id: nextId(), lat: wp[0], lon: wp[1] })),
    actualMiles: opt.actual_miles,
    camerasOnRoute: opt.cameras_on_route ?? [],
  }));

  if (!options.length) throw new Error("No valid loop found");

  return { options, camerasNearby: data.cameras_nearby ?? 0 };
}

function haversineM(la1: number, lo1: number, la2: number, lo2: number): number {
  const R = 6371000;
  const p1 = (la1 * Math.PI) / 180;
  const p2 = (la2 * Math.PI) / 180;
  const dp = ((la2 - la1) * Math.PI) / 180;
  const dl = ((lo2 - lo1) * Math.PI) / 180;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function buildGPXBlob(route: RouteGeoJson, mode: string): Blob {
  const name = mode === "bike" ? "DeflockFitness Bike Route" : "DeflockFitness Walk Route";
  const coords = route.geometry.coordinates;
  const speedMps = ((mode === "bike" ? 10 : 3.5) * 1609.344) / 3600;
  const startTime = new Date();
  let cumSec = 0;

  const pts = coords
    .map(([lon, lat], i) => {
      if (i > 0) {
        const [plon, plat] = coords[i - 1];
        cumSec += haversineM(plat, plon, lat, lon) / speedMps;
      }
      const t = new Date(startTime.getTime() + cumSec * 1000).toISOString();
      return `    <trkpt lat="${lat.toFixed(6)}" lon="${lon.toFixed(6)}"><time>${t}</time></trkpt>`;
    })
    .join("\n");

  const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="DeflockFitness" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>${name}</name>
    <trkseg>
${pts}
    </trkseg>
  </trk>
</gpx>`;
  return new Blob([gpx], { type: "application/gpx+xml" });
}

export function buildGoogleMapsUrl(route: RouteGeoJson, mode: string): string | null {
  const coords = route.geometry.coordinates;
  if (!coords.length) return null;
  const travelmode = mode === "bike" ? "bicycling" : "walking";
  const MAX_MID = 8;
  const sampled: [number, number][] = [coords[0]];
  if (coords.length > 2) {
    const step = Math.max(1, Math.floor((coords.length - 1) / (MAX_MID + 1)));
    for (let i = step; i < coords.length - 1 && sampled.length <= MAX_MID; i += step) {
      sampled.push(coords[i]);
    }
  }
  sampled.push(coords[coords.length - 1]);
  const [origLon, origLat] = sampled[0];
  const [destLon, destLat] = sampled[sampled.length - 1];
  const mid = sampled
    .slice(1, -1)
    .map(([lon, lat]) => `${lat.toFixed(5)},${lon.toFixed(5)}`)
    .join("|");
  let url = `https://www.google.com/maps/dir/?api=1&travelmode=${travelmode}&origin=${origLat.toFixed(5)},${origLon.toFixed(5)}&destination=${destLat.toFixed(5)},${destLon.toFixed(5)}`;
  if (mid) url += `&waypoints=${encodeURIComponent(mid)}`;
  return url;
}
