import { useEffect, useState, useMemo } from 'react'
import { RefreshCw, ShieldAlert, ChevronDown } from 'lucide-react'
import { mapPlatformModels, usagePercent, type PlatformUsageSnapshot } from '../../lib/platform-models'
import { useAuthStore } from '../../store/useAuthStore'
import { useAIStore } from '../../store/useAIStore'
import { useAIModeStore } from '../../store/useAIModeStore'
import { useUIStore } from '../../store/useUIStore'
import { humanizeError } from '../../lib/user-errors'
import { useTabActivityStore } from '../../store/useTabActivityStore'
import clsx from 'clsx'

/** Flip to true once the payment provider is live. */
const SUBSCRIPTIONS_ENABLED = false
const SUPPORT_EMAIL = 'atikursattermondal@gmail.com'

interface UsageHistoryItem {
  model: string
  input_tokens: number
  output_tokens: number
  total_tokens: number
  cost_usd: number
  mode: string
  created_at: string
}

const MODEL_PREVIEW_COUNT = 12

export function UsagePage() {
  const { backendConnected } = useAuthStore()
  const setView = useUIStore((state) => state.setView)
  const { mode: aiMode, provider: aiProvider, model: aiModel, hasKey, refresh: refreshAIMode } = useAIModeStore()
  const byok = aiMode === 'byok'
  const { model, setModel } = useAIStore()

  useEffect(() => {
    void refreshAIMode()
  }, [refreshAIMode])
  const setTabActivity = useTabActivityStore((state) => state.setTabActivity)
  const [usageInfo, setUsageInfo] = useState<PlatformUsageSnapshot>({})
  const [planInfo, setPlanInfo] = useState<{ plan?: string; status?: string }>({})
  const [history, setHistory] = useState<UsageHistoryItem[]>([])
  const [modelOptions, setModelOptions] = useState<Array<{ id: string; label: string }>>([])
  const [checkoutLoading, setCheckoutLoading] = useState<'pro' | 'max' | 'credits' | null>(null)
  const [billingMessage, setBillingMessage] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [showAllModels, setShowAllModels] = useState(false)

  const detectCountryCode = () => {
    try {
      const locale = navigator.language || 'en-US'
      const parts = locale.split('-')
      if (parts.length > 1) return parts[1].toUpperCase()
    } catch {}
    return 'US'
  }

  const loadAll = async () => {
    setRefreshing(true)
    setLoadError(null)
    setTabActivity('usage', { status: 'working', message: 'Loading usage data…' })

    if (backendConnected) {
      await window.api.platform.ensureSession().catch(() => false)
    }

    const [usageResult, planResult, modelsResult, historyResult] = await Promise.allSettled([
      backendConnected ? window.api.platform.usage() : Promise.resolve({}),
      backendConnected ? window.api.platform.billingPlan() : Promise.resolve({ plan: 'free', status: 'active' }),
      backendConnected ? window.api.platform.aiModels() : Promise.resolve({ items: [] }),
      backendConnected ? window.api.platform.usageHistory(50) : Promise.resolve({ items: [] })
    ])

    const errors: string[] = []

    if (usageResult.status === 'fulfilled') {
      setUsageInfo(usageResult.value || {})
    } else {
      errors.push(humanizeError(usageResult.reason, 'Could not load monthly usage.'))
    }

    if (planResult.status === 'fulfilled') {
      setPlanInfo(planResult.value || {})
    } else {
      errors.push(humanizeError(planResult.reason, 'Could not load billing plan.'))
    }

    if (modelsResult.status === 'fulfilled') {
      const items = Array.isArray(modelsResult.value?.items) ? modelsResult.value.items : []
      const mapped = mapPlatformModels(items)
      setModelOptions(mapped.map(({ id, label }) => ({ id, label })))
      if (mapped.length > 0 && !mapped.some((entry) => entry.id === model)) {
        setModel(mapped[0].id)
      }
    } else {
      errors.push(humanizeError(modelsResult.reason, 'Could not load entitled models.'))
    }

    if (historyResult.status === 'fulfilled') {
      setHistory(
        (Array.isArray(historyResult.value?.items) ? historyResult.value.items : []) as unknown as UsageHistoryItem[]
      )
    } else {
      errors.push(humanizeError(historyResult.reason, 'Could not load AI activity history.'))
    }

    if (!backendConnected) {
      if (useAIModeStore.getState().mode === 'byok') {
        setLoadError(null)
        setTabActivity('usage', { status: 'success', message: 'Using your own API key' })
      } else {
        setLoadError('Subscription session is not connected. Sign in again to load billing and usage analytics.')
        setTabActivity('usage', { status: 'error', message: 'Subscription not connected' })
      }
    } else if (errors.length > 0) {
      setLoadError(errors[0])
      setTabActivity('usage', { status: 'error', message: 'Usage needs refresh' })
    } else {
      setLoadError(null)
      setTabActivity('usage', { status: 'success', message: 'Usage synced' })
    }

    setRefreshing(false)
  }

  useEffect(() => {
    void loadAll()
  }, [backendConnected])

  const startCheckout = async (planCode: 'pro' | 'max' | 'credits') => {
    // Paid plans are not open yet: rather than sending people into an
    // unfinished checkout, collect interest by email. Flip
    // SUBSCRIPTIONS_ENABLED to true once the payment provider is live.
    if (!SUBSCRIPTIONS_ENABLED) {
      const label = planCode === 'credits' ? 'extra credits' : planCode === 'max' ? 'the Max plan' : 'the Pro plan'
      setBillingMessage(
        `Paid plans are not open yet — FocusFork is in beta and everything works free with your own API key. Want ${label} when it launches? Email me and I'll set you up first.`
      )
      return
    }
    try {
      setCheckoutLoading(planCode)
      setBillingMessage(null)
      const checkout = await window.api.platform.createCheckout({
        planCode,
        country: detectCountryCode(),
      })
      await window.api.openExternal(checkout.checkout_url)
      const label = planCode === 'credits' ? 'Extra credits' : planCode === 'max' ? 'Max' : 'Pro'
      setBillingMessage(`Opened ${label} checkout in ${checkout.currency}. Complete payment, then click Refresh.`)
    } catch (error: any) {
      setBillingMessage(humanizeError(error, `Could not start ${planCode} checkout. Please try again.`))
    } finally {
      setCheckoutLoading(null)
    }
  }

  const emailAboutPlans = (subject: string) =>
    void window.api.openExternal(
      `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(
        "Hi Atikur,\n\nI'm using the FocusFork beta and I'd like to know when paid plans go live.\n\n"
      )}`
    )

  const dailyUsageData = useMemo(() => {
    const days: { day: string; tokens: number }[] = []
    const now = new Date()
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now)
      d.setDate(d.getDate() - i)
      const key = d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })
      const dateStr = d.toISOString().slice(0, 10)
      const dayTokens = history
        .filter((h) => h.created_at.startsWith(dateStr))
        .reduce((sum, h) => sum + h.total_tokens, 0)
      days.push({ day: key, tokens: dayTokens })
    }
    return days
  }, [history])

  const maxDailyTokens = Math.max(1, ...dailyUsageData.map((d) => d.tokens))

  const modelBreakdown = useMemo(() => {
    const totals: Record<string, number> = {}
    let grand = 0
    for (const h of history) {
      totals[h.model] = (totals[h.model] || 0) + h.total_tokens
      grand += h.total_tokens
    }
    return Object.entries(totals)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 4)
      .map(([m, t]) => ({ model: m, pct: grand > 0 ? Math.round((t / grand) * 100) : 0 }))
  }, [history])

  const visibleModels = showAllModels ? modelOptions : modelOptions.slice(0, MODEL_PREVIEW_COUNT)
  const hiddenModelCount = modelOptions.length - MODEL_PREVIEW_COUNT

  return (
    <div className="h-full flex flex-col page-enter" data-testid="usage-page">
      {/* Fixed header */}
      <div className="shrink-0 px-6 pt-5 pb-4 border-b border-border">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h1 className="font-serif text-[25px] font-medium tracking-tight">Usage & Billing</h1>
              <p className="text-[13px] text-text-muted mt-1">
                Track monthly limits and review recent AI activity.
              </p>
            </div>
            <button
              onClick={() => void loadAll()}
              disabled={refreshing}
              className="btn-secondary px-3 py-2 text-[12.5px]"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          {!backendConnected && aiMode === 'byok' && (
            <div className="rounded-[11px] border border-success/30 bg-success-bg px-3 py-2 text-[12px] text-success mb-3">
              You're using your own API key — no FocusFork quotas apply, and there's nothing to bill. Check
              usage on your provider's dashboard (OpenRouter or Google AI Studio). This page only applies if
              you switch to the FocusFork subscription in Settings.
            </div>
          )}
          {!backendConnected && aiMode === 'subscription' && (
            <div className="rounded-[11px] border border-active/30 bg-active-soft px-3 py-2 text-[12px] text-active-text mb-3">
              Subscription session is not connected. Sign in (and check your connection) to load managed AI,
              billing, and usage analytics — or switch to your own API key in Settings.
            </div>
          )}

          {loadError && (
            <div className="rounded-[11px] border border-danger/30 bg-danger-bg px-3 py-2 text-[12px] text-danger mb-3">{loadError}</div>
          )}

          {usageInfo.account_blocked && (
            <section className="shell-card p-4 border-danger/30 bg-danger-bg mb-3">
              <div className="flex items-start gap-3">
                <ShieldAlert className="h-5 w-5 text-danger mt-0.5" />
                <div>
                  <h3 className="font-semibold text-danger text-[14px]">Account paused for billing</h3>
                  <p className="text-[12.5px] text-text-muted mt-1">
                    Status: {usageInfo.subscription_status || 'past_due'}. AI features are blocked until payment is resolved.
                  </p>
                  <button
                    disabled={checkoutLoading !== null || !backendConnected}
                    onClick={() => void startCheckout('pro')}
                    className="mt-2 px-3 py-1.5 text-[12px] font-semibold bg-danger text-white rounded-[8px] hover:opacity-88 disabled:opacity-60"
                  >
                    Resolve billing
                  </button>
                </div>
              </div>
            </section>
          )}

          {/* Plan + Quota — subscription mode only */}
          {!byok && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <section className="shell-card p-4">
              <div className="text-[11px] uppercase font-semibold text-text-muted tracking-wider mb-2">Plan</div>
              <div className="text-[20px] font-semibold uppercase tracking-tight">
                {planInfo.plan || usageInfo.plan || 'free'}
              </div>
              <div className="text-[12px] text-text-muted mt-1">
                {planInfo.status || usageInfo.subscription_status || 'active'}
              </div>
              {SUBSCRIPTIONS_ENABLED ? (
                <div className="flex gap-2 mt-3">
                  <button
                    disabled={checkoutLoading !== null || !backendConnected}
                    onClick={() => void startCheckout('pro')}
                    className="btn-primary text-[11.5px] px-3 py-1.5"
                  >
                    {checkoutLoading === 'pro' ? 'Opening…' : 'Upgrade'}
                  </button>
                  <button
                    disabled={checkoutLoading !== null || !backendConnected}
                    onClick={() => void startCheckout('credits')}
                    className="btn-secondary text-[11.5px] px-3 py-1.5"
                  >
                    {checkoutLoading === 'credits' ? 'Opening…' : 'Buy credits'}
                  </button>
                </div>
              ) : (
                <div className="mt-3">
                  <div className="inline-flex items-center gap-1.5 rounded-full border border-active/30 bg-active-soft px-2.5 py-1 text-[11px] text-active-text">
                    <span className="h-1.5 w-1.5 rounded-full bg-active" />
                    Paid plans coming soon
                  </div>
                  <p className="text-[11.5px] text-text-muted mt-2 leading-relaxed">
                    Everything works free with your own API key while FocusFork is in beta.
                  </p>
                  <button
                    data-testid="plans-email-btn"
                    onClick={() => emailAboutPlans('FocusFork: notify me about paid plans')}
                    className="btn-secondary text-[11.5px] px-3 py-1.5 mt-2.5"
                  >
                    Email me when plans launch
                  </button>
                </div>
              )}
              {billingMessage ? <p className="text-[11px] text-text-muted mt-2">{billingMessage}</p> : null}
            </section>

            <section className="shell-card p-4">
              <div className="text-[11px] uppercase font-semibold text-text-muted tracking-wider mb-3">Tokens</div>
              <UsageMeter
                used={usageInfo.monthly_tokens_used}
                quota={usageInfo.monthly_tokens_quota}
                extra={usageInfo.bonus_tokens_remaining}
              />
            </section>

            <section className="shell-card p-4">
              <div className="text-[11px] uppercase font-semibold text-text-muted tracking-wider mb-3">Requests</div>
              <UsageMeter
                used={usageInfo.monthly_requests_used}
                quota={usageInfo.monthly_requests_quota}
              />
            </section>
          </div>
          )}
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5">
        <div className="max-w-5xl mx-auto space-y-4">
          {byok && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <section className="shell-card p-5">
                <div className="text-[13px] font-semibold mb-1">Your AI setup</div>
                <p className="text-[12.5px] text-text-muted mb-4">
                  Requests go straight from this machine to your provider — FocusFork never meters them.
                </p>
                <div className="space-y-2 mb-4">
                  <div className="flex items-center justify-between border border-border rounded-[9px] px-3 py-2.5 text-[12.5px]">
                    <span className="text-text-muted">Provider</span>
                    <span className="font-medium text-text-main capitalize">{aiProvider || 'not set'}</span>
                  </div>
                  <div className="flex items-center justify-between border border-border rounded-[9px] px-3 py-2.5 text-[12.5px]">
                    <span className="text-text-muted">Model</span>
                    <span className="font-mono text-[11.5px] text-text-main truncate max-w-[220px]">{aiModel || '—'}</span>
                  </div>
                  <div className="flex items-center justify-between border border-border rounded-[9px] px-3 py-2.5 text-[12.5px]">
                    <span className="text-text-muted">API key</span>
                    <span className={hasKey ? 'text-success font-medium' : 'text-danger font-medium'}>
                      {hasKey ? 'Saved securely' : 'Not configured'}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn-secondary text-[12.5px] px-3.5 py-2"
                  onClick={() =>
                    void window.api.openExternal(
                      aiProvider === 'gemini' ? 'https://aistudio.google.com/usage' : 'https://openrouter.ai/activity'
                    )
                  }
                >
                  Open provider usage dashboard
                </button>
              </section>
              <section className="shell-card p-5">
                <div className="text-[13px] font-semibold mb-1">Prefer not to manage keys?</div>
                <p className="text-[12.5px] text-text-muted mb-3 leading-relaxed">
                  The optional FocusFork subscription powers the same workflow with built-in models — nothing
                  else about the app changes.
                </p>
                <ul className="mb-4 space-y-1.5 text-[12.5px] text-text-muted">
                  <li className="flex gap-2"><span className="text-success">✓</span> No API key setup — sign in and go</li>
                  <li className="flex gap-2"><span className="text-success">✓</span> Curated model catalog with free-tier models included</li>
                  <li className="flex gap-2"><span className="text-success">✓</span> Usage analytics and spend tracking on this page</li>
                  <li className="flex gap-2"><span className="text-success">✓</span> Chat history synced across your devices</li>
                </ul>
                <button
                  type="button"
                  data-testid="usage-open-ai-settings-btn"
                  onClick={() => setView('settings')}
                  className="btn-primary text-[12.5px] px-3.5 py-2"
                >
                  Switch mode in Settings → AI Agent
                </button>
              </section>
            </div>
          )}
          {/* Daily chart + Model breakdown */}
          {!byok && (
          <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-4">
            <section className="shell-card p-5">
              <div className="text-[13px] font-semibold mb-1">Daily token usage</div>
              <div className="text-[12px] text-text-muted mb-4">Last 14 days.</div>
              <div className="flex items-end gap-1.5 h-[110px]">
                {dailyUsageData.map((d, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1.5 h-full">
                    <div
                      className="w-full rounded-t-[4px] bg-active transition-all"
                      style={{ height: `${Math.max(2, (d.tokens / maxDailyTokens) * 100)}%` }}
                      title={`${d.tokens.toLocaleString()} tokens`}
                    />
                    <span className="text-[9.5px] text-text-muted">{d.day}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="shell-card p-5">
              <div className="text-[13px] font-semibold mb-3.5">Usage by model</div>
              <div className="flex flex-col gap-3">
                {modelBreakdown.length === 0 ? (
                  <span className="text-[12.5px] text-text-muted">No usage data yet.</span>
                ) : (
                  modelBreakdown.map((m) => (
                    <div key={m.model}>
                      <div className="flex justify-between text-[12px] mb-1.5">
                        <span className="font-mono truncate">{m.model}</span>
                        <span>{m.pct}%</span>
                      </div>
                      <div className="h-[6px] rounded-full bg-card-muted overflow-hidden">
                        <div className="h-full bg-active transition-all" style={{ width: `${m.pct}%` }} />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
          )}

          {/* Available models — collapsible */}
          {!byok && (
          <section className="shell-card p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <span className="text-[13px] font-semibold">Available models</span>
                <span className="text-[12px] text-text-muted ml-2">{modelOptions.length} models on your plan</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {modelOptions.length === 0 ? (
                <span className="text-[12.5px] text-text-muted">No entitled models loaded.</span>
              ) : (
                visibleModels.map((opt) => (
                  <span key={opt.id} className="text-[11.5px] px-2.5 py-1 rounded-full border border-border text-text-muted bg-card-muted">
                    {opt.label}
                  </span>
                ))
              )}
            </div>
            {hiddenModelCount > 0 && (
              <button
                onClick={() => setShowAllModels(!showAllModels)}
                className="mt-2.5 flex items-center gap-1 text-[12px] text-text-muted hover:text-text-main transition-colors"
              >
                <ChevronDown className={clsx('h-3.5 w-3.5 transition-transform', showAllModels && 'rotate-180')} />
                {showAllModels ? 'Show fewer' : `Show ${hiddenModelCount} more`}
              </button>
            )}
          </section>
          )}

          {/* Recent AI activity — internal scroll */}
          {!byok && (
          <section className="shell-card p-5">
            <div className="flex items-center justify-between mb-3.5">
              <div>
                <div className="text-[13px] font-semibold">Recent AI activity</div>
                <div className="text-[12px] text-text-muted mt-0.5">Last {history.length} requests from your account.</div>
              </div>
            </div>
            <div className="max-h-[220px] overflow-y-auto rounded-[8px] border border-border">
              {history.length === 0 ? (
                <p className="py-6 text-center text-text-muted text-[13px]">
                  No AI usage recorded yet. Send a message in Workspace chat to get started.
                </p>
              ) : (
                <table className="w-full text-[12px]">
                  <thead className="sticky top-0 bg-surface border-b border-border">
                    <tr className="text-text-muted text-left">
                      <th className="font-medium px-3 py-2">Time</th>
                      <th className="font-medium px-3 py-2">Model</th>
                      <th className="font-medium px-3 py-2 text-right">Tokens</th>
                      <th className="font-medium px-3 py-2 text-right">Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((row, index) => (
                      <tr
                        key={`${row.created_at}-${row.model}-${index}`}
                        className="border-b border-border last:border-0 hover:bg-surface-hover transition-colors"
                      >
                        <td className="px-3 py-2 text-text-muted whitespace-nowrap">
                          {new Date(row.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                          {' '}
                          <span className="text-[11px]">{new Date(row.created_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</span>
                        </td>
                        <td className="px-3 py-2 font-mono truncate max-w-[200px]">{row.model}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-text-muted">{row.total_tokens.toLocaleString()}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium">${Number(row.cost_usd || 0).toFixed(4)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
          )}
        </div>
      </div>
    </div>
  )
}

function UsageMeter({
  used,
  quota,
  extra,
}: {
  used?: number
  quota?: number
  extra?: number
}) {
  const pct = quota ? usagePercent(used, quota) : 0
  return (
    <div>
      <div className="text-[20px] font-semibold tabular-nums">
        {(used ?? 0).toLocaleString()}
      </div>
      <div className="text-[12px] text-text-muted mt-0.5">
        {quota ? `of ${quota.toLocaleString()}` : 'no quota set'}
        {extra ? ` · +${extra.toLocaleString()} bonus` : ''}
      </div>
      {quota ? (
        <div className="h-[6px] rounded-full bg-card-muted overflow-hidden mt-3">
          <div
            className={clsx('h-full transition-all rounded-full', pct > 90 ? 'bg-danger' : 'bg-active')}
            style={{ width: `${pct}%` }}
          />
        </div>
      ) : null}
    </div>
  )
}
