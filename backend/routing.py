import math
import os
import random
import requests

VALHALLA_URL = os.getenv("VALHALLA_URL", "https://valhalla1.openstreetmap.de")
MAX_EXCLUDE = 75


# ── Polyline decoder (Valhalla precision=6) ─────────────────────────────────

def decode_polyline(encoded: str, precision: int = 6) -> list:
    factor = 10 ** precision
    result = []
    index = lat = lng = 0
    while index < len(encoded):
        for is_lat in (True, False):
            shift = acc = 0
            while True:
                b = ord(encoded[index]) - 63
                index += 1
                acc |= (b & 0x1F) << shift
                shift += 5
                if b < 0x20:
                    break
            val = (~acc >> 1) if (acc & 1) else (acc >> 1)
            if is_lat:
                lat += val
                cur_lat = lat / factor
            else:
                lng += val
                cur_lng = lng / factor
        result.append((cur_lat, cur_lng))
    return result


# ── Distance helpers ─────────────────────────────────────────────────────────

def _haversine(lat1, lon1, lat2, lon2) -> float:
    R = 6371000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _bearing_to(cam_lat, cam_lon, pt_lat, pt_lon) -> float:
    """Compass bearing (0-360°) from camera to a point."""
    lat1, lat2 = math.radians(cam_lat), math.radians(pt_lat)
    dlon = math.radians(pt_lon - cam_lon)
    y = math.sin(dlon) * math.cos(lat2)
    x = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(dlon)
    return math.degrees(math.atan2(y, x)) % 360


def cameras_near_route(route_coords: list, cameras: list, radius_m: float = 75) -> list:
    """
    Return cameras whose detection zone intersects the route.
    For cameras with a known direction, only count them when the route
    passes through their FOV cone (default 70°).  Unknown-direction
    cameras fall back to the plain distance check.
    """
    FOV_DEG = 70.0
    near = []
    for cam in cameras:
        coords = cam["geometry"]["coordinates"]
        cam_lon, cam_lat = coords[0], coords[1]
        props = cam.get("properties", {})

        direction = props.get("direction")
        try:
            bearing = float(direction) if direction is not None else None
        except (TypeError, ValueError):
            bearing = None

        for lat, lon in route_coords:
            if _haversine(lat, lon, cam_lat, cam_lon) > radius_m:
                continue

            if bearing is not None:
                # Check that this route point is inside the camera's FOV cone
                pt_bearing = _bearing_to(cam_lat, cam_lon, lat, lon)
                angle_diff = abs((pt_bearing - bearing + 180) % 360 - 180)
                if angle_diff > FOV_DEG / 2:
                    continue

            near.append(cam)
            break
    return near


# ── Camera exclusion polygons ─────────────────────────────────────────────────
# Hard exclusion zones (Valhalla exclude_polygons) are honoured even for
# pedestrian/bicycle costing, unlike the soft-penalty exclude_locations.

def _camera_exclusion_polygons(cameras: list, radius_m: float = 90) -> list:
    """
    Return lon/lat closed-ring polygons for each camera.

    90m radius gives an octagon apothem of ~83m (0.924 × 90), which clears
    the 75m detection radius with margin — any rung below ~81m falls inside
    the detection zone and produces routes that re-detect the same camera.

    Directional cameras use a wedge (pie-slice) matching their FOV so routes
    can thread behind the camera without triggering the exclusion.  Unknown-
    direction cameras use a full octagon.
    """
    R = 6371000
    POLY_FOV = 80.0  # slightly wider than the 70° detection cone for margin
    polys = []
    for cam in cameras[:MAX_EXCLUDE]:
        lon = float(cam["geometry"]["coordinates"][0])
        lat = float(cam["geometry"]["coordinates"][1])
        dlat = (radius_m / R) * (180 / math.pi)
        dlon = dlat / max(math.cos(math.radians(lat)), 1e-9)

        props = cam.get("properties", {})
        direction = props.get("direction")
        try:
            bearing = float(direction) if direction is not None else None
        except (TypeError, ValueError):
            bearing = None

        if bearing is not None:
            # Wedge polygon: apex at camera, arc spans the FOV cone.
            # Compass bearing: sin = East component, cos = North component.
            left_deg = (bearing - POLY_FOV / 2 + 360) % 360
            steps = 8
            pts = [[lon, lat]]
            for i in range(steps + 1):
                ang = math.radians(left_deg + (POLY_FOV / steps) * i)
                pts.append([lon + dlon * math.sin(ang), lat + dlat * math.cos(ang)])
            pts.append([lon, lat])
        else:
            pts = [
                [lon + dlon * math.cos(math.radians(i * 45)),
                 lat + dlat * math.sin(math.radians(i * 45))]
                for i in range(8)
            ]
            pts.append(pts[0])

        polys.append(pts)
    return polys


