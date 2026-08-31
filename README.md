<a id="readme-top"></a>

[![Contributors][contributors-shield]][contributors-url]
[![Forks][forks-shield]][forks-url]
[![Stargazers][stars-shield]][stars-url]
[![Issues][issues-shield]][issues-url]

<br />
<div align="center">
  <h3 align="center">DeflockFitness</h3>

  <p align="center">
    Route planner for walking, running, and cycling that actively avoids ALPR surveillance cameras.
    <br />
    <br />
    <a href="https://github.com/albogdan7/deflocked-map/issues/new?labels=bug">Report Bug</a>
    &middot;
    <a href="https://github.com/albogdan7/deflocked-map/issues/new?labels=enhancement">Request Feature</a>
  </p>
</div>

<details>
  <summary>Table of Contents</summary>
  <ol>
    <li><a href="#about-the-project">About The Project</a></li>
    <li><a href="#built-with">Built With</a></li>
    <li>
      <a href="#getting-started">Getting Started</a>
      <ul>
        <li><a href="#prerequisites">Prerequisites</a></li>
        <li><a href="#installation">Installation</a></li>
      </ul>
    </li>
    <li><a href="#usage">Usage</a></li>
    <li><a href="#environment-variables">Environment Variables</a></li>
    <li><a href="#deployment">Deployment</a></li>
    <li><a href="#roadmap">Roadmap</a></li>
    <li><a href="#contributing">Contributing</a></li>
    <li><a href="#contact">Contact</a></li>
    <li><a href="#acknowledgments">Acknowledgments</a></li>
  </ol>
</details>

---

## About The Project

Automated License Plate Reader (ALPR) cameras are mounted on poles, traffic lights, and buildings across the US — logging the time, location, and plate number of every vehicle and person that passes. DeflockFitness lets you plan routes that actively avoid them easily.

