# FocusFork MVP — End-to-end testing guide

Use this checklist before a market release. All three repos must run together.

## 1. Start infrastructure

```bash
# Backend
cd focus-fork-backend
docker compose up -d
set -a; source .env; set +a
make migrate
go run ./cmd/api

# Desktop
cd focus-fork-app-gemini
cp .env.example .env   # fill GITHUB_CLIENT_ID, FOCUSFORK_BACKEND_URL, VITE_DEV_SERVER_PORT=5180
npm run dev
```

Verify: `curl http://localhost:8080/healthz` → `{"status":"ok"}`

## 2. Auth & workspace

- [ ] Launch desktop app
- [ ] Sign in with GitHub OAuth
- [ ] Header shows backend synced (not local-only mode)
- [ ] Settings → choose workspace folder

## 3. Discover → fork → clone (human approval)

- [ ] Discover → search issues
- [ ] Select issue → Evaluate fit (AI analysis)
- [ ] Approve fork + clone via approval gate
- [ ] Workflow checklist advances in sidebar

## 4. Workspace → AI chat

- [ ] Open Workspace for cloned repo
- [ ] AI chat: send message or use guided action
- [ ] Model picker shows plan-allowed models only
- [ ] Usage & Billing → tokens/requests increment after chat

## 5. Git ship flow

- [ ] Create/checkout branch
- [ ] Edit file (in external IDE or workspace)
- [ ] Commit with approval gate
- [ ] Push with approval gate
- [ ] Create PR with approval gate
- [ ] Contributions page shows events

## 6. Usage & billing

- [ ] Sidebar → **Usage & Billing**
- [ ] See plan, quota progress bars, bonus credits (if any)
- [ ] Recent AI activity table populated
- [ ] Upgrade Pro / Max opens Dodo checkout in browser
- [ ] Buy extra credits opens credits checkout
- [ ] After payment + webhook → Refresh → plan/credits update

## 7. Quota & suspension behavior

- [ ] Exhaust monthly quota (or lower limits in DB for test)
- [ ] AI chat shows friendly error + link to Usage & Billing
- [ ] Buy extra credits → bonus tokens allow more AI usage
- [ ] Simulate `past_due` subscription → AI blocked with account paused banner

## 8. Dodo configuration (required for real billing E2E)

Backend `.env`:

| Variable | Purpose |
|----------|---------|
| `DODO_PAYMENTS_API_KEY` | Checkout sessions |
| `DODO_PAYMENTS_WEBHOOK_KEY` | Webhook verification |
| `DODO_CHECKOUT_RETURN_URL` | Post-checkout redirect |
| `DODO_PRODUCT_PRO_USD` / `_INR` | Pro subscription |
| `DODO_PRODUCT_MAX_USD` / `_INR` | Max subscription |
| `DODO_PRODUCT_CREDITS_USD` / `_INR` | One-time credit pack |
| `DODO_CREDITS_TOKEN_GRANT` | Bonus tokens per purchase (default 500000) |
| `OPENROUTER_API_KEY` | Managed AI |

Webhook URL (via ngrok for local test):

```
https://<your-ngrok>.ngrok.io/v1/billing/webhook
```

Register this in the Dodo dashboard.

## 9. Release readiness

- [ ] `npm run typecheck` passes (desktop)
- [ ] `npm run build` passes (desktop)
- [ ] `go build ./...` passes (backend)
- [ ] Landing site builds (`focus-fork`)
- [ ] No secrets committed (.env gitignored)

When all boxes pass, the MVP golden path is ready for a controlled beta release.