# ── Valhalla routing ─────────────────────────────────────────────────────────

def get_route(waypoints: list, mode: str, exclude_cameras: list) -> dict:
    """
    waypoints: [[lat, lon], ...]  — at least 2 points
    Returns raw Valhalla response dict.
    """
    if len(waypoints) < 2:
        raise ValueError("need at least 2 waypoints")

    costing = "bicycle" if mode == "bike" else "pedestrian"

    locations = []
    for i, (lat, lon) in enumerate(waypoints):
        loc = {"lat": float(lat), "lon": float(lon)}
        loc["type"] = "break" if (i == 0 or i == len(waypoints) - 1) else "through"
        locations.append(loc)

    body = {
        "locations": locations,
        "costing": costing,
        "directions_options": {"units": "miles"},
    }

    if exclude_cameras:
        # Return None (not a fallback) so callers can try a different bearing
        # rather than surfacing a camera-filled path.
        body["exclude_polygons"] = _camera_exclusion_polygons(exclude_cameras)
        resp = requests.post(f"{VALHALLA_URL}/route", json=body, timeout=10)
        if resp.ok:
            return resp.json()
        return None
    else:
        resp = requests.post(f"{VALHALLA_URL}/route", json=body, timeout=10)
        resp.raise_for_status()
        return resp.json()


# ── Loop generation ──────────────────────────────────────────────────────────

def _circle_waypoints(start_lat, start_lon, target_miles, n_points, bearing, scale=1.0):
    # Roads run ~30% longer than straight-line arcs, so pre-shrink radius.
    radius_miles = (target_miles * scale) / (2 * math.pi * 1.3)
    r_lat = radius_miles / 69.0
    r_lon = radius_miles / (69.0 * math.cos(math.radians(start_lat)))

    pts = [[start_lat, start_lon]]
    for i in range(n_points):
        angle = bearing + (2 * math.pi * i / n_points)
        pts.append([start_lat + r_lat * math.sin(angle),
                    start_lon + r_lon * math.cos(angle)])
    pts.append([start_lat, start_lon])
    return pts


def decode_trip_coords(trip: dict) -> list:
    coords = []
    for leg in trip.get("legs", []):
        enc = leg.get("shape", "")
        if enc:
            coords.extend(decode_polyline(enc))
    return coords


def _cam_key(cam) -> str:
    """Stable identity key for a camera feature."""
    osm_id = cam["properties"].get("osmId")
    if osm_id:
        return str(osm_id)
    lon, lat = cam["geometry"]["coordinates"][0], cam["geometry"]["coordinates"][1]
    return f"{round(lat, 5)},{round(lon, 5)}"


