# Billing, usage limits, and Dodo payments

This document explains how FocusFork tiers, quotas, and checkout work across the **desktop app** and **backend**.

## Plan tiers (managed AI via OpenRouter)

| Plan | Price | Tokens / month | Requests / month | Rate limit |
| --- | --- | --- | --- | --- |
| **Free** | $0 | 250,000 | 500 | 10 / min |
| **Pro** | $19 / ₹1,599 | 5,000,000 | 5,000 | 120 / min |
| **Max** | $49 / ₹4,099 | 25,000,000 | 25,000 | 300 / min |

Each plan also has an **allowed model list** stored in Postgres (`plans.allowed_models`). The backend filters the OpenRouter catalog before returning models to the desktop.

Enforcement happens in `focus-fork-backend/internal/ai/service.go`:

- `QUOTA_EXCEEDED` when monthly tokens or requests are exhausted
- `RATE_LIMITED` when per-minute limit is hit
- `MODEL_UNAVAILABLE` when the selected model is not on the plan allowlist

## How limits map to “$19 / $49 credits”

FocusFork does **not** expose a separate dollar wallet today. Instead:

1. User pays **$19 (Pro)** or **$49 (Max)** via Dodo subscription.
2. Backend activates the plan and sets monthly **token + request quotas**.
3. Each AI call consumes tokens; usage is tracked in `quota_counters` and `usage_ledger`.
4. When quotas are exhausted, AI calls fail until the next billing period or upgrade.

Model cost metadata (`input_cost_per_1m`) is shown in the UI for transparency, but billing is **quota-based**, not pay-per-token at checkout.

## Overage / extra credits

Users can buy **bonus token credits** beyond their monthly plan quota:

1. Desktop → Usage & Billing → **Buy extra AI credits**
2. Backend creates a Dodo one-time checkout (`plan_code: credits`)
3. Webhook `payment.succeeded` grants tokens to `user_credits.bonus_tokens`
4. When monthly quota is exhausted, AI calls consume bonus tokens first

Configure:

| Variable | Purpose |
| --- | --- |
| `DODO_PRODUCT_CREDITS_USD` | Dodo product for credit pack (USD) |
| `DODO_PRODUCT_CREDITS_INR` | Dodo product for credit pack (INR) |
| `DODO_CREDITS_TOKEN_GRANT` | Tokens granted per purchase (default 500000) |

## Account suspension (unpaid bills)

If a subscription is **`past_due`** or **`unpaid`**, managed AI is blocked with `ACCOUNT_SUSPENDED`. The desktop shows a billing pause banner on Usage & Billing.

## What users see in the desktop app

**Settings → Plan & Billing**

- Current plan and status
- Upgrade to Pro / Max (opens Dodo checkout in browser)
- Refresh plan status after payment

**Settings → Usage**

- Tokens and requests used vs plan quota (progress bars)
- Per-minute rate limit
- Billing period dates

**Settings → AI Agent / IDE chat**

- Model picker shows only plan-allowed models from `GET /v1/ai/models`

## Dodo payment flow (end-to-end)

```
Desktop Settings → POST /v1/billing/checkout-session
  → Backend calls https://api.dodopayments.com/v1/checkouts
  → Returns checkout_url
  → Desktop opens browser
  → User pays on Dodo
  → Dodo POST /v1/billing/webhook
  → Backend updates subscriptions table
  → User clicks “Refresh Plan Status” in desktop
```

## Backend env vars required for Dodo E2E

Set these in `focus-fork-backend/.env` (see `.env.example`):

| Variable | Purpose |
| --- | --- |
| `DODO_PAYMENTS_API_KEY` | Create checkout sessions |
| `DODO_PAYMENTS_WEBHOOK_KEY` | Verify webhook signatures |
| `DODO_CHECKOUT_RETURN_URL` | Redirect after checkout (e.g. `focusfork://billing/return` or landing page) |
| `DODO_PRODUCT_PRO_USD` | Dodo product ID for Pro USD |
| `DODO_PRODUCT_PRO_INR` | Dodo product ID for Pro INR |
| `DODO_PRODUCT_MAX_USD` | Dodo product ID for Max USD |
| `DODO_PRODUCT_MAX_INR` | Dodo product ID for Max INR |
| `OPENROUTER_API_KEY` | Managed AI proxy |
| `DATABASE_URL` | Postgres for plans/subscriptions/usage |

Also required for auth: `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, JWT secrets.

## E2E test checklist

1. Start backend: Postgres + Redis + `go run ./cmd/api`
2. Start desktop with `FOCUSFORK_BACKEND_URL=http://localhost:8080`
3. Sign in with GitHub OAuth
4. Settings → confirm **Usage** shows quotas for `free`
5. Settings → **Upgrade to Pro** → browser opens Dodo checkout
6. Complete test payment in Dodo sandbox (or simulate webhook locally)
7. Expose webhook: `ngrok http 8080` → register URL in Dodo dashboard
8. Click **Refresh Plan Status** → plan becomes `pro`, model list expands
9. Send AI chat message → usage counters increment
10. Exhaust quota (or lower limits in DB for test) → chat returns quota error

## Webhook testing without live payment

Send a signed test payload to `POST /v1/billing/webhook` using Dodo’s webhook secret. See Dodo docs for event shapes (`subscription.active`, etc.).
