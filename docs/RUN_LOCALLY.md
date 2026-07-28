# Run FocusFork locally

## 1. Backend (terminal 1)

Start Postgres and Redis:

```bash
cd /Users/apple/Atikur/focus-fork-backend
docker compose up -d
```

Copy env if needed, then migrate and run the API:

```bash
cp .env.example .env   # only if .env does not exist yet
set -a; source .env; set +a
make migrate
go run ./cmd/api
```

Verify:

```bash
curl -sS http://localhost:8080/healthz
```

API docs: http://localhost:8080/docs

## 2. Desktop app (terminal 2)

```bash
cd /Users/apple/Atikur/focus-fork-app-gemini
cp .env.example .env   # only if .env does not exist yet
```

Set at minimum in `.env`:

```env
GITHUB_CLIENT_ID=your_github_oauth_app_client_id
FOCUSFORK_BACKEND_URL=http://localhost:8080
FEATURE_BACKEND_SYNC=true
VITE_DEV_SERVER_PORT=5180
```

Then:

```bash
npm install
npm run dev
```

The renderer dev server uses **port 5180** by default so it does not clash with other Vite apps on 5173.

### Port already in use?

```bash
# See what is using 5180
lsof -i :5180

# Or override the port for one session
VITE_DEV_SERVER_PORT=5181 npm run dev
```

## 3. Landing page (optional, terminal 3)

```bash
cd /Users/apple/Atikur/focus-fork
npm install
npm run dev
```

Open http://localhost:3000

## Quick checklist

| Service | URL | Required for |
| --- | --- | --- |
| Backend API | http://localhost:8080 | Auth sync, AI proxy, contribution history |
| Desktop dev | Electron window | Full product workflow |
| Postgres | localhost:5433 | Backend database |
| Redis | localhost:6379 | Backend rate limits / sessions |