def _loop_one_bearing(start_lat, start_lon, target_miles, mode, nearby_cameras, bearing):
    """
    Iterative avoidance for one bearing direction.
    Returns (result, wps, actual_miles, cameras_remaining_count).
    """
    MAX_AVOIDANCE_PASSES = 3
    n_points = 4

    def route_with_scale(exclusions):
        scale = 1.0
        best = (None, None, 0.0)
        for _ in range(2):
            wps = _circle_waypoints(start_lat, start_lon, target_miles, n_points, bearing, scale)
            result = get_route(wps, mode, exclusions)
            if result is None:
                # Exclusion polygons blocked all paths — signal failure to caller.
                return (None, wps, 0.0)
            actual = result.get("trip", {}).get("summary", {}).get("length", 0.0)
            best = (result, wps, actual)
            if actual <= 0:
                break
            if abs(target_miles / actual - 1.0) < 0.08:
                break
            scale *= target_miles / actual
        return best

    if not nearby_cameras:
        r, w, a = route_with_scale([])
        return r, w, a, 0

    excluded_keys: set = set()
    excluded_cams: list = []
    result = wps = None
    actual = 0.0
    remaining = len(nearby_cameras)

    for _ in range(MAX_AVOIDANCE_PASSES):
        result, wps, actual = route_with_scale(excluded_cams)
        if not result or actual <= 0:
            # Exclusion routing failed — fall back to no-exclusion for this bearing
            # so the caller gets a route to rank (will sort behind clean options).
            if excluded_cams:
                result, wps, actual = route_with_scale([])
                if result and actual > 0:
                    coords = decode_trip_coords(result.get("trip", {}))
                    remaining = len(cameras_near_route(coords, nearby_cameras))
            break

        coords = decode_trip_coords(result.get("trip", {}))
        on_route = cameras_near_route(coords, nearby_cameras)
        remaining = len(on_route)

        if not on_route:
            break

        new_cams = [c for c in on_route if _cam_key(c) not in excluded_keys]
        if not new_cams:
            break  # Same cameras re-detected; exclusion polygons can't route around them

        for cam in new_cams:
            excluded_keys.add(_cam_key(cam))
        excluded_cams = [c for c in nearby_cameras if _cam_key(c) in excluded_keys]

    return result, wps, actual, remaining


def generate_loop(start_lat, start_lon, target_miles, mode, nearby_cameras):
    """
    Generate up to 3 loop options using different random bearings.
    Each option gets iterative camera-avoidance passes.
    Returns a list of (valhalla_response, waypoints, actual_miles, cam_count)
    sorted by cam_count asc, then by distance-to-target asc.
    """
    MAX_BEARING_ATTEMPTS = 3
    results = []

    for _ in range(MAX_BEARING_ATTEMPTS):
        bearing = random.uniform(0, 2 * math.pi)
        result, wps, actual, cam_count = _loop_one_bearing(
            start_lat, start_lon, target_miles, mode, nearby_cameras, bearing
        )
        if result and actual > 0:
            results.append((result, wps, actual, cam_count))

    results.sort(key=lambda x: (x[3], abs(x[2] - target_miles)))
    return results


# ── Point-to-point distance-padded routing (A → B) ───────────────────────────
# Unlike generate_loop (which returns to its start), this connects a distinct
# start and end while padding the path out toward a target distance by bowing
# intermediate via-points perpendicular to the straight A→B line.

def _miles_between(lat1, lon1, lat2, lon2) -> float:
    return _haversine(lat1, lon1, lat2, lon2) / 1609.344


def _detour_waypoints(start_lat, start_lon, end_lat, end_lon,
                      amplitude_miles, side, n_points, alternate, rot_deg=0.0):
    """
    Build [start, via…, end] with interior via-points bowed off the A→B line.
    Bow follows a sine envelope (0 at both ends, max in middle). `side` is +1/-1;
    when `alternate`, successive vias flip sides (S-curve). `rot_deg` rotates the
    bow direction off the perpendicular, so the detour can aim in many directions
    (used to steer toward camera-sparse areas), not just left/right.
    """
    if amplitude_miles <= 0 or n_points <= 0:
        return [[start_lat, start_lon], [end_lat, end_lon]]

    mid_lat = (start_lat + end_lat) / 2.0
    cos_mid = math.cos(math.radians(mid_lat)) or 1e-6

    # Unit vector along A→B in equal-distance space (lon scaled by cos(lat)).
    dlat = end_lat - start_lat
    dlon_scaled = (end_lon - start_lon) * cos_mid
    seg = math.hypot(dlat, dlon_scaled) or 1e-9
    ua_lat, ua_lon = dlat / seg, dlon_scaled / seg
    # Perpendicular (rotate 90°) in the same scaled space, then rotate by rot_deg.
    p_lat, p_lon = -ua_lon, ua_lat
    if rot_deg:
        cr, sr = math.cos(math.radians(rot_deg)), math.sin(math.radians(rot_deg))
        p_lat, p_lon = p_lat * cr - p_lon * sr, p_lat * sr + p_lon * cr

    pts = [[start_lat, start_lon]]
    for i in range(1, n_points + 1):
        f = i / (n_points + 1)
        base_lat = start_lat + dlat * f
        base_lon = start_lon + (end_lon - start_lon) * f
        s = side * (-1 if (alternate and i % 2 == 0) else 1)
        off = amplitude_miles * math.sin(math.pi * f) * s  # miles
        d_lat = (off / 69.0) * p_lat
        d_lon = (off / 69.0) * p_lon / cos_mid
        pts.append([base_lat + d_lat, base_lon + d_lon])
    pts.append([end_lat, end_lon])
    return pts


