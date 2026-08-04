import os
import threading
from contextlib import asynccontextmanager
from typing import Annotated

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import cameras as cam_store
import db
import routing

load_dotenv()


def _preload():
    try:
        count = cam_store.load_cameras()
        print(f"[cameras] loaded {count} cameras")
    except Exception as e:
        print(f"[cameras] failed to preload: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    threading.Thread(target=_preload, daemon=True).start()
    try:
        db.init_db()
        print("[db] schema ready")
    except Exception as e:
        print(f"[db] init failed: {e}")
    yield


app = FastAPI(lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Pydantic models ───────────────────────────────────────────────────────────

class RouteRequest(BaseModel):
    waypoints: list[list[float]]
    mode: str = "walk"
    avoid_cameras: bool = True


class LoopRequest(BaseModel):
    start: list[float]
    miles: float = 3.0
    mode: str = "walk"
    avoid_cameras: bool = True


class SaveRouteRequest(BaseModel):
    name: str = "Untitled Route"
    waypoints: list[dict]
    mode: str = "walk"
    miles: float = 0.0


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/api/health")
def health():
    return {"ok": True, "cameras_loaded": cam_store._loaded}


@app.get("/api/cameras")
def get_cameras(
    minLon: float = Query(...),
    minLat: float = Query(...),
    maxLon: float = Query(...),
    maxLat: float = Query(...),
):
    features = cam_store.get_in_bbox(minLon, minLat, maxLon, maxLat)
    return {"type": "FeatureCollection", "features": features}


def _bbox_from_waypoints(waypoints: list[list[float]], pad: float = 0.015):
    lats = [wp[0] for wp in waypoints]
    lons = [wp[1] for wp in waypoints]
    return (min(lons) - pad, min(lats) - pad, max(lons) + pad, max(lats) + pad)


@app.post("/api/route")
def post_route(body: RouteRequest):
    if len(body.waypoints) < 2:
        raise HTTPException(status_code=400, detail="waypoints array with ≥ 2 points required")

    min_lon, min_lat, max_lon, max_lat = _bbox_from_waypoints(body.waypoints)
    nearby = cam_store.get_in_bbox(min_lon, min_lat, max_lon, max_lat)

    try:
        first_pass = routing.get_route(body.waypoints, body.mode, [])
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))

    trip = first_pass.get("trip", {})
    if not trip.get("legs"):
        raise HTTPException(status_code=404, detail="no route found")

    all_coords = routing.decode_trip_coords(trip)

    if body.avoid_cameras and nearby:
        on_route = routing.cameras_near_route(all_coords, nearby)
        if on_route:
            try:
                second_pass = routing.get_route(body.waypoints, body.mode, on_route)
                if second_pass is None:
                    second_pass = first_pass
            except Exception:
                second_pass = first_pass
            trip = second_pass.get("trip", {})
            all_coords = routing.decode_trip_coords(trip)

    cameras_on = routing.cameras_near_route(all_coords, nearby) if body.avoid_cameras else []

    return {
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
    }


@app.post("/api/loop")
def post_loop(body: LoopRequest):
    if len(body.start) < 2:
        raise HTTPException(status_code=400, detail="start [lat, lon] required")

    start_lat, start_lon = float(body.start[0]), float(body.start[1])
    target_miles = float(body.miles)

    radius_deg = (target_miles / (2 * 3.14159 * 69.0)) * 1.5
    nearby = cam_store.get_in_bbox(
        start_lon - radius_deg, start_lat - radius_deg,
        start_lon + radius_deg, start_lat + radius_deg,
    )

    try:
        all_results = routing.generate_loop(
            start_lat, start_lon, target_miles, body.mode,
            nearby if body.avoid_cameras else [],
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))

    if not all_results:
        raise HTTPException(status_code=502, detail="loop generation failed")

    options = []
    for valhalla_resp, wps, actual_miles, _ in all_results:
        trip = valhalla_resp.get("trip", {})
        all_coords = routing.decode_trip_coords(trip)
        cameras_on = routing.cameras_near_route(all_coords, nearby) if body.avoid_cameras else []
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

    return {"options": options, "cameras_nearby": len(nearby)}


@app.get("/api/routes")
def get_routes(x_user_id: Annotated[str, Header()] = "anonymous"):
    rows = db.fetch_routes(x_user_id)
    return [{
        "id": r[0],
        "name": r[1],
        "waypoints": r[2],
        "mode": r[3],
        "actualMiles": r[4],
        "date": r[5].strftime("%-m/%-d/%Y"),
    } for r in rows]


@app.post("/api/routes", status_code=201)
def save_route(body: SaveRouteRequest, x_user_id: Annotated[str, Header()] = "anonymous"):
    new_id = db.insert_route(
        user_id=x_user_id,
        name=body.name,
        waypoints=body.waypoints,
        mode=body.mode,
        miles=body.miles,
    )
    return {"id": new_id}


@app.delete("/api/routes/{route_id}")
def delete_route(route_id: int, x_user_id: Annotated[str, Header()] = "anonymous"):
    db.delete_route(route_id, x_user_id)
    return {"ok": True}


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("app:app", host="0.0.0.0", port=port)
