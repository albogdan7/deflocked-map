import os
import json
import pg8000.native
from urllib.parse import urlparse

_db_url = None


def _parsed():
    global _db_url
    if _db_url is None:
        _db_url = urlparse(os.environ["DATABASE_URL"])
    return _db_url


def get_conn():
    u = _parsed()
    return pg8000.native.Connection(
        host=u.hostname,
        port=u.port or 5432,
        database=u.path.lstrip("/"),
        user=u.username,
        password=u.password,
        ssl_context=True,
    )


def init_db():
    conn = get_conn()
    conn.run("""
        CREATE TABLE IF NOT EXISTS routes (
            id         BIGSERIAL PRIMARY KEY,
            user_id    TEXT,
            name       TEXT        NOT NULL,
            waypoints  JSONB       NOT NULL,
            mode       TEXT        NOT NULL DEFAULT 'walk',
            miles      REAL        NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)
    conn.run("CREATE INDEX IF NOT EXISTS routes_user_idx ON routes (user_id)")
    conn.close()


def fetch_routes(user_id):
    conn = get_conn()
    rows = conn.run(
        "SELECT id, name, waypoints, mode, miles, created_at FROM routes WHERE user_id = :uid ORDER BY created_at DESC LIMIT 50",
        uid=user_id,
    )
    conn.close()
    return rows


def insert_route(user_id, name, waypoints, mode, miles):
    conn = get_conn()
    rows = conn.run(
        "INSERT INTO routes (user_id, name, waypoints, mode, miles) VALUES (:uid, :name, :wps::jsonb, :mode, :miles) RETURNING id",
        uid=user_id, name=name, wps=json.dumps(waypoints), mode=mode, miles=miles,
    )
    conn.close()
    return rows[0][0]


def delete_route(route_id, user_id):
    conn = get_conn()
    conn.run(
        "DELETE FROM routes WHERE id = :id AND user_id = :uid",
        id=route_id, uid=user_id,
    )
    conn.close()
