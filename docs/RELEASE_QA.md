# FocusFork Release QA (End-to-End)

This checklist validates the full product across:
- Desktop app: `/Users/apple/Atikur/focus-fork-app-gemini`
- Backend API: `/Users/apple/Atikur/focus-fork-backend`
- Landing page: `/Users/apple/Atikur/focus-fork`

## 1) Pre-flight

### Backend
```bash
cd /Users/apple/Atikur/focus-fork-backend
set -a; source .env; set +a
make migrate
go run ./cmd/api
```

Expected:
- `http://localhost:8080/healthz` returns `{"status":"ok"}`
- `http://localhost:8080/docs` loads Swagger

### Desktop
```bash
cd /Users/apple/Atikur/focus-fork-app-gemini
npm run dev
```

Expected:
- App launches
- Login screen loads with branded loading/wait state

### Landing
```bash
cd /Users/apple/Atikur/focus-fork
npm run dev
```

Expected:
- Home page loads
- Download cards open GitHub Releases page

## 2) Golden Path (MVP)

1. Sign in with GitHub.
2. Discover issues:
   - Search works
   - Filters (language/difficulty/good-first/scope) work
   - Empty/error states render correctly
3. Select issue:
   - Right sidebar workflow updates to issue context
4. Fork + clone:
   - New or existing repo path is detected correctly
5. Open IDE:
   - Active repo tree visible
   - Branch shown in status bar
6. Create/switch branch.
7. Edit files and save.
8. Source control:
   - Changed files appear
   - Diff opens correctly
9. Commit + push.
10. Create PR:
   - PR URL returned
   - PR appears in status list

## 3) Session + Chat Stability

1. Keep app open for at least 10 minutes.
2. Switch between repositories.
3. In AI panel:
   - Repo history selector works
   - Past messages reload per repo
   - Model selector remains interactive/readable in both themes
4. Simulate backend downtime:
   - App should not silently crash
   - Clear error message shown (no blank state)

## 4) Negative Path Checks

- Backend unavailable at launch
  - App should still render login/UI and show actionable errors.
- GitHub API rate-limit reached
  - Discover should show rate-limit message.
- AI request timeout
  - AI panel should show timeout message and remain usable.

## 5) Release Build Smoke

Desktop:
```bash
cd /Users/apple/Atikur/focus-fork-app-gemini
npm run build
```

Backend:
```bash
cd /Users/apple/Atikur/focus-fork-backend
go test ./...
```

Landing:
```bash
cd /Users/apple/Atikur/focus-fork
npm run build
```

## 6) Go/No-Go Criteria

Go only if:
- Golden path succeeds in one session without manual recovery.
- App restart preserves selected repo/issue and chat history by repo.
- No blocking errors in terminal during login/discover/AI/PR steps.
- Download links on landing open the latest desktop releases.
