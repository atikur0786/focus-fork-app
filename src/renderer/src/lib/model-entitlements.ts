import type { PlatformModelOption } from './platform-models'

/** Default free model — Llama 70B tends to be more reliable on OpenRouter than DeepSeek R1 free. */
export const ZERO_COST_DEFAULT_MODEL = 'meta-llama/llama-3.3-70b-instruct:free'

export function isZeroOperatorCostModel(model: Pick<PlatformModelOption, 'inputCostPerM' | 'outputCostPerM'>): boolean {
  return (model.inputCostPerM ?? 1) === 0 && (model.outputCostPerM ?? 1) === 0
}

export function isFreePlan(plan?: string | null): boolean {
  const code = (plan || 'free').trim().toLowerCase()
  return code === 'free' || code === ''
}

/** Models the user may select in chat for the current billing plan. */
export function filterSelectableModels(models: PlatformModelOption[], plan?: string | null): PlatformModelOption[] {
  const entitled = models.filter((model) => model.available !== false)
  if (!isFreePlan(plan)) {
    return entitled
  }
  return entitled.filter(isZeroOperatorCostModel)
}

export function pickDefaultModel(models: PlatformModelOption[], plan?: string | null, current?: string): string {
  const selectable = filterSelectableModels(models, plan)
  if (selectable.length === 0) {
    return isFreePlan(plan) ? ZERO_COST_DEFAULT_MODEL : current || 'openai/gpt-4o-mini'
  }
  if (current && selectable.some((model) => model.id === current)) {
    return current
  }
  const preferred =
    selectable.find((model) => model.id === ZERO_COST_DEFAULT_MODEL) ||
    selectable.find((model) => model.id.includes(':free'))
  return preferred?.id || selectable[0].id
}

export function modelTierLabel(model: PlatformModelOption): string {
  if (isZeroOperatorCostModel(model)) return 'Free · no API cost'
  if (model.available === false) return 'Premium · upgrade required'
  if (model.category === 'premium' || model.category === 'smart') return 'Premium · paid API'
  return 'Included · uses API credits'
}
