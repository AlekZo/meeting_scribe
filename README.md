# MeetScribe

Self-hosted meeting transcription manager with Scriberr (Whisper) integration, activity logging, and hybrid local/server persistence.

## Features

- 🎙️ **Transcription** — Upload audio/video and transcribe via Scriberr (Whisper)
- 📊 **Dashboard** — Overview of meetings, stats, and recent activity
- 📝 **Meeting Management** — Edit titles, summaries, tags, speakers, and categories
- 📅 **Google Calendar & Docs** — Link meetings to calendar events and external transcripts
- 📥 **Excel Import** — Bulk-import meetings from `.xlsx` / `.csv` files
- 💾 **Backup & Restore** — Full zip backup/restore of all data
- 🔄 **Hybrid Storage** — localStorage for speed + SQLite server for persistence
- 🐳 **Docker-ready** — Single `docker compose up` to run everything

## Tech Stack

- **Frontend:** React, TypeScript, Vite, Tailwind CSS, shadcn/ui
- **Backend:** Node.js, Express, better-sqlite3
- **Proxy:** Nginx (serves frontend + proxies API & Scriberr)
- **Deployment:** Docker Compose

---

## 🐳 Docker Deployment (Recommended)

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) (v20+)
- [Docker Compose](https://docs.docker.com/compose/install/) (v2+)

### Quick Start

```bash
# 1. Clone the repository
git clone <YOUR_GIT_URL>
cd <YOUR_PROJECT_NAME>

# 2. Build and start all services
docker compose up -d --build

# 3. Open in browser
open http://localhost:7899
```

That's it! The app is now running with:
- **Frontend + Nginx proxy** on port `7899`
- **API server + SQLite** on port `3001` (proxied through Nginx)
- **Persistent data** stored in the `meetscribe_data` Docker volume

### Architecture

```
┌─────────────────────────────────────────────┐
│              Docker Compose                 │
│                                             │
│  ┌──────────────────────┐                   │
│  │   meetscribe (Nginx) │ ◄── :7899         │
│  │   - Serves frontend  │                   │
│  │   - Proxies /api/*   │──► api:3001       │
│  │   - Proxies /scriberr│──► host:8080      │
│  └──────────────────────┘                   │
│                                             │
│  ┌──────────────────────┐                   │
│  │   api (Node.js)      │ ◄── :3001        │
│  │   - Express + SQLite │                   │
│  │   - /data volume     │──► meetscribe_data│
│  └──────────────────────┘                   │
└─────────────────────────────────────────────┘
         │
         ▼ (host.docker.internal)
┌──────────────────┐
│  Scriberr :8080  │  ◄── Your existing Scriberr instance
└──────────────────┘
```

### Common Commands

```bash
# Start services
docker compose up -d

# Stop services
docker compose down

# View logs (follow mode)
docker compose logs -f

# View logs for a specific service
docker compose logs -f api
docker compose logs -f meetscribe

# Rebuild after code changes
docker compose up -d --build

# Full reset (removes data volume!)
docker compose down -v
```

### Data Persistence

All data is stored in a Docker volume named `meetscribe_data`, which persists across container restarts and rebuilds.

```bash
# Inspect the volume
docker volume inspect meetscribe_data

# Backup the volume
docker run --rm -v meetscribe_data:/data -v $(pwd):/backup alpine \
  tar czf /backup/meetscribe-data-backup.tar.gz -C /data .

# Restore from backup
docker run --rm -v meetscribe_data:/data -v $(pwd):/backup alpine \
  sh -c "cd /data && tar xzf /backup/meetscribe-data-backup.tar.gz"
```

You can also use the in-app **Backup & Restore** feature in Settings to download/upload a zip of all meetings, transcripts, and settings.

### Scriberr Integration

MeetScribe connects to your existing [Scriberr](https://github.com/JamesCodesStuff/Scriberr) instance for audio/video transcription.

1. Make sure Scriberr is running on the same host (default: `http://localhost:8080`)
2. In MeetScribe **Settings**, configure:
   - **Scriberr URL** — e.g., `http://localhost:8080` (auto-proxied via Nginx)
   - **API Key** — your Scriberr API key
   - **Auth Method** — toggle between `X-API-Key` or `Bearer` token
3. Click **Test Connection** to verify

> **Note:** The Nginx proxy routes `/scriberr/*` requests to `host.docker.internal:8080`. If your Scriberr runs on a different port, update the `nginx.conf` file.

### Environment Variables

| Variable | Service | Default | Description |
|----------|---------|---------|-------------|
| `DATA_DIR` | api | `/data` | SQLite database directory |
| `PORT` | api | `3001` | API server port |

### Customizing Ports

Edit `docker-compose.yml` to change exposed ports:

```yaml
services:
  meetscribe:
    ports:
      - "8080:7899"   # Change 8080 to your desired frontend port
  api:
    ports:
      - "4000:3001"   # Change 4000 to your desired API port
```

If you change the Scriberr proxy port, also update `nginx.conf`:

```nginx
location /scriberr/ {
    proxy_pass http://host.docker.internal:YOUR_SCRIBERR_PORT/;
}
```

---

## 💻 Local Development

### Prerequisites

- Node.js 18+ ([install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating))

### Setup

```bash
# Install dependencies
npm install

# Start dev server (frontend only, uses localStorage)
npm run dev

# Optional: start the API server for full persistence
cd server && npm install && node index.mjs
```

The dev server runs at `http://localhost:5173` with hot reloading.

---

## Project Structure

```
├── src/                  # React frontend
│   ├── components/       # UI components
│   ├── pages/            # Route pages
│   ├── lib/              # Utilities (storage, scriberr, auto-tagger)
│   ├── data/             # Type definitions & mock data
│   └── hooks/            # Custom React hooks
├── server/               # Express API server
│   └── index.mjs         # SQLite-backed key-value store
├── nginx.conf            # Nginx proxy config
├── Dockerfile            # Frontend multi-stage build
├── server/Dockerfile     # API server build
├── docker-compose.yml    # Full stack orchestration
└── docs/                 # API documentation
```
