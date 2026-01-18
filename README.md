# MikroSMS

SMS management panel for MikroTik LTE modems with proper Persian/Arabic Unicode support.

## Features

- **Full Unicode Support**: Correctly decodes Persian, Arabic, and emoji messages by using AT commands to read raw PDU data
- **Concatenated SMS**: Multi-part messages automatically reassembled
- **Inbox Management**: View, sync, and delete messages
- **Send SMS**: Compose and send with RTL support
- **Multi-Router**: Manage multiple MikroTik profiles
- **Dark Mode**: Monochrome UI with dark/light toggle
- **Containerized**: Docker Compose ready

## Why?

MikroTik's web UI displays Persian/Arabic SMS as `???????` due to encoding issues. This app bypasses that by using `AT+CMGL` to read raw PDU data and properly decode UCS-2 encoded messages.

## Quick Start

### Docker (Recommended)

```bash
git clone https://github.com/parhamfa/mikrosms.git
cd mikrosms
cp env.example .env
# Edit .env and set a strong SECRET_KEY

# Development (hot reload)
docker compose -f docker-compose.dev.yml up --build

# Production
docker compose up --build
```

### Local Development

```bash
# Backend
python -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt

# Frontend
cd frontend && npm install && cd ..

# Run both
python run.py --dev
```

Then open http://localhost:5174

## First Run

1. Create admin account
2. Add MikroTik router profile (host, credentials, LTE interface)
3. Click **Sync** to fetch messages

## Ports

| Service | Dev | Production |
|---------|-----|------------|
| Backend | 8001 | 8001 |
| Frontend | 5174 | 5174 |

## Requirements

- MikroTik RouterOS 7+ with REST API enabled
- LTE modem attached to router
- Docker (for containerized deployment)

## Tech Stack

- **Backend**: FastAPI, SQLAlchemy, SQLite
- **Frontend**: React 18, Vite, Tailwind CSS
- **MikroTik**: REST API + AT commands via `/interface/lte/at-chat`

## License

MIT
