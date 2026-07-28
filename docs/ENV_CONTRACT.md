# Environment Contract

FocusFork desktop uses **main-process** environment variables for auth, GitHub, and backend sync. Renderer metadata can optionally use `VITE_*` vars.

## Required variables (main process)

| Variable | Required | Description | Example |
| --- | --- | --- | --- |
| `GITHUB_CLIENT_ID` | Yes | GitHub OAuth App client ID (Device Flow) | `Iv1.abc123example` |
| `FOCUSFORK_BACKEND_URL` | Yes (when backend sync enabled) | Base URL for the FocusFork backend API | `http://localhost:8080` |

## Feature flags (main process)

| Variable | Default | Description |
| --- | --- | --- |
| `FEATURE_BACKEND_SYNC` | `true` | Sync auth, AI, fork/PR, and contributions through backend |
| `FEATURE_STRICT_BACKEND_AUTH` | `false` | When `true`, block GitHub fallback if backend session is missing |
| `FEATURE_DESKTOP_FALLBACK` | `false` | Allow local Gemini fallback when backend AI is unreachable |

## Optional renderer metadata

| Variable | Description | Example |
| --- | --- | --- |
| `VITE_BACKEND_URL` | Shown in UI / diagnostics | `http://localhost:8080` |
| `VITE_GITHUB_CLIENT_ID` | Renderer-only reference | same as `GITHUB_CLIENT_ID` |
| `VITE_APP_VERSION` | Version badge in UI | `0.1.0` |

## Packaged builds

For production builds without `.env`, ship `resources/app-config.json`:

```json
{"githubClientId":"your_client_id"}
```

## Local setup

1. Copy `.env.example` to `.env`.
2. Set `GITHUB_CLIENT_ID` and start the backend at `FOCUSFORK_BACKEND_URL`.
3. Run `npm run dev`.

## Three-repo sync

| Repo | Role | Default URL |
| --- | --- | --- |
| focus-fork-backend | API, auth, AI proxy | `http://localhost:8080` |
| focus-fork-app | Electron desktop | connects to backend |
| focus-fork | Landing page | `NEXT_PUBLIC_BACKEND_URL=http://localhost:8080` |
