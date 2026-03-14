# MeetScribe

Self-hosted meeting transcription manager with [Scriberr](https://github.com/JamesCodesStuff/Scriberr) (Whisper) integration.

## Features

- 🎙️ **Transcription** — Upload audio/video, transcribe via Scriberr with GPU acceleration
- 📊 **Dashboard** — Stats, activity log, and processing pipeline overview
- 📝 **Meeting Management** — Edit titles, summaries, tags, speakers, and categories
- 📅 **Google Calendar & Docs** — Link meetings to calendar events and external transcripts
- 📥 **Excel Import** — Bulk-import meetings from `.xlsx` / `.csv`
- 💾 **Backup & Restore** — Full zip backup/restore of all data
- 🔄 **Hybrid Storage** — localStorage + SQLite server for persistence
- 🐳 **Docker-ready** — Two compose files, shared network, single command

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | React · TypeScript · Vite · Tailwind CSS · shadcn/ui |
| Backend | Node.js · Express · better-sqlite3 |
| Proxy | Nginx (frontend + API + Scriberr proxy) |
| Transcription | Scriberr (WhisperX + pyannote) |
| Deployment | Docker Compose |

---

## Quick Start

```bash
# 1. Create the shared network
docker network create scriberr-net

# 2. Start Scriberr (GPU transcription engine)
HF_TOKEN=hf_your_token docker compose -f docker-compose.scriberr.yml up -d

# 3. Start MeetScribe
docker compose up -d --build

# 4. Open
open http://localhost:7899
```

## Architecture

```
┌─── docker-compose.yml ──────────────────────┐
│                                              │
│  meetscribe (Nginx) :7899                    │
│  ├── Serves React frontend                   │
│  ├── /api/*    → api:3001                    │
│  └── /scriberr/* → scriberr:8080             │
│                                              │
│  api (Node.js) :3001                         │
│  └── Express + SQLite → meetscribe_data vol  │
│                                              │
└──────────────────────────────────────────────┘
         │ scriberr-net (shared network)
┌─── docker-compose.scriberr.yml ─────────────┐
│                                              │
│  scriberr :8080                              │
│  └── WhisperX + pyannote (CUDA/Blackwell)    │
│                                              │
└──────────────────────────────────────────────┘
```

## Configuration

### Scriberr Connection

Leave the **Scriberr URL** field empty in Settings — the Nginx proxy handles routing automatically via the shared Docker network. Only set a custom URL if Scriberr runs on a different host.

### Environment Variables

| Variable | Service | Default | Description |
|----------|---------|---------|-------------|
| `DATA_DIR` | api | `/data` | SQLite database directory |
| `PORT` | api | `3001` | API server port |
| `HF_TOKEN` | scriberr | — | HuggingFace token for pyannote models |
| `PUID` / `PGID` | scriberr | `1000` | File ownership inside container |

### Customizing Ports

```yaml
# docker-compose.yml
services:
  meetscribe:
    ports:
      - "8080:7899"   # Change left side to your desired port
```

## Common Commands

```bash
docker compose up -d                 # Start
docker compose down                  # Stop
docker compose up -d --build         # Rebuild after changes
docker compose logs -f               # Follow logs
docker compose down -v               # Reset (removes data!)
```

### Volume Backup

```bash
# Backup
docker run --rm -v meetscribe_data:/data -v $(pwd):/backup alpine \
  tar czf /backup/meetscribe-backup.tar.gz -C /data .

# Restore
docker run --rm -v meetscribe_data:/data -v $(pwd):/backup alpine \
  sh -c "cd /data && tar xzf /backup/meetscribe-backup.tar.gz"
```

Or use the in-app **Backup & Restore** in Settings.

---

## Local Development

```bash
npm install
npm run dev                          # Frontend at http://localhost:5173

# Optional: API server for full persistence
cd server && npm install && node index.mjs
```

## Project Structure

```
├── src/                  # React frontend
│   ├── components/       # UI components
│   ├── pages/            # Route pages
│   ├── contexts/         # React contexts (upload queue)
│   ├── lib/              # Utilities (storage, scriberr, auto-tagger)
│   └── hooks/            # Custom hooks
├── server/               # Express API + SQLite
├── nginx.conf            # Proxy config
├── docker-compose.yml    # MeetScribe stack
├── docker-compose.scriberr.yml  # Scriberr stack
└── docs/                 # API documentation
```
