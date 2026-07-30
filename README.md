# Spirit Status

Live status page for SpiritHost — monitors websites on a schedule and shows an animated public board with uptime history, latency trends, incidents, maintenance, and notices, plus a password-protected admin.

## Features

### Public
- Overall health, announcement banner, and summary counts
- Grouped services with 90-day uptime bars and latency sparklines
- Automatic + manual incident timeline with updates
- Scheduled/active maintenance windows
- RSS feed (`/api/feed`) and embeddable status badge (`/api/badge`)

### Admin
- Services: add/edit/pause/reorder, GET/HEAD, expected status codes
- Maintenance windows with start/end and scoped services
- Incidents: create, post updates, resolve
- Site-wide notice banner
- Force “Check now”

## Quick start

```bash
npm install
cp .env.example .env.local
npm run dev
```

- Status: http://localhost:3000
- Admin: http://localhost:3000/admin
- RSS: http://localhost:3000/api/feed
- Badge: http://localhost:3000/api/badge

Default admin password: `changeme`

## Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `ADMIN_PASSWORD` | `changeme` | Admin login password |
| `ADMIN_SECRET` | — | Signs the admin session cookie |
| `CHECK_INTERVAL_MS` | `60000` | How often sites are checked |
| `CHECK_TIMEOUT_MS` | `10000` | Per-request timeout |
| `CHECK_RETRIES` | `1` | Extra attempts after a failed probe |
| `NEXT_PUBLIC_BRAND_NAME` | `SpiritHost` | Brand on the status page |
| `NEXT_PUBLIC_STATUS_TITLE` | `System Status` | Page subtitle |
| `DATA_DIR` | `./data` | Where `store.json` is written (use `/var/data` on Render disk) |

## Deploy on Render

1. Push this repo to GitHub.
2. In [Render](https://dashboard.render.com), click **New → Blueprint** and select the repo (uses `render.yaml`),  
   **or** **New → Web Service** and set:
   - **Runtime:** Node
   - **Build command:** `npm install && npm run build`
   - **Start command:** `npm start`
3. Add environment variables (at least `ADMIN_PASSWORD` and `ADMIN_SECRET`).
4. (Recommended when you leave free tier) Attach a **persistent disk** at `/var/data` and set `DATA_DIR=/var/data` so monitors survive redeploys. On free, data resets on each deploy.
5. Deploy. Open your `onrender.com` URL, then `/admin` to add services.

### Free plan notes

- Free web services **sleep after ~15 minutes** idle — checks pause until the site is hit again.
- Keep it awake with a free ping from [UptimeRobot](https://uptimerobot.com) every 5 minutes to your status URL.
- Free has **no persistent disk** — expect to re-add services after redeploys unless you upgrade.
- For always-on monitoring + saved data, use a paid Render plan, Fly.io, or a small VPS.

## Check logic

- **2xx–3xx** → Operational (or custom expected codes)
- **4xx** → Degraded
- **5xx / timeout / network error** → Down
- Failed checks retry before recording Down
- During maintenance, auto-incidents are suppressed/closed

Data lives in `data/store.json` (or `DATA_DIR`) and migrates automatically when the schema advances.
