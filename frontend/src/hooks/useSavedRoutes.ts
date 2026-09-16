import { useState, useCallback, useEffect } from "react";
import {
  loadFromLocalStorage,
  saveToLocalStorage,
  fetchRemoteRoutes,
  migrateLocalToRemote,
  saveRemoteRoute,
  updateRemoteRoute,
  deleteRemoteRoute,
} from "../api/savedRoutes";
import type { RouteGeoJson, RouteStats, SavedRoute } from "../types";

interface SaveBody {
  name: string;
  waypoints: Array<{ lat: number; lon: number }>;
  mode: string;
  miles: number;
  geometry?: RouteGeoJson | null;
  stats?: RouteStats | null;
}

export function useSavedRoutes(
  isSignedIn: boolean | undefined,
  userId: string | null,
  getToken: () => Promise<string | null>
) {
  const [savedRoutes, setSavedRoutes] = useState<SavedRoute[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isSignedIn === undefined) return;
    if (!isSignedIn || !userId) {
      setSavedRoutes(loadFromLocalStorage());
      return;
    }
    fetchRemoteRoutes(getToken)
      .then((rows) => {
        setSavedRoutes(rows);
        const local = loadFromLocalStorage();
        if (!local.length) return;
        migrateLocalToRemote(getToken)
          .then(setSavedRoutes)
          .catch(() => {});
      })
      .catch(() => {});
  }, [isSignedIn, userId, getToken]);

  const save = useCallback(async (body: SaveBody): Promise<SavedRoute> => {
    setBusy(true);
    try {
      if (isSignedIn && userId) {
        const { id } = await saveRemoteRoute(body, getToken);
        const entry: SavedRoute = {
          id,
          name: body.name,
          waypoints: body.waypoints,
          mode: body.mode,
          actualMiles: body.miles,
          date: new Date().toLocaleDateString(),
          route: body.geometry ?? null,
          stats: body.stats ?? null,
        };
        setSavedRoutes((prev) => [entry, ...prev].slice(0, 50));
        return entry;
      }
      const entry: SavedRoute = {
        id: Date.now(),
        name: body.name,
        waypoints: body.waypoints,
        mode: body.mode,
        actualMiles: body.miles,
        date: new Date().toLocaleDateString(),
        route: body.geometry ?? null,
        stats: body.stats ?? null,
      };
      setSavedRoutes((prev) => {
        const updated = [entry, ...prev].slice(0, 50);
        saveToLocalStorage(updated);
        return updated;
      });
      return entry;
    } finally {
      setBusy(false);
    }
  }, [isSignedIn, userId, getToken]);

  const update = useCallback(async (id: number | string, body: SaveBody): Promise<void> => {
    setBusy(true);
    try {
      if (isSignedIn && userId) {
        await updateRemoteRoute(id, body, getToken);
      }
      setSavedRoutes((prev) => {
        const updated = prev.map((r) =>
          r.id === id
            ? {
                ...r,
                name: body.name,
                waypoints: body.waypoints,
                mode: body.mode,
                actualMiles: body.miles,
                route: body.geometry ?? null,
                stats: body.stats ?? null,
              }
            : r
        );
        if (!(isSignedIn && userId)) saveToLocalStorage(updated);
        return updated;
      });
    } finally {
      setBusy(false);
    }
  }, [isSignedIn, userId, getToken]);

  const remove = useCallback(async (id: number | string) => {
    const isRemote = Boolean(isSignedIn && userId);
    setSavedRoutes((prev) => {
      const updated = prev.filter((r) => r.id !== id);
      if (!isRemote) saveToLocalStorage(updated);
      return updated;
    });
    if (isRemote) {
      try {
        await deleteRemoteRoute(id, getToken);
      } catch {}
    }
  }, [isSignedIn, userId, getToken]);

  return { savedRoutes, busy, save, update, remove };
}
