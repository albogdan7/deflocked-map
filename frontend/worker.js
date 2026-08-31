const CAMERAS_TTL = 300;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/tiles/")) {
      const tileTarget = `https://api.maptiler.com/maps/darkmatter${url.pathname.slice(6)}?key=${env.MAPTILER_API_KEY}`;
      const tileRes = await fetch(tileTarget);
      const r = new Response(tileRes.body, tileRes);
      r.headers.set("Cache-Control", "public, max-age=86400");
      return r;
    }

    if (url.pathname.startsWith("/api/")) {
      const target = env.BACKEND_URL + url.pathname + url.search;

      if (url.pathname === "/api/cameras" && request.method === "GET") {
        const cache = caches.default;
        const cacheKey = new Request(target);
        const hit = await cache.match(cacheKey);
        if (hit) return hit;
        const res = await fetch(target);
        const cached = new Response(res.body, res);
        cached.headers.set("Cache-Control", `public, max-age=${CAMERAS_TTL}`);
        ctx.waitUntil(cache.put(cacheKey, cached.clone()));
        return cached;
      }

      return fetch(target, {
        method: request.method,
        headers: request.headers,
        body: ["GET", "HEAD"].includes(request.method) ? null : request.body,
      });
    }

    const res = await env.ASSETS.fetch(request);
    if ((res.headers.get("content-type") || "").includes("text/html")) {
      const r = new Response(res.body, res);
      r.headers.set("Cache-Control", "no-store");
      return r;
    }
    return res;
  },
};
