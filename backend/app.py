import os
import threading
from flask import Flask, jsonify, request
from flask_cors import CORS
from dotenv import load_dotenv

import cameras as cam_store
import routing
import db

load_dotenv()

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})


def _preload():
    try:
        count = cam_store.load_cameras()
        print(f"[cameras] loaded {count} cameras")
    except Exception as e:
        print(f"[cameras] failed to preload: {e}")


threading.Thread(target=_preload, daemon=True).start()

try:
    db.init_db()
    print("[db] schema ready")
except Exception as e:
    print(f"[db] init failed: {e}")


@app.get("/api/health")
def health():
    return jsonify({"ok": True, "cameras_loaded": cam_store._loaded})


@app.get("/api/cameras")
def get_cameras():
    try:
        min_lon = float(request.args["minLon"])
        min_lat = float(request.args["minLat"])
        max_lon = float(request.args["maxLon"])
        max_lat = float(request.args["maxLat"])
    except (KeyError, ValueError):
        return jsonify({"error": "minLon, minLat, maxLon, maxLat required"}), 400

    features = cam_store.get_in_bbox(min_lon, min_lat, max_lon, max_lat)
    return jsonify({"type": "FeatureCollection", "features": features})


def _bbox_from_waypoints(waypoints, pad=0.015):
    lats = [wp[0] for wp in waypoints]
    lons = [wp[1] for wp in waypoints]
    return (min(lons) - pad, min(lats) - pad, max(lons) + pad, max(lats) + pad)


@app.post("/api/route")
def post_route():
    body = request.get_json(silent=True) or {}
    waypoints = body.get("waypoints")
    mode = body.get("mode", "walk")
    avoid = bool(body.get("avoid_cameras", True))

    if not waypoints or len(waypoints) < 2:
        return jsonify({"error": "waypoints array with ≥ 2 points required"}), 400

    min_lon, min_lat, max_lon, max_lat = _bbox_from_waypoints(waypoints)
    nearby = cam_store.get_in_bbox(min_lon, min_lat, max_lon, max_lat)

    try:
        first_pass = routing.get_route(waypoints, mode, [])
    except Exception as e:
        return jsonify({"error": str(e)}), 502

    trip = first_pass.get("trip", {})
    if not trip.get("legs"):
        return jsonify({"error": "no route found"}), 404

    all_coords = routing.decode_trip_coords(trip)

    if avoid and nearby:
        on_route = routing.cameras_near_route(all_coords, nearby)
        if on_route:
            try:
                second_pass = routing.get_route(waypoints, mode, on_route)
                if second_pass is None:
                    second_pass = first_pass
            except Exception:
                second_pass = first_pass
            trip = second_pass.get("trip", {})
            all_coords = routing.decode_trip_coords(trip)

    cameras_on = routing.cameras_near_route(all_coords, nearby) if avoid else []

    return jsonify({
        "route": {
            "type": "Feature",
            "geometry": {
                "type": "LineString",
                "coordinates": [[lon, lat] for lat, lon in all_coords],
            },
            "properties": {"summary": trip.get("summary", {})},
        },
        "cameras_on_route": cameras_on,
        "cameras_nearby": len(nearby),
    })


@app.post("/api/loop")
def post_loop():
    body = request.get_json(silent=True) or {}
    start = body.get("start")
    miles = body.get("miles", 3.0)
    mode = body.get("mode", "walk")
    avoid = bool(body.get("avoid_cameras", True))

    if not start or len(start) < 2:
        return jsonify({"error": "start [lat, lon] required"}), 400

    start_lat, start_lon = float(start[0]), float(start[1])
    target_miles = float(miles)

    # Estimate bbox for camera lookup (loop radius in degrees, generous pad)
    radius_deg = (target_miles / (2 * 3.14159 * 69.0)) * 1.5
    nearby = cam_store.get_in_bbox(
        start_lon - radius_deg, start_lat - radius_deg,
        start_lon + radius_deg, start_lat + radius_deg,
    )

    try:
        all_results = routing.generate_loop(
            start_lat, start_lon, target_miles, mode,
            nearby if avoid else [],
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 502

    if not all_results:
        return jsonify({"error": "loop generation failed"}), 502

    options = []
    for valhalla_resp, wps, actual_miles, _ in all_results:
        trip = valhalla_resp.get("trip", {})
        all_coords = routing.decode_trip_coords(trip)
        cameras_on = routing.cameras_near_route(all_coords, nearby) if avoid else []
        options.append({
            "route": {
                "type": "Feature",
                "geometry": {
                    "type": "LineString",
                    "coordinates": [[lon, lat] for lat, lon in all_coords],
                },
                "properties": {"summary": trip.get("summary", {})},
            },
            "waypoints": wps,
            "actual_miles": actual_miles,
            "cameras_on_route": cameras_on,
        })

    return jsonify({
        "options": options,
        "cameras_nearby": len(nearby),
    })


@app.get("/api/routes")
def get_routes():
    user_id = request.headers.get("X-User-Id", "anonymous")
    rows = db.fetch_routes(user_id)
    return jsonify([{
        "id": r[0],
        "name": r[1],
        "waypoints": r[2],
        "mode": r[3],
        "actualMiles": r[4],
        "date": r[5].strftime("%-m/%-d/%Y"),
    } for r in rows])


@app.post("/api/routes")
def save_route():
    user_id = request.headers.get("X-User-Id", "anonymous")
    body = request.get_json(silent=True) or {}
    new_id = db.insert_route(
        user_id=user_id,
        name=body.get("name") or "Untitled Route",
        waypoints=body.get("waypoints", []),
        mode=body.get("mode", "walk"),
        miles=float(body.get("miles", 0)),
    )
    return jsonify({"id": new_id}), 201


@app.delete("/api/routes/<int:route_id>")
def delete_route(route_id):
    user_id = request.headers.get("X-User-Id", "anonymous")
    db.delete_route(route_id, user_id)
    return jsonify({"ok": True})


if __name__ == "__main__":
    port = int(os.getenv("PORT", os.getenv("FLASK_PORT", 8000)))
    app.run(host="0.0.0.0", port=port)
