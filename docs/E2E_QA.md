# End-to-End QA

## Automated (Playwright)

Runs the renderer shell against mocked Electron APIs on port **5180** (avoids conflicts with other apps on 5173).

```bash
cd focus-fork-app-gemini
npx playwright install chromium   # first time only
npm run test:e2e
```

Coverage:
- Login screen + GitHub CTA
- Discover flow (search, issue card, detail panel)
- IDE shell (branch, VS Code, AI quick actions)
- Contribution history
- Approval gate before fork

## Manual golden path (real GitHub + backend)

### 1. Start backend
```bash
cd focus-fork-backend
docker-compose up -d   # Postgres listens on 5433 if local 5432 is already in use
make migrate
go run ./cmd/api
```

### 2. Configure desktop
```bash
cd focus-fork-app-gemini
cp .env.example .env
# Set GITHUB_CLIENT_ID and ensure FOCUSFORK_BACKEND_URL=http://localhost:8080
npm run dev
```

### 3. Walk the flow
1. Sign in with GitHub (Device Flow)
2. Search issues → select one → Evaluate fit → Approve fork/clone
3. Open repo in VS Code or built-in IDE
4. AI quick action (Summary or Plan)
5. Commit → Push → Create PR (each through approval gate)
6. Check Contributions tab for timeline entry

### 4. Landing page smoke
```bash
cd focus-fork
npm run dev
# Visit http://localhost:3000 — verify hero, download section, pricing link
```

## Release gate checklist
- [ ] `npm run typecheck` (desktop)
- [ ] `npm run build` (desktop)
- [ ] `npm run test:unit && npm run test:e2e` (desktop)
- [ ] `go test ./...` (backend)
- [ ] `npm run build` (landing)
- [ ] Manual issue-to-PR on clean machine
