/**
 * Curated BYOK model lists, shared by the main process (AI provider routing)
 * and the renderer (Settings model picker) so the model options are identical
 * everywhere: Settings, workspace chat, and standalone chat.
 *
 * Pure data — no runtime dependencies — so both bundles can import it.
 */
export interface BYOKModel {
  id: string
  label: string
}

export const BYOK_PROVIDERS = ['openai', 'anthropic', 'gemini', 'openrouter'] as const
export type BYOKProvider = (typeof BYOK_PROVIDERS)[number]

export const CURATED_BYOK_MODELS: Record<string, BYOKModel[]> = {
  openai: [
    { id: 'gpt-5-mini', label: 'GPT-5 Mini' },
    { id: 'gpt-5', label: 'GPT-5' },
    { id: 'gpt-4o-mini', label: 'GPT-4o Mini' },
    { id: 'gpt-4o', label: 'GPT-4o' },
    { id: 'gpt-4.1', label: 'GPT-4.1' },
    { id: 'o3-mini', label: 'o3 Mini' }
  ],
  anthropic: [
    { id: 'claude-sonnet-4-5-20250929', label: 'Claude Sonnet 4.5' },
    { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
    { id: 'claude-opus-4-1-20250805', label: 'Claude Opus 4.1' },
    { id: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' }
  ],
  gemini: [
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
    { id: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash Lite' }
  ],
  openrouter: [
    { id: 'meta-llama/llama-3.3-70b-instruct:free', label: 'Llama 3.3 70B (Free)' },
    { id: 'google/gemini-2.0-flash-exp:free', label: 'Gemini 2.0 Flash (Free)' },
    { id: 'deepseek/deepseek-r1:free', label: 'DeepSeek R1 (Free)' },
    { id: 'anthropic/claude-sonnet-4', label: 'Claude Sonnet 4' },
    { id: 'openai/gpt-4o-mini', label: 'GPT-4o Mini' }
  ]
}

/**
 * Brand vendor key per direct provider, used for grouping + brand icon.
 * OpenRouter is undefined so the UI groups by each model's `vendor/model` id.
 */
export const PROVIDER_VENDOR_KEYS: Record<string, string | undefined> = {
  openai: 'openai',
  anthropic: 'anthropic',
  gemini: 'google',
  openrouter: undefined
}

export function listModelsForProvider(provider: string): BYOKModel[] {
  return CURATED_BYOK_MODELS[provider] || CURATED_BYOK_MODELS.openrouter
}

export function defaultModelForProvider(provider: string): string {
  return listModelsForProvider(provider)[0]?.id || 'meta-llama/llama-3.3-70b-instruct:free'
}
