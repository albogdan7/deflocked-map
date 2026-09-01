import { useState, useCallback, useEffect } from "react";
import {
  loadFromLocalStorage,
  saveToLocalStorage,
  fetchRemoteRoutes,
  migrateLocalToRemote,
  saveRemoteRoute,
  deleteRemoteRoute,
} from "../api/savedRoutes";
import type { SavedRoute } from "../types";

interface SaveBody {
  name: string;
  waypoints: Array<{ lat: number; lon: number }>;
  mode: string;
  miles: number;
}

export function useSavedRoutes(
  isSignedIn: boolean | undefined,
  userId: string | null,
  getToken: () => Promise<string | null>
) {
  const [savedRoutes, setSavedRoutes] = useState<SavedRoute[]>([]);

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

  const save = useCallback(async (body: SaveBody) => {
    if (isSignedIn && userId) {
      try {
        const { id } = await saveRemoteRoute(body, getToken);
        const entry: SavedRoute = {
          id,
          name: body.name,
          waypoints: body.waypoints,
          mode: body.mode,
          actualMiles: body.miles,
          date: new Date().toLocaleDateString(),
        };
        setSavedRoutes((prev) => [entry, ...prev].slice(0, 50));
      } catch {}
    } else {
      const entry: SavedRoute = {
        id: Date.now(),
        name: body.name,
        waypoints: body.waypoints,
        mode: body.mode,
        actualMiles: body.miles,
        date: new Date().toLocaleDateString(),
      };
      setSavedRoutes((prev) => {
        const updated = [entry, ...prev].slice(0, 50);
        saveToLocalStorage(updated);
        return updated;
      });
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

  return { savedRoutes, save, remove };
}
