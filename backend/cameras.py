import gzip
import json
import os
import threading
import requests

CAMERAS_URL = "https://data.dontgetflocked.com/cameras.geojson.gz"
BUNDLED_FILE = os.path.join(os.path.dirname(__file__), "cameras.geojson.gz")

_cameras = []
_lons = []
_lats = []
_lock = threading.Lock()
_loaded = False


def _decode_geojson(raw: bytes) -> list:
    try:
        data = gzip.decompress(raw)
    except Exception:
        data = raw
    return json.loads(data).get("features", [])


def load_cameras():
    global _cameras, _lons, _lats, _loaded

    # Try bundled file first (always present in the Docker image)
    if os.path.exists(BUNDLED_FILE):
        with open(BUNDLED_FILE, "rb") as f:
            raw = f.read()
    else:
        resp = requests.get(CAMERAS_URL, timeout=120, headers={
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "*/*",
            "Accept-Encoding": "gzip, deflate, br",
            "Referer": "https://www.dontgetflocked.com/",
        })
        resp.raise_for_status()
        raw = resp.content

    features = _decode_geojson(raw)

    lons, lats = [], []
    valid = []
    for f in features:
        try:
            lon, lat = f["geometry"]["coordinates"][0], f["geometry"]["coordinates"][1]
            lons.append(float(lon))
            lats.append(float(lat))
            valid.append(f)
        except (KeyError, TypeError, IndexError):
            pass

    with _lock:
        _cameras = valid
        _lons = lons
        _lats = lats
        _loaded = True
    return len(_cameras)


def ensure_loaded():
    if not _loaded:
        try:
            load_cameras()
        except Exception as e:
            print(f"[cameras] load error: {e}")


def get_in_bbox(min_lon: float, min_lat: float, max_lon: float, max_lat: float) -> list:
    ensure_loaded()
    with _lock:
        if not _loaded:
            return []
        cams, lons, lats = _cameras, _lons, _lats
    return [
        cams[i] for i in range(len(cams))
        if min_lon <= lons[i] <= max_lon and min_lat <= lats[i] <= max_lat
    ]
