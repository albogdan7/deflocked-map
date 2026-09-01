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
  const primary = street || a.name || s.display_name.split(",")[0];
  const secondary = [locality, a.state, a.postcode].filter(Boolean).join(", ");
  return { primary, secondary };
}

export async function nominatim(
  q: string,
  viewbox: string | null,
  bounded: boolean,
  limit = 5
): Promise<NominatimResult[]> {
  const p = new URLSearchParams({ q, format: "json", limit: String(limit), countrycodes: "us", addressdetails: "1" });
  if (viewbox) {
    p.set("viewbox", viewbox);
    if (bounded) p.set("bounded", "1");
  }
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${p}`, {
    headers: { "Accept-Language": "en" },
  });
  return res.json() as Promise<NominatimResult[]>;
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