It uses a dataset of **31,000+ real-world ALPR camera locations** sourced from [DontGetFlocked](https://www.dontgetflocked.com) and the [Valhalla](https://github.com/valhalla/valhalla) open-source routing engine. When a route passes within 75m of a camera's detection cone, it re-routes around it automatically.

**Key features:**
- **Camera-avoidant routing** — two-pass routing: first finds the fastest path, then re-routes around any cameras detected within 75m of the route
- **Directional FOV awareness** — cameras with a known bearing only trigger avoidance when the route passes through their field of view, not just proximity
- **Loop generation** — generate 3 loop options from any start point at a target distance (0.5–26.2 mi), each with iterative camera avoidance passes
- **Route manipulation** — Out & Back, Reverse, Close Loop, drag-to-reshape, right-click to remove waypoints
- **Camera heatmap** — visualize camera density as a fog overlay at zoom 12+
- **GPS tracking** — auto-set start waypoint from your current location
- **Saved routes** — signed-in users sync routes to Postgres across devices; guests use localStorage
- **GPX export** — download with synthetic pace-based timestamps for direct import into Strava, Garmin, or MapMyRun
- **Google Maps handoff** — open any route in Google Maps for turn-by-turn navigation

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

## Built With

[![TypeScript][TypeScript-badge]][TypeScript-url]
[![React][React.js]][React-url]
[![Vite][Vite-badge]][Vite-url]
[![TailwindCSS][Tailwind-badge]][Tailwind-url]
[![FastAPI][FastAPI-badge]][FastAPI-url]
[![Python][Python-badge]][Python-url]
[![Docker][Docker-badge]][Docker-url]
[![Cloudflare][Cloudflare-badge]][Cloudflare-url]

| Layer | Tech |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind v4, shadcn/ui, MapLibre GL JS, Clerk auth |
| Backend | FastAPI, Python 3.12, UV, Pydantic |
| Routing engine | Valhalla (public API via `valhalla1.openstreetmap.de`) |
| Camera data | DeFlock / OSM — bundled as `cameras.geojson.gz`, loaded into memory at startup |
| Map tiles | OpenFreeMap (positron style) |
| Database | Neon Postgres via pg8000 (no libpq dependency) |
| Auth | Clerk (Google OAuth, modal sign-in) |
| Frontend hosting | Cloudflare Workers + Assets |
| Backend hosting | Render (Docker, free tier) |

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

## Getting Started

### Prerequisites

- Python 3.12+
- Node.js 20+
- A [Clerk](https://clerk.com) account (free) — for auth
- A [Neon](https://neon.tech) Postgres database (free) — for saved routes

### Installation

1. Clone the repo
   ```sh
   git clone https://github.com/albogdan7/deflocked-map.git
   cd deflocked-map
   ```

2. Set up the backend
   ```sh
   cd backend
   python -m venv .venv
   source .venv/bin/activate  # Windows: .venv\Scripts\activate
   pip install fastapi "uvicorn[standard]" python-dotenv pg8000 requests pydantic
   ```

   Create `backend/.env`:
   ```env
   DATABASE_URL=postgresql://user:password@host/dbname
   ```

   Start the server:
   ```sh
   uvicorn app:app --port 8000 --reload
   # Runs on http://localhost:8000
   # Docs at http://localhost:8000/docs
   ```

3. Set up the frontend (new terminal)
   ```sh
   cd frontend
   npm install
   ```

   Create `frontend/.env`:
   ```env
   VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
   ```

   Start the dev server:
   ```sh
   npm run dev
   # Runs on http://localhost:5173
   # /api/* proxies to http://localhost:8000
   ```

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

## Usage

**Point-to-point route:** Type a start and end address in the panel, or click the map to place waypoints. The route auto-generates and re-routes around any cameras.

**Loop route:** Enter a start address (or enable GPS), set a target distance with the slider, and click **Generate Loop**. Three options are shown — pick one by clicking it on the map or in the panel.

**Route tools (floating buttons on the map):**
| Button | What it does |
|---|---|
| GPS | Snaps the start waypoint to your current location |
| HEAT | Toggles camera density heatmap (zoom ≥ 12) |
| RETURN | Closes the route back to the start point |
| REVERSE | Flips the direction of the route |
| OUT+BACK | Mirrors the route back to the start, doubling the distance |
| UNDO | Removes the last placed waypoint |
| CLEAR | Clears all waypoints |

**Drag to reshape:** Click and drag anywhere on the active route line to insert a new waypoint at that position.

**Export:** Use **↓ GPX** to download the exact route for Strava/Garmin import, or **Maps ↗** to open an approximation in Google Maps.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | Neon Postgres connection string |
| `VALHALLA_URL` | No | Custom Valhalla instance (defaults to public OSM server) |
| `PORT` | No | Server port (defaults to 8000) |

### Frontend (`frontend/.env`)

| Variable | Required | Description |
|---|---|---|
| `VITE_CLERK_PUBLISHABLE_KEY` | Yes | Clerk publishable key |

---

## Deployment

Pushes to `main` auto-deploy via GitHub Actions. Set these secrets in **Settings → Secrets and variables → Actions**:

| Secret | Description |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token with Workers edit permission |
| `VITE_CLERK_PUBLISHABLE_KEY` | Clerk publishable key (baked into the Vite build) |
| `RENDER_DEPLOY_HOOK_URL` | Render deploy hook URL from your backend service settings |

### Manual deploy

**Frontend:**
```sh
cd frontend && npm run build && npx wrangler deploy
```

**Backend:** Push to main — Render auto-deploys from the `backend/` Dockerfile.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

## Roadmap

- [x] Camera-avoidant A-to-B routing with directional FOV detection
- [x] Loop generation with iterative avoidance passes
- [x] Drag-to-reshape route
- [x] GPS start waypoint
- [x] GPX export with synthetic timestamps
- [x] Saved routes (Postgres + localStorage fallback)
- [x] TypeScript frontend
- [x] FastAPI + Pydantic backend
- [x] CI/CD auto-deploy (GitHub Actions → Cloudflare + Render)
- [x] shadcn/ui + Tailwind v4 redesign (calm, professional UI)
- [ ] Mobile-optimized UI
- [ ] Shareable route URLs
- [ ] Scheduled camera data refresh
- [ ] International camera coverage

See the [open issues](https://github.com/albogdan7/deflocked-map/issues) for a full list of proposed features and known bugs.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

## Contributing

1. Fork the project
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

## Contact

Albert Bogdan — [GitHub @albogdan7](https://github.com/albogdan7)

Project: [https://github.com/albogdan7/deflocked-map](https://github.com/albogdan7/deflocked-map)

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

## Acknowledgments

- [DeFlock / DontGetFlocked](https://www.dontgetflocked.com) — ALPR camera dataset
- [Valhalla](https://github.com/valhalla/valhalla) — open-source routing engine
- [OpenStreetMap](https://www.openstreetmap.org) — map data
- [Nominatim](https://nominatim.org) — address geocoding
- [Clerk](https://clerk.com) — authentication
- [Neon](https://neon.tech) — serverless Postgres
- [Best-README-Template](https://github.com/othneildrew/Best-README-Template)

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- MARKDOWN LINKS & BADGES -->
[contributors-shield]: https://img.shields.io/github/contributors/albogdan7/deflocked-map.svg?style=for-the-badge
[contributors-url]: https://github.com/albogdan7/deflocked-map/graphs/contributors
[forks-shield]: https://img.shields.io/github/forks/albogdan7/deflocked-map.svg?style=for-the-badge
[forks-url]: https://github.com/albogdan7/deflocked-map/network/members
[stars-shield]: https://img.shields.io/github/stars/albogdan7/deflocked-map.svg?style=for-the-badge
[stars-url]: https://github.com/albogdan7/deflocked-map/stargazers
[issues-shield]: https://img.shields.io/github/issues/albogdan7/deflocked-map.svg?style=for-the-badge
[issues-url]: https://github.com/albogdan7/deflocked-map/issues
[TypeScript-badge]: https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white
[TypeScript-url]: https://www.typescriptlang.org/
[React.js]: https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB
[React-url]: https://reactjs.org/
[Vite-badge]: https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white
[Vite-url]: https://vitejs.dev/
[Tailwind-badge]: https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white
[Tailwind-url]: https://tailwindcss.com/
[FastAPI-badge]: https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white
[FastAPI-url]: https://fastapi.tiangolo.com/
[Python-badge]: https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white
[Python-url]: https://www.python.org/
[Docker-badge]: https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white
[Docker-url]: https://www.docker.com/
[Cloudflare-badge]: https://img.shields.io/badge/Cloudflare-F38020?style=for-the-badge&logo=cloudflare&logoColor=white
[Cloudflare-url]: https://workers.cloudflare.com/
