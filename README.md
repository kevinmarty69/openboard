# OpenBoard

Gamified command center to manage an AI agent workforce like an RPG guild.

## Features
- GitHub OAuth (allowlist single user)
- SQLite persistence
- WebSocket live updates
- CRUD APIs for agents, missions, directives, resources, activity log
- Pixel-art inspired UI cards with skill boards & equipment

## Quick start

```bash
npm install
npm run dev
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:3000

## Environment
Create a `.env` (see `.env.example`):

```
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
GITHUB_ALLOWED_LOGIN=kevinmarty69
GITHUB_CALLBACK_URL=http://localhost:3000/api/auth/github/callback
SESSION_SECRET=change_me
FRONTEND_URL=http://localhost:5173
ENABLE_SHELL_ACTIONS=false
ALLOWED_COMMANDS=tmux,openclaw,gh,git
SEED_DATA=true
PORT=3000
```

## API
- `GET /api/state` → full state snapshot
- `POST /api/agents` → recruit
- `PUT /api/agents/:id` → update agent
- `DELETE /api/agents/:id` → release agent
- Similar CRUD for `/api/missions`, `/api/directives`, `/api/resources`
- `GET /api/activity`

## WebSocket
Connect to `/ws?token=<token>` (token returned in `/api/me`).

## Shell actions
Set `ENABLE_SHELL_ACTIONS=true` to allow tmux/openclaw control from the dashboard.
Allowed commands are controlled by `ALLOWED_COMMANDS` (comma separated).

## Deploy
- Works on Vercel (frontend) + external Node server (or migrate API to serverless later)
- Future: Supabase migration (Postgres)
