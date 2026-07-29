const CAMERAS_TTL = 300; // cache camera bbox responses for 5 minutes

export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  const backend = env.BACKEND_URL;
  const target = backend + url.pathname + url.search;

  // Cache /api/cameras at the edge — data changes infrequently
  if (url.pathname === "/api/cameras" && request.method === "GET") {
    const cache = caches.default;
    const cacheKey = new Request(target);

    const hit = await cache.match(cacheKey);
    if (hit) return hit;

    const res = await fetch(target);
    const cached = new Response(res.body, res);
    cached.headers.set("Cache-Control", `public, max-age=${CAMERAS_TTL}`);
    await cache.put(cacheKey, cached.clone());
    return cached;
  }

  // Everything else (/api/route, /api/loop, /api/health) proxies straight through
  return fetch(target, {
    method: request.method,
    headers: request.headers,
    body: request.body ?? null,
  });
}
