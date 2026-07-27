import gzip
import json
import threading
import requests

CAMERAS_URL = "https://data.dontgetflocked.com/cameras.geojson.gz"

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
    resp = requests.get(CAMERAS_URL, timeout=120)
    resp.raise_for_status()
    features = _decode_geojson(resp.content)

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
        load_cameras()


def get_in_bbox(min_lon: float, min_lat: float, max_lon: float, max_lat: float) -> list:
    ensure_loaded()
    with _lock:
        cams, lons, lats = _cameras, _lons, _lats
    return [
        cams[i] for i in range(len(cams))
        if min_lon <= lons[i] <= max_lon and min_lat <= lats[i] <= max_lat
    ]


