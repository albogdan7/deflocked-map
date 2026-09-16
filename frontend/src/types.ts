export interface Waypoint {
  id: number;
  lat: number;
  lon: number;
}

export interface CameraFeature {
  geometry: {
    coordinates: [number, number];
  };
  properties: {
    osmId?: string;
    direction?: string | number;
    operator?: string;
    surveillanceZone?: string;
  };
}

export interface RouteGeoJson {
  geometry: {
    coordinates: [number, number][];
  };
  properties: {
    summary?: {
      length: number;
    };
  };
}

export interface LoopOption {
  route: RouteGeoJson;
  waypoints: Waypoint[];
  actualMiles: number;
  camerasOnRoute: CameraFeature[];
}

export interface RouteStats {
  length: number;
  camerasNearby: number;
  camerasOnRoute: number;
}

export interface SavedRoute {
  id: number | string;
  name: string;
  waypoints: Array<{ lat: number; lon: number }>;
  mode: string;
  actualMiles: number;
  date: string;
  // Persisted computed geometry + stats. Absent on legacy routes saved before
  // this existed — those fall back to re-routing on load.
  route?: RouteGeoJson | null;
  stats?: RouteStats | null;
}
