export interface NominatimResult {
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

export function formatLabel(s: NominatimResult): { primary: string; secondary: string } {
  const a = s.address || {};
  const street = [a.house_number, a.road].filter(Boolean).join(" ");
  const locality = a.city || a.town || a.village || a.suburb || "";
  // Named places (shops, parks, etc.) go by their name, not their street address.
  const primary = a.name || street || s.display_name.split(",")[0];
  const secondary = [a.name ? street : null, locality, a.state, a.postcode].filter(Boolean).join(", ");
  return { primary, secondary };
}

function viewboxCenter(viewbox: string): { lat: number; lon: number } | null {
  const parts = viewbox.split(",").map(Number);
  if (parts.length !== 4 || parts.some(isNaN)) return null;
  const [lonMin, latMin, lonMax, latMax] = parts;
  return { lat: (latMin + latMax) / 2, lon: (lonMin + lonMax) / 2 };
}

function distSq(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dlat = lat1 - lat2;
  const dlon = (lon1 - lon2) * Math.cos((lat1 * Math.PI) / 180);
  return dlat * dlat + dlon * dlon;
}

export interface GeoPoint { lat: number; lon: number; }

// Equirectangular approximation — plenty accurate for a ~20 mi radius check.
const MILES_PER_DEGREE = 69.0;
function distMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dlat = (lat1 - lat2) * MILES_PER_DEGREE;
  const dlon = (lon1 - lon2) * MILES_PER_DEGREE * Math.cos((lat1 * Math.PI) / 180);
  return Math.sqrt(dlat * dlat + dlon * dlon);
}

export async function nominatim(
  q: string,
  viewbox: string | null,
  bounded: boolean,
  limit = 5,
  origin: GeoPoint | null = null,
  maxMiles = 0
): Promise<NominatimResult[]> {
  const p = new URLSearchParams({ q, format: "json", limit: String(limit), countrycodes: "us", addressdetails: "1" });
  if (viewbox) {
    p.set("viewbox", viewbox);
    if (bounded) p.set("bounded", "1");
  }
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${p}`, {
    headers: { "Accept-Language": "en" },
  });
  if (!res.ok) throw new Error(`Geocoding failed: ${res.status}`);
  const data: unknown = await res.json();
  let results = Array.isArray(data) ? (data as NominatimResult[]) : [];
  // Drop anything beyond maxMiles of the origin (e.g. the start waypoint).
  if (origin && maxMiles > 0) {
    results = results.filter(
      (r) => distMiles(parseFloat(r.lat), parseFloat(r.lon), origin.lat, origin.lon) <= maxMiles
    );
  }
  // Sort by proximity to map center so the nearest match ranks first.
  const center = viewbox ? viewboxCenter(viewbox) : null;
  if (center) {
    results.sort((a, b) =>
      distSq(parseFloat(a.lat), parseFloat(a.lon), center.lat, center.lon) -
      distSq(parseFloat(b.lat), parseFloat(b.lon), center.lat, center.lon)
    );
  }
  return results;
}

export async function reverseGeocode(lat: number, lon: number): Promise<string> {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&addressdetails=1`,
    { headers: { "Accept-Language": "en" } }
  );
  const d = await res.json() as { address?: Record<string, string>; display_name?: string };
  const a = d.address || {};
  const street = [a.house_number, a.road].filter(Boolean).join(" ");
  const city = a.city || a.town || a.village || a.suburb || "";
  return (
    [street || a.name || d.display_name?.split(",")[0] || "", city]
      .filter(Boolean)
      .join(", ") || "Current Location"
  );
}
