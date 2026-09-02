import os
import threading
from contextlib import asynccontextmanager
from typing import Annotated

import jwt
from jwt import PyJWKClient
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator

import cameras as cam_store
import db
import routing

load_dotenv()

_CLERK_ISSUER = os.getenv("CLERK_ISSUER", "https://mighty-gazelle-40.clerk.accounts.dev")
_JWKS_URL = os.getenv("CLERK_JWKS_URL", f"{_CLERK_ISSUER}/.well-known/jwks.json")
_jwks_client = PyJWKClient(_JWKS_URL)


def _get_user_id(authorization: Annotated[str, Header()] = "") -> str:
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized")
    token = authorization[7:].strip()
    try:
        signing_key = _jwks_client.get_signing_key_from_jwt(token)
        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            issuer=_CLERK_ISSUER,
            options={"require": ["exp", "iat", "sub", "iss"]},
        )
        return payload["sub"]
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")


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
_CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "").split(",") if o.strip()] or [
    "https://deflocked-map.albertbogdan2006.workers.dev",
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:5175",
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_CORS_ORIGINS,
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)


# ── Pydantic models ───────────────────────────────────────────────────────────

class WaypointItem(BaseModel):
    lat: float = Field(..., ge=-90, le=90)
    lon: float = Field(..., ge=-180, le=180)


class RouteRequest(BaseModel):
    waypoints: list[list[float]] = Field(..., min_length=2, max_length=50)
    mode: str = Field(default="walk", pattern="^(walk|bike)$")
    avoid_cameras: bool = True

    @field_validator("waypoints")
    @classmethod
    def validate_waypoints(cls, v: list[list[float]]) -> list[list[float]]:
        for pair in v:
            if len(pair) != 2:
                raise ValueError("each waypoint must be [lat, lon]")
            lat, lon = pair
            if not -90 <= lat <= 90:
                raise ValueError(f"lat {lat} out of range")
            if not -180 <= lon <= 180:
                raise ValueError(f"lon {lon} out of range")
        return v


class LoopRequest(BaseModel):
    start: list[float] = Field(..., min_length=2, max_length=2)
    miles: float = Field(default=3.0, ge=0.1, le=50.0)
    mode: str = Field(default="walk", pattern="^(walk|bike)$")
    avoid_cameras: bool = True

    @field_validator("start")
    @classmethod
    def validate_start(cls, v: list[float]) -> list[float]:
        lat, lon = v[0], v[1]
        if not -90 <= lat <= 90:
            raise ValueError(f"lat {lat} out of range")
        if not -180 <= lon <= 180:
            raise ValueError(f"lon {lon} out of range")
        return v


class SaveRouteRequest(BaseModel):
    name: str = Field(default="Untitled Route", max_length=128)
    waypoints: list[WaypointItem] = Field(..., min_length=1, max_length=100)
    mode: str = Field(default="walk", pattern="^(walk|bike)$")
    miles: float = Field(default=0.0, ge=0.0, le=10_000.0)


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
    min_lon, min_lat, max_lon, max_lat = _bbox_from_waypoints(body.waypoints)
    nearby = cam_store.get_in_bbox(min_lon, min_lat, max_lon, max_lat)

    try:
        first_pass = routing.get_route(body.waypoints, body.mode, [])
    except Exception as e:
        print(f"[route] routing error: {e}")
        raise HTTPException(status_code=502, detail="Routing service unavailable")

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
    start_lat, start_lon = body.start[0], body.start[1]
    target_miles = body.miles

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
        print(f"[loop] routing error: {e}")
        raise HTTPException(status_code=502, detail="Routing service unavailable")

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
def get_routes(user_id: Annotated[str, Depends(_get_user_id)]):
    rows = db.fetch_routes(user_id)
    return [{
        "id": r[0],
        "name": r[1],
        "waypoints": r[2],
        "mode": r[3],
        "actualMiles": r[4],
        "date": r[5].strftime("%-m/%-d/%Y"),
    } for r in rows]


@app.post("/api/routes", status_code=201)
def save_route(body: SaveRouteRequest, user_id: Annotated[str, Depends(_get_user_id)]):
    new_id = db.insert_route(
        user_id=user_id,
        name=body.name,
        waypoints=[wp.model_dump() for wp in body.waypoints],
        mode=body.mode,
        miles=body.miles,
    )
    return {"id": new_id}


@app.delete("/api/routes/{route_id}")
def delete_route(route_id: int, user_id: Annotated[str, Depends(_get_user_id)]):
    db.delete_route(route_id, user_id)
    return {"ok": True}


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("app:app", host="0.0.0.0", port=port)
