# Sweeparr
<div align="center">
<img src="./src/assets/logo.svg" alt="Cardventory" width="80%" />
</div>

**Sweeparr** is a self-hosted media cleanup manager for Plex libraries. It scans your Plex server against configurable rules, builds candidate reports of unused or stale media, and executes safe deletions through Radarr and Sonarr — so nothing gets removed without your review.

Everything runs in a single Docker container backed by a local SQLite database. No cloud services required.

---

## Features

- **Dashboard** — At-a-glance overview of library health, active Plex sessions, freeable space from pending reports, and recent report history
- **Library browser** — Lists all Plex movie and TV libraries with item counts and total sizes; on-demand rescan with live progress polling
- **Rule engine** — Create cleanup rules per library or across all libraries; configure minimum age, last-watched thresholds, and protection flags (never-watched, in-progress, currently playing)
- **Candidate reports** — Generate reports that scan every library against your rules and list matched items with reasons (never watched, stale, old & watched, all users watched); review candidates before any deletion
- **Reason tooltips** — Hover any reason badge on a report to see a plain-english explanation of why the item was flagged
- **Selective rule execution** — Pick exactly which rules to include each time you generate a report via a rule picker dialog; disabled rules are automatically hidden
- **Batch exclude** — On a report detail page, select any items you want to spare and exclude them in one click before executing
- **Sortable report grid** — Sort report candidates by title, reason, last watched, date added, file size, or status; paginated 50 items at a time
- **Safe execution** — Executes deletions through Radarr/Sonarr only; excluded items are skipped automatically; shows adjusted candidate count before confirming
- **Activity feed** — Live view of current Plex sessions plus recently watched and recently added media; most-watched movies, shows, libraries, and users
- **Scheduled automation** — Configure cron-based schedules for automatic library scans and cleanup report generation (with optional auto-delete); presets for common intervals
- **Notifications** — Discord webhooks, SMTP email, and Apprise URL alerts for cleanup completed, report ready, scan complete, and error events; per-channel enable/disable toggles
- **Appearance customisation** — 10 accent colour themes (Radarr, Sonarr, Jellyfin, Prowlarr and more), 5 background palettes, border-radius options, and text colour
- **Self-hosted** — Your data stays on your server; runs via Docker Compose with a named volume for persistence

---

## Quick Start

### Docker Compose

```yaml
services:
  sweeparr:
    image: ghcr.io/jtmb/sweeparr:latest
    container_name: sweeparr
    restart: unless-stopped
    ports:
      - "3000:3000"
    volumes:
      - sweeparr-data:/app/data
    environment:
      - DATABASE_URL=file:/app/data/db.sqlite
      - NODE_ENV=production

volumes:
  sweeparr-data:
```

```bash
docker compose up -d
```

Open [http://localhost:3000](http://localhost:3000) and configure your Plex, Radarr, and Sonarr connections in **Settings → Connections**.

### Local image verification

```bash
sudo docker build --progress=plain -t sweeparr:security-local .
python3 tests/container-smoke.py
```

The smoke test uses a disposable Docker volume and a loopback-only port. It checks
fresh migrations, non-root execution, authentication, demo storage/isolation,
restart persistence and fail-closed migration errors, then removes its test
containers and volume. The locally built image is retained. No workflow or image
publication is involved.

Container state lives under `/app/data`: the main database, demo database and
visitor-session files. The entrypoint runs migrations before starting the server
and exits on migration failure.

The image uses Node.js 22. If a host VPN prevents build containers from reaching
package registries, add `--network=host` to the local build command; this does not
change the runtime container's network or loopback-only test port.

If Docker bridge forwarding is also unavailable for runtime tests, use
`SWEEPARR_TEST_HOST_NETWORK=1 python3 tests/container-smoke.py`. This mode binds
Next.js explicitly to `127.0.0.1:3408` inside a host-networked test container.

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | No | SQLite file path. Default: `file:/app/data/db.sqlite` |
| `PORT` | No | HTTP port. Default: `3000` |

All other configuration (Plex URL/token, Radarr/Sonarr URLs and API keys, notification settings, schedules) is managed through the Settings UI and persisted in the database.

---

## Development

**Prerequisites:** Node.js 20+

```bash
# Clone and install
git clone https://github.com/your-org/sweeparr.git
cd sweeparr
npm install

# Apply schema and start dev server
npx prisma db push
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Useful scripts

| Command | Description |
|---|---|
| `npm run dev` | Start development server with Turbopack |
| `npm run build` | Production build (includes `prisma generate`) |
| `npm run migrate` | Run database migrations (`prisma migrate deploy`) |
| `npm run generate` | Regenerate Prisma client after schema changes |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| UI | React 19, Tailwind CSS v4, Radix UI, shadcn/ui |
| Database | SQLite via Prisma 7 + better-sqlite3 |
| Scheduling | node-cron |
| Notifications | Nodemailer (SMTP), Discord webhooks, Apprise |
| Charts | Recharts |
| Container | Docker / Docker Compose |