def _route_one_variant(start_lat, start_lon, end_lat, end_lon,
                       target_miles, mode, nearby_cameras, side, n_points, alternate, rot_deg=0.0):
    """A→B analogue of _loop_one_bearing for a single detour shape."""
    MAX_AVOIDANCE_PASSES = 3
    direct_road = _miles_between(start_lat, start_lon, end_lat, end_lon) * 1.3

    def route_with_scale(exclusions):
        # Initial guess: bow just enough to add the missing length.
        amp = max(0.0, target_miles - direct_road) * 0.6
        best = (None, None, 0.0)
        for _ in range(3):
            wps = _detour_waypoints(start_lat, start_lon, end_lat, end_lon,
                                    amp, side, n_points, alternate, rot_deg)
            result = get_route(wps, mode, exclusions)
            if result is None:
                return (None, wps, 0.0)
            actual = result.get("trip", {}).get("summary", {}).get("length", 0.0)
            best = (result, wps, actual)
            if actual <= 0 or amp <= 0:
                break
            if abs(target_miles / actual - 1.0) < 0.08:
                break
            # Scale by the *extra* length ratio — total length is nonlinear in amp.
            extra_actual = max(0.05, actual - direct_road)
            extra_target = max(0.0, target_miles - direct_road)
            amp *= (extra_target / extra_actual)
            amp = max(0.0, min(amp, target_miles))  # clamp
        return best

    if not nearby_cameras:
        r, w, a = route_with_scale([])
        return r, w, a, 0

    excluded_keys: set = set()
    excluded_cams: list = []
    result = wps = None
    actual = 0.0
    remaining = len(nearby_cameras)

    for _ in range(MAX_AVOIDANCE_PASSES):
        result, wps, actual = route_with_scale(excluded_cams)
        if not result or actual <= 0:
            if excluded_cams:
                result, wps, actual = route_with_scale([])
                if result and actual > 0:
                    coords = decode_trip_coords(result.get("trip", {}))
                    remaining = len(cameras_near_route(coords, nearby_cameras))
            break

        coords = decode_trip_coords(result.get("trip", {}))
        on_route = cameras_near_route(coords, nearby_cameras)
        remaining = len(on_route)
        if not on_route:
            break

        new_cams = [c for c in on_route if _cam_key(c) not in excluded_keys]
        if not new_cams:
            break
        for cam in new_cams:
            excluded_keys.add(_cam_key(cam))
        excluded_cams = [c for c in nearby_cameras if _cam_key(c) in excluded_keys]

    return result, wps, actual, remaining


def _direct_route(start_lat, start_lon, end_lat, end_lon, mode, nearby_cameras):
    """Plain A→B route (camera-avoiding if possible). Demo-safe fallback."""
    wps = [[start_lat, start_lon], [end_lat, end_lon]]
    try:
        result = get_route(wps, mode, [])
    except Exception:
        return None
    if not result:
        return None
    actual = result.get("trip", {}).get("summary", {}).get("length", 0.0)
    coords = decode_trip_coords(result.get("trip", {}))
    on_route = cameras_near_route(coords, nearby_cameras) if nearby_cameras else []
    if on_route:
        try:
            avoided = get_route(wps, mode, on_route)
        except Exception:
            avoided = None
        if avoided:
            a2 = avoided.get("trip", {}).get("summary", {}).get("length", 0.0)
            if a2 > 0:
                result, actual = avoided, a2
                coords = decode_trip_coords(result.get("trip", {}))
                on_route = cameras_near_route(coords, nearby_cameras)
    return result, wps, actual, len(on_route)


