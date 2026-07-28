import { isZeroOperatorCostModel } from './model-entitlements'

export interface ModelCatalogEntry {
  id: string
  label: string
  provider?: string
  costLabel?: string
  tierLabel?: string
  category?: string
  available?: boolean
  disabled?: boolean
  inputCostPerM?: number
  outputCostPerM?: number
}

const VENDOR_LABELS: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google',
  'meta-llama': 'Meta',
  deepseek: 'DeepSeek',
  mistralai: 'Mistral',
  qwen: 'Alibaba Qwen',
  microsoft: 'Microsoft',
  nousresearch: 'Nous',
  'x-ai': 'xAI',
  cohere: 'Cohere',
  perplexity: 'Perplexity',
  moonshotai: 'Moonshot (Kimi)',
  'z-ai': 'Z.ai',
  nvidia: 'NVIDIA',
  amazon: 'Amazon',
  openrouter: 'OpenRouter'
}

export function modelVendorKey(modelId: string): string {
  const slug = modelId.split('/')[0]?.trim().toLowerCase() || 'other'
  return slug || 'other'
}

/**
 * The vendor key used for grouping + brand icon. OpenRouter-style
 * `vendor/model` IDs carry the true vendor in the ID — group by that so the
 * provider rail shows Meta / NVIDIA / Google etc., never one "openrouter"
 * bucket (the backend tags every proxied model with provider=openrouter).
 * Bare IDs like `gpt-4o` or `gemini-2.0-flash` can't be parsed, so those use
 * the explicit `provider` field set by the direct BYOK providers.
 */
export function vendorKeyForModel(option: Pick<ModelCatalogEntry, 'id' | 'provider'>): string {
  if (option.id.includes('/')) return modelVendorKey(option.id)
  const explicit = option.provider?.trim().toLowerCase()
  if (explicit) return explicit
  return modelVendorKey(option.id)
}

export function modelVendorLabel(vendorKey: string): string {
  return VENDOR_LABELS[vendorKey] || vendorKey.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export function modelVendorInitial(vendorKey: string): string {
  const label = modelVendorLabel(vendorKey)
  return label.slice(0, 1).toUpperCase()
}

export function groupModelsByVendor(options: ModelCatalogEntry[]): Map<string, ModelCatalogEntry[]> {
  const groups = new Map<string, ModelCatalogEntry[]>()
  for (const option of options) {
    const key = vendorKeyForModel(option)
    const list = groups.get(key) || []
    list.push(option)
    groups.set(key, list)
  }
  for (const [key, list] of groups) {
    groups.set(
      key,
      [...list].sort((a, b) => a.label.localeCompare(b.label))
    )
  }
  return groups
}

export function modelCostTier(option: ModelCatalogEntry): { label: string; level: 1 | 2 | 3 | 4 } {
  if (isZeroOperatorCostModel(option)) {
    return { label: 'Free', level: 1 }
  }
  const input = option.inputCostPerM ?? 0
  if (input >= 5) return { label: '$$$+', level: 4 }
  if (input >= 1) return { label: '$$$', level: 3 }
  if (input > 0) return { label: '$$', level: 2 }
  return { label: '$', level: 1 }
}

export function modelDescription(option: ModelCatalogEntry): string {
  if (option.disabled || option.available === false) {
    return 'Requires a paid FocusFork plan to use this model.'
  }
  if (isZeroOperatorCostModel(option)) {
    return 'Free on OpenRouter — no per-token API cost.'
  }
  if (option.category === 'premium' || option.category === 'smart') {
    return 'Premium model — uses your plan API credits.'
  }
  if (option.category === 'fast') {
    return 'Fast, cost-efficient model for everyday tasks.'
  }
  return 'Included with your current plan.'
}

export function isModelSelectable(option: ModelCatalogEntry): boolean {
  return !option.disabled && option.available !== false
}
