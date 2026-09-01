import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { fetchRoute as apiFetchRoute, fetchLoop as apiFetchLoop, buildGPXBlob, buildGoogleMapsUrl } from "../api/route";
import { nextId } from "../lib/nextId";
import type { Waypoint, CameraFeature, RouteGeoJson, LoopOption, RouteStats } from "../types";

interface UseRouteBuilderOptions {
  mode: string;
  avoidCameras: boolean;
}

export function useRouteBuilder({ mode, avoidCameras }: UseRouteBuilderOptions) {
  // Waypoint state
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [outBackActive, setOutBackActive] = useState(false);
  const userSetStartRef = useRef(false);

  // Route state
  const [route, setRoute] = useState<RouteGeoJson | null>(null);
  const [camerasOnRoute, setCamerasOnRoute] = useState<CameraFeature[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [routeStats, setRouteStats] = useState<RouteStats | null>(null);
  const [loopOptions, setLoopOptions] = useState<LoopOption[]>([]);
  const [activeLoopIdx, setActiveLoopIdx] = useState(0);

  const clearLoops = useCallback(() => {
    setLoopOptions([]);
    setActiveLoopIdx(0);
  }, []);

  // Auto-fetch when waypoints/mode/avoidCameras change (debounced 500ms).
  // Skipped when loopOptions are active — loop selection manages route directly.
  useEffect(() => {
    if (loopOptions.length > 0) return;
    if (waypoints.length < 2) {
      setRoute(null);
      setRouteStats(null);
      setCamerasOnRoute([]);
      return;
    }
    let cancelled = false;
    const tid = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await apiFetchRoute(waypoints, mode, avoidCameras);
        if (cancelled) return;
        setRoute(result.route);
        setCamerasOnRoute(result.camerasOnRoute);
        setRouteStats({
          length: result.route.properties.summary?.length ?? 0,
          camerasNearby: result.camerasNearby,
          camerasOnRoute: result.camerasOnRoute.length,
        });
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setRoute(null);
        setRouteStats(null);
        setCamerasOnRoute([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 500);
    return () => { cancelled = true; clearTimeout(tid); };
  }, [waypoints, mode, avoidCameras, loopOptions]);

  // ── Waypoint handlers ─────────────────────────────────────────────────────────

  const addWaypoint = useCallback((lat: number, lon: number) => {
    setWaypoints((prev) => [...prev, { id: nextId(), lat, lon }]);
    clearLoops();
    setOutBackActive(false);
  }, [clearLoops]);

  const insertWaypoint = useCallback((idx: number, lat: number, lon: number) => {
    setWaypoints((prev) => {
      const next = [...prev];
      next.splice(idx, 0, { id: nextId(), lat, lon });
      return next;
    });
    clearLoops();
    setOutBackActive(false);
  }, [clearLoops]);

  // Drag does NOT clear loops — only structural changes do.
  const updateWaypoint = useCallback((id: number, lat: number, lon: number) => {
    setWaypoints((prev) => prev.map((wp) => (wp.id === id ? { ...wp, lat, lon } : wp)));
  }, []);

  const removeWaypoint = useCallback((id: number) => {
    setWaypoints((prev) => prev.filter((wp) => wp.id !== id));
    clearLoops();
    setOutBackActive(false);
  }, [clearLoops]);

  const setStart = useCallback((lat: number, lon: number) => {
    userSetStartRef.current = true;
    setWaypoints((prev) => [{ id: nextId(), lat, lon }, ...prev.slice(1)]);
    clearLoops();
    setOutBackActive(false);
  }, [clearLoops]);

  const setEnd = useCallback((lat: number, lon: number) => {
    setWaypoints((prev) => {
      if (prev.length === 0) return [{ id: nextId(), lat, lon }];
      const base = prev.length === 1 ? prev : prev.slice(0, -1);
      return [...base, { id: nextId(), lat, lon }];
    });
    clearLoops();
    setOutBackActive(false);
  }, [clearLoops]);

  // GPS first-fix sets start only if user hasn't manually chosen a From address.
  const setGpsStart = useCallback((lat: number, lon: number) => {
    if (userSetStartRef.current) return;
    setWaypoints((prev) => {
      const start = { id: nextId(), lat, lon };
      return prev.length === 0 ? [start] : [start, ...prev.slice(1)];
    });
    clearLoops();
  }, [clearLoops]);

  const closeLoop = useCallback(() => {
    setWaypoints((prev) => {
      if (prev.length < 2) return prev;
      return [...prev, { id: nextId(), lat: prev[0].lat, lon: prev[0].lon }];
    });
    clearLoops();
    setOutBackActive(false);
  }, [clearLoops]);

  const reverseRoute = useCallback(() => {
    setWaypoints((prev) => (prev.length < 2 ? prev : [...prev].reverse()));
    clearLoops();
  }, [clearLoops]);

  const outAndBack = useCallback(() => {
    setWaypoints((prev) => {
      if (prev.length < 2) return prev;
      const reversed = [...prev].reverse().slice(1).map((wp) => ({ ...wp, id: nextId() }));
      return [...prev, ...reversed];
    });
    clearLoops();
    setOutBackActive(true); // intentionally stays true after this structural change
  }, [clearLoops]);

  const undoWaypoint = useCallback(() => {
    setWaypoints((prev) => prev.slice(0, -1));
    clearLoops();
    setOutBackActive(false);
  }, [clearLoops]);

  const loadRoute = useCallback((wps: Array<{ lat: number; lon: number }>) => {
    userSetStartRef.current = false;
    setWaypoints(wps.map((wp) => ({ id: nextId(), lat: wp.lat, lon: wp.lon })));
    clearLoops();
    setOutBackActive(false);
  }, [clearLoops]);

  const clear = useCallback(() => {
    userSetStartRef.current = false;
    setWaypoints([]);
    setOutBackActive(false);
    setRoute(null);
    setCamerasOnRoute([]);
    setRouteStats(null);
    setError(null);
    clearLoops();
  }, [clearLoops]);

  // ── Route handlers ────────────────────────────────────────────────────────────

  const generateLoop = useCallback(async (start: Waypoint, targetMiles: number): Promise<boolean> => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiFetchLoop(start, targetMiles, mode, avoidCameras);
      const first = result.options[0];
      if (!first) { setError("No loop route found. Try a different distance."); return false; }
      setLoopOptions(result.options);
      setActiveLoopIdx(0);
      setRoute(first.route);
      setWaypoints([{ id: nextId(), lat: start.lat, lon: start.lon }]);
      setCamerasOnRoute(first.camerasOnRoute);
      setRouteStats({
        length: first.actualMiles,
        camerasNearby: result.camerasNearby,
        camerasOnRoute: first.camerasOnRoute.length,
      });
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setLoading(false);
    }
  }, [mode, avoidCameras]);

  const selectLoop = useCallback((idx: number) => {
    const opt = loopOptions[idx];
    if (!opt) return;
    setActiveLoopIdx(idx);
    setRoute(opt.route);
    setCamerasOnRoute(opt.camerasOnRoute);
    setRouteStats((s) => ({
      length: opt.actualMiles,
      camerasNearby: s?.camerasNearby ?? 0,
      camerasOnRoute: opt.camerasOnRoute.length,
    }));
  }, [loopOptions]);

  const exportGPX = useCallback(() => {
    if (!route) return;
    const blob = buildGPXBlob(route, mode);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "deflock-fitness-route.gpx";
    a.click();
    URL.revokeObjectURL(url);
  }, [route, mode]);

  const googleMapsUrl = useMemo(
    () => (route ? buildGoogleMapsUrl(route, mode) : null),
    [route, mode]
  );

  return {
    // Waypoint state
    waypoints,
    outBackActive,
    userSetStartRef,
    // Waypoint handlers
    addWaypoint,
    insertWaypoint,
    updateWaypoint,
    removeWaypoint,
    setStart,
    setEnd,
    setGpsStart,
    closeLoop,
    reverseRoute,
    outAndBack,
    undoWaypoint,
    loadRoute,
    clear,
    // Route state
    route,
    camerasOnRoute,
    loading,
    error,
    routeStats,
    loopOptions,
    activeLoopIdx,
    // Route handlers
    generateLoop,
    selectLoop,
    exportGPX,
    googleMapsUrl,
  };
}
