import type { SavedRoute } from "../types";

export const LS_KEY = "deflockFitness_savedRoutes";

export function loadFromLocalStorage(): SavedRoute[] {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || "[]");
  } catch {
    return [];
  }
}

export function saveToLocalStorage(routes: SavedRoute[]): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(routes));
  } catch {}
}

export function clearLocalStorage(): void {
  localStorage.removeItem(LS_KEY);
}

async function authHeaders(getToken: () => Promise<string | null>): Promise<Record<string, string>> {
  const token = await getToken();
  if (!token) throw new Error("Not authenticated");
  return { Authorization: `Bearer ${token}` };
}

export async function fetchRemoteRoutes(getToken: () => Promise<string | null>): Promise<SavedRoute[]> {
  const auth = await authHeaders(getToken);
  const res = await fetch("/api/routes", { headers: auth });
  if (!res.ok) throw new Error(`Failed to load routes: ${res.status}`);
  const data: unknown = await res.json();
  return Array.isArray(data) ? (data as SavedRoute[]) : [];
}

export async function migrateLocalToRemote(
  getToken: () => Promise<string | null>
): Promise<SavedRoute[]> {
  const local = loadFromLocalStorage();
  if (!local.length) return [];
  const auth = await authHeaders(getToken);
  // Only clear localStorage after every upload succeeds — preserve local data on any failure.
  const results = await Promise.all(
    local.map((r) =>
      fetch("/api/routes", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...auth },
        body: JSON.stringify({ name: r.name, waypoints: r.waypoints, mode: r.mode, miles: r.actualMiles }),
      }).then((res) => res.ok, () => false)
    )
  );
  if (!results.every(Boolean)) throw new Error("Migration failed; local routes preserved");
  clearLocalStorage();
  const res = await fetch("/api/routes", { headers: auth });
  if (!res.ok) throw new Error(`Failed to reload routes: ${res.status}`);
  const data: unknown = await res.json();
  return Array.isArray(data) ? (data as SavedRoute[]) : [];
}

export async function saveRemoteRoute(
  body: { name: string; waypoints: Array<{ lat: number; lon: number }>; mode: string; miles: number },
  getToken: () => Promise<string | null>
): Promise<{ id: number | string }> {
  const auth = await authHeaders(getToken);
  const res = await fetch("/api/routes", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...auth },
    body: JSON.stringify(body),
  });
  return res.json() as Promise<{ id: number | string }>;
}

export async function deleteRemoteRoute(
  id: number | string,
  getToken: () => Promise<string | null>
): Promise<void> {
  const auth = await authHeaders(getToken);
  const res = await fetch(`/api/routes/${id}`, { method: "DELETE", headers: auth });
  if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
}