def _via_path_points(via_wps, step_miles=0.15):
    """Densify the straight segments between via waypoints into (lat, lon) samples."""
    pts = []
    for i in range(len(via_wps) - 1):
        la1, lo1 = via_wps[i]
        la2, lo2 = via_wps[i + 1]
        seg = _miles_between(la1, lo1, la2, lo2)
        n = max(1, int(seg / step_miles))
        for k in range(n):
            f = k / n
            pts.append((la1 + (la2 - la1) * f, lo1 + (lo2 - lo1) * f))
    pts.append((via_wps[-1][0], via_wps[-1][1]))
    return pts


def _detour_camera_score(via_wps, cameras, radius_m=110.0):
    """
    Free (no Valhalla) proxy for how many cameras a detour shape will pass:
    count cameras whose zone the straight via-path comes within radius_m of.
    Lower is better. Lets us rank many shapes cheaply and only route the best.
    """
    if not cameras:
        return 0
    samples = _via_path_points(via_wps)
    count = 0
    for cam in cameras:
        clat = cam["geometry"]["coordinates"][1]
        clon = cam["geometry"]["coordinates"][0]
        if any(_haversine(la, lo, clat, clon) <= radius_m for la, lo in samples):
            count += 1
    return count


def generate_route(start_lat, start_lon, end_lat, end_lon, target_miles, mode, nearby_cameras):
    """
    Generate A→B options padded toward target_miles. Instead of a few fixed
    detour shapes, sweep many candidate directions/shapes, score each by camera
    exposure for free, and only route the sparsest few (same Valhalla budget,
    smarter shapes). Always includes a direct route. Sorted by camera count asc,
    then distance-to-target asc.
    """
    N_ROUTED = 3  # how many low-exposure candidates we actually route

    # Candidate pool: sweep bow directions (side × rotation off perpendicular)
    # and a couple of shapes. Scored geometrically, so the pool can be large.
    est_amp = max(0.05, (target_miles - _miles_between(start_lat, start_lon, end_lat, end_lon) * 1.3) * 0.6)
    shapes = [(1, False), (2, True), (2, False)]  # (n_points, alternate)
    scored = []
    for side in (1, -1):
        for rot_deg in (0.0, 30.0, -30.0, 60.0, -60.0):
            for n_points, alternate in shapes:
                via = _detour_waypoints(start_lat, start_lon, end_lat, end_lon,
                                        est_amp, side, n_points, alternate, rot_deg)
                score = _detour_camera_score(via, nearby_cameras)
                scored.append((score, side, rot_deg, n_points, alternate))

    # Pick the lowest-exposure candidates, keeping directions diverse.
    scored.sort(key=lambda c: c[0])
    chosen = []
    seen_dirs = set()
    for score, side, rot_deg, n_points, alternate in scored:
        dir_key = (side, rot_deg)
        if dir_key in seen_dirs:
            continue
        seen_dirs.add(dir_key)
        chosen.append((side, rot_deg, n_points, alternate))
        if len(chosen) >= N_ROUTED:
            break

    results = []
    for side, rot_deg, n_points, alternate in chosen:
        r, w, a, c = _route_one_variant(
            start_lat, start_lon, end_lat, end_lon,
            target_miles, mode, nearby_cameras, side, n_points, alternate, rot_deg
        )
        if r and a > 0:
            results.append((r, w, a, c))

    direct = _direct_route(start_lat, start_lon, end_lat, end_lon, mode, nearby_cameras)
    if direct:
        results.append(direct)

    # De-dup near-identical distances (keep the first / better-ranked one).
    results.sort(key=lambda x: (x[3], abs(x[2] - target_miles)))
    deduped = []
    for r in results:
        if any(abs(r[2] - k[2]) < 0.05 and r[3] == k[3] for k in deduped):
            continue
        deduped.append(r)
    return deduped
