export interface PlatformModelOption {
  id: string
  label: string
  provider?: string
  costLabel?: string
  category?: string
  available?: boolean
  inputCostPerM?: number
  outputCostPerM?: number
  tierLabel?: string
}

export interface PlatformUsageSnapshot {
  plan?: string
  subscription_status?: string
  account_blocked?: boolean
  monthly_tokens_used?: number
  monthly_tokens_quota?: number
  monthly_requests_used?: number
  monthly_requests_quota?: number
  bonus_tokens_remaining?: number
  per_minute_limit?: number
  allowed_models?: string[]
  estimated_cost_usd_period?: number
  period_start?: string
  period_end?: string
  period?: string
}

export function mapPlatformModels(items: unknown[]): PlatformModelOption[] {
  const mapped: PlatformModelOption[] = []

  for (const raw of items) {
    const item = raw as Record<string, unknown>
    const id = String(item.id || '').trim()
    if (!id) continue

    const inputCost = Number(item.input_cost_per_1m)
    const outputCost = Number(item.output_cost_per_1m)
    const category = String(item.category || '').trim() || undefined
    const available = item.available !== false
    const zeroOperatorCost =
      Number.isFinite(inputCost) && inputCost === 0 && Number.isFinite(outputCost) && outputCost === 0

    let costLabel = 'Usage-based'
    if (zeroOperatorCost) {
      costLabel = 'Free · no API cost'
    } else if (Number.isFinite(inputCost) && inputCost > 0) {
      costLabel = `$${inputCost}/1M in`
    } else if (inputCost === 0) {
      costLabel = 'Low cost'
    }

    const tierLabel = zeroOperatorCost
      ? 'Free · no API cost'
      : !available
        ? 'Premium · upgrade required'
        : category === 'premium' || category === 'smart'
          ? 'Premium · paid API'
          : 'Included · uses API credits'

    mapped.push({
      id,
      label: String(item.name || item.label || id).trim(),
      provider: String(item.provider || '').trim() || undefined,
      costLabel,
      category,
      available,
      inputCostPerM: Number.isFinite(inputCost) ? inputCost : undefined,
      outputCostPerM: Number.isFinite(outputCost) ? outputCost : undefined,
      tierLabel
    })
  }

  return mapped
}

export function usagePercent(used?: number, quota?: number): number {
  if (!quota || quota <= 0) return 0
  return Math.min(100, Math.round(((used || 0) / quota) * 100))
}
