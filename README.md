# DeflockFitness

**Live app → https://deflocked-map.albertbogdan2006.workers.dev**

A privacy-first route planner for walking, running, and cycling. DeflockFitness generates routes that actively avoid Automated License Plate Reader (ALPR) cameras, using a dataset of 31,000+ real-world camera locations across the US.

---

## Features

- **Camera-avoidant routing** — two-pass Valhalla routing that detects cameras near your path and reroutes around them
- **Loop generation** — auto-generate 3 loop route options from any start point at a target distance
- **Out & Back, Reverse, Close Loop** — quick route manipulation tools
- **Heatmap mode** — visualize camera density as a fog overlay at zoom 12+
- **GPS tracking** — snap start waypoint to your current location
- **Save routes** — signed-in users get Neon Postgres sync across devices; guests get localStorage
- **GPX export** — download routes with synthetic timestamps for Strava / MapMyRun import
- **Google Maps handoff** — open any route in Google Maps for turn-by-turn navigation

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 18, Vite, Leaflet, Clerk auth |
| Styling | Nunito font, Duolingo-inspired dark mode |
| Backend | Flask 3.1.1, Python, Docker |
| Routing engine | Valhalla (external API) |
| Camera data | dontgetflocked.com — bundled as `cameras.geojson.gz` |
| Database | Neon Postgres (pg8000, no libpq) |
| Auth | Clerk (Google OAuth) |
| Frontend hosting | Cloudflare Workers + Assets |
| Backend hosting | Render (Docker, free tier) |

---

## Local Development

### Prerequisites

- Python 3.11+
- Node.js 18+
- A [Clerk](https://clerk.com) account (free)
- A [Neon](https://neon.tech) Postgres database (free)

### 1. Clone

```bash
git clone https://github.com/albogdan7/deflocked-map.git
cd deflocked-map
```

### 2. Backend

```bash
cd backend
pip install -r requirements.txt
```

Create `backend/.env`:

```env
DATABASE_URL=postgresql+pg8000://user:password@host/dbname
CLERK_SECRET_KEY=sk_test_...
```

Start the server:

```bash
python app.py
# Runs on http://localhost:8000
```

### 3. Frontend

```bash
cd frontend
npm install
```

Create `frontend/.env`:

```env
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
```

Start the dev server:

```bash
npm run dev
# Runs on http://localhost:5173
# API calls proxy to http://localhost:8000 via vite.config.js
```

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Description |
|---|---|
| `DATABASE_URL` | Neon Postgres connection string |
| `CLERK_SECRET_KEY` | Clerk secret key (for future server-side validation) |

### Frontend (`frontend/.env`)

| Variable | Description |
|---|---|
| `VITE_CLERK_PUBLISHABLE_KEY` | Clerk publishable key |

---

## Deployment

### Backend → Render

1. Create a new **Web Service** on [Render](https://render.com), connect this repo
2. Set root directory to `backend/`
3. Runtime: **Docker**
4. Add environment variables: `DATABASE_URL`, `CLERK_SECRET_KEY`
5. Deploy

### Frontend → Cloudflare Workers

1. Install Wrangler: `npm install -g wrangler`
2. From the `frontend/` directory:

```bash
npm run build
wrangler deploy
```

The `worker.js` proxies `/api/*` requests to the Render backend and serves the Vite build from Cloudflare's edge.

Set `BACKEND_URL` in `frontend/wrangler.toml`:

```toml
[vars]
BACKEND_URL = "https://your-app.onrender.com"
```

---

## Camera Data

Camera locations are sourced from [DontGetFlocked](https://www.dontgetflocked.com) and bundled as `backend/cameras.geojson.gz` (31 MB compressed). The file is loaded into memory on startup and queried by bounding box for each route request. Re-download periodically to get updated camera locations:

```bash
curl -L \
  -H "User-Agent: Mozilla/5.0" \
  -H "Referer: https://www.dontgetflocked.com/" \
  "https://data.dontgetflocked.com/cameras.geojson.gz" \
  -o backend/cameras.geojson.gz
```
