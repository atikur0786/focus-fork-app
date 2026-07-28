import { GoogleGenerativeAI } from '@google/generative-ai'
import { listModelsForProvider } from '../../shared/byok-models'

export interface AIProvider {
  chat(messages: { role: string; content: string }[], context: string): Promise<string>
}

const normalizeGeminiModel = (modelName: string): string => {
  const normalized = (modelName || '').trim()
  if (!normalized || normalized === 'gemini-pro') return 'gemini-2.0-flash'
  return normalized
}

const GEMINI_FALLBACK_MODELS = [
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-1.5-flash',
  'gemini-1.5-pro'
]

export class GeminiProvider implements AIProvider {
  private genAI: GoogleGenerativeAI
  private model: any
  private modelName: string
  private apiKey: string

  constructor(apiKey: string, modelName: string) {
    this.apiKey = apiKey
    this.genAI = new GoogleGenerativeAI(apiKey)
    this.modelName = normalizeGeminiModel(modelName)
    this.model = this.genAI.getGenerativeModel({ model: this.modelName })
  }

  private async fetchAvailableModels(): Promise<string[]> {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(this.apiKey)}`
      )
      if (!response.ok) return []
      const payload = (await response.json()) as {
        models?: Array<{ name?: string; supportedGenerationMethods?: string[] }>
      }
      const models = payload.models || []
      return models
        .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
        .map((m) => (m.name || '').replace(/^models\//, ''))
        .filter(Boolean)
    } catch {
      return []
    }
  }

  async listAvailableModels(): Promise<string[]> {
    const models = await this.fetchAvailableModels()
    return models.length > 0 ? models : [...GEMINI_FALLBACK_MODELS]
  }

  private createChat(history: { role: string; parts: { text: string }[] }[]) {
    return this.model.startChat({
      history: history,
      generationConfig: {
        maxOutputTokens: 2048
      }
    })
  }

  private normalizeHistory(messages: { role: string; content: string }[]) {
    const normalized = messages
      .filter((m) => m && typeof m.content === 'string' && m.content.trim().length > 0)
      .map((m) => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }]
      }))

    // Gemini chat requires the first history message role to be `user`.
    while (normalized.length > 0 && normalized[0].role !== 'user') {
      normalized.shift()
    }

    return normalized
  }

  async chat(messages: { role: string; content: string }[], context: string): Promise<string> {
    // Construct the prompt
    // For now, we'll simple concatenation, but we should improve this to use proper chat history if supported by the SDK
    // Gemini supports `sendMessage` on a chat session
    
    // Simplest approach for single turn or simple context:
    const history = this.normalizeHistory(messages.slice(0, -1))

    const lastMessage = messages[messages.length - 1]
    const prompt = context ? `Context:\n${context}\n\nUser Question: ${lastMessage.content}` : lastMessage.content

    try {
      const chat = this.createChat(history)
      const result = await chat.sendMessage(prompt)
      const response = await result.response
      return response.text()
    } catch (error: unknown) {
      const statusCode = typeof error === 'object' && error !== null && 'status' in error ? (error as { status?: number }).status : undefined
      const firstMessage = error instanceof Error ? error.message : String(error)
      const isQuotaError =
        statusCode === 429 ||
        firstMessage.toLowerCase().includes('quota') ||
        firstMessage.toLowerCase().includes('too many requests')

      if (isQuotaError) {
        throw new Error(
          'Gemini quota exceeded for this API key/project. Check billing/quota and retry later.'
        )
      }

      const attempted = new Set<string>([this.modelName])
      const availableModels = await this.fetchAvailableModels()
      const candidateModels = [
        ...availableModels,
        ...GEMINI_FALLBACK_MODELS
      ].filter((m, idx, arr) => arr.indexOf(m) === idx && !attempted.has(m))

      let lastErrorMessage = firstMessage
      for (const fallback of candidateModels) {
        try {
          this.model = this.genAI.getGenerativeModel({ model: fallback })
          this.modelName = fallback
          attempted.add(fallback)
          const fallbackChat = this.createChat(history)
          const result = await fallbackChat.sendMessage(prompt)
          const response = await result.response
          return response.text()
        } catch (fallbackError: unknown) {
          const fallbackStatus =
            typeof fallbackError === 'object' && fallbackError !== null && 'status' in fallbackError
              ? (fallbackError as { status?: number }).status
              : undefined
          const fallbackMsg = fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
          if (fallbackMsg.toLowerCase().includes("first content should be with role 'user'")) {
            throw new Error(
              "Gemini chat history is invalid (must start with a user message). Clear chat and retry."
            )
          }
          if (
            fallbackStatus === 429 ||
            fallbackMsg.toLowerCase().includes('quota') ||
            fallbackMsg.toLowerCase().includes('too many requests')
          ) {
            throw new Error(
              'Gemini quota exceeded for this API key/project. Check billing/quota and retry later.'
            )
          }
          lastErrorMessage = fallbackMsg
          // try next fallback
        }
      }

      throw new Error(
        `Gemini model unavailable for this API key. Last error: ${lastErrorMessage}`
      )
    }
  }
}

export class OpenAIProvider implements AIProvider {
  private apiKey: string
  private modelName: string

  constructor(apiKey: string, modelName: string) {
    this.apiKey = apiKey
    this.modelName = modelName || 'gpt-4o-mini'
  }

  async chat(messages: { role: string; content: string }[], context: string): Promise<string> {
    const chatMessages: { role: string; content: string }[] = []
    if (context) {
      chatMessages.push({ role: 'system', content: context })
    }
    for (const m of messages) {
      if (!m || typeof m.content !== 'string' || !m.content.trim()) continue
      chatMessages.push({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content })
    }
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ model: this.modelName, messages: chatMessages, max_tokens: 4096 })
    })
    if (!response.ok) {
      const body = await response.text().catch(() => '')
      if (response.status === 401) throw new Error('OpenAI rejected the API key. Check your key in Settings.')
      if (response.status === 429) throw new Error('OpenAI rate limit reached. Wait a moment and retry.')
      if (response.status === 404) throw new Error(`OpenAI model "${this.modelName}" not found. Pick a different model in Settings.`)
      throw new Error(`OpenAI request failed (${response.status}): ${body.slice(0, 300)}`)
    }
    const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> }
    const text = payload.choices?.[0]?.message?.content
    if (!text) throw new Error('OpenAI returned an empty response. Try again.')
    return text
  }

  async listModels(): Promise<{ id: string; label: string }[]> {
    try {
      const response = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${this.apiKey}` }
      })
      if (!response.ok) return OPENAI_FALLBACK_MODELS
      const payload = (await response.json()) as { data?: Array<{ id?: string }> }
      const chatModels = (payload.data || [])
        // gpt-*, chatgpt-*, and o-series reasoning models (o1/o3/o4…); excludes
        // non-chat entries like omni-moderation-*, whisper, dall-e, embeddings.
        .filter((m) => m.id && /^(gpt-|chatgpt-|o\d)/.test(m.id))
        .map((m) => ({ id: m.id as string, label: m.id as string }))
        .sort((a, b) => a.id.localeCompare(b.id))
      return chatModels.length > 0 ? chatModels : OPENAI_FALLBACK_MODELS
    } catch {
      return OPENAI_FALLBACK_MODELS
    }
  }
}

const OPENAI_FALLBACK_MODELS = [
  { id: 'gpt-4o-mini', label: 'GPT-4o Mini' },
  { id: 'gpt-4o', label: 'GPT-4o' },
  { id: 'gpt-4.1-mini', label: 'GPT-4.1 Mini' },
  { id: 'gpt-4.1', label: 'GPT-4.1' },
  { id: 'o3-mini', label: 'o3-mini' }
]

export class AnthropicProvider implements AIProvider {
  private apiKey: string
  private modelName: string

  constructor(apiKey: string, modelName: string) {
    this.apiKey = apiKey
    this.modelName = modelName || 'claude-sonnet-4-5-20250929'
  }

  async chat(messages: { role: string; content: string }[], context: string): Promise<string> {
    const chatMessages: { role: string; content: string }[] = []
    for (const m of messages) {
      if (!m || typeof m.content !== 'string' || !m.content.trim()) continue
      chatMessages.push({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content })
    }
    // Anthropic requires alternating user/assistant; ensure first message is user
    while (chatMessages.length > 0 && chatMessages[0].role !== 'user') {
      chatMessages.shift()
    }
    if (chatMessages.length === 0) {
      throw new Error('No valid messages to send.')
    }
    const body: Record<string, unknown> = {
      model: this.modelName,
      max_tokens: 4096,
      messages: chatMessages
    }
    if (context) body.system = context
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    })
    if (!response.ok) {
      const text = await response.text().catch(() => '')
      if (response.status === 401) throw new Error('Anthropic rejected the API key. Check your key in Settings.')
      if (response.status === 429) throw new Error('Anthropic rate limit reached. Wait a moment and retry.')
      if (response.status === 404) throw new Error(`Anthropic model "${this.modelName}" not found. Pick a different model.`)
      throw new Error(`Anthropic request failed (${response.status}): ${text.slice(0, 300)}`)
    }
    const payload = (await response.json()) as { content?: Array<{ type?: string; text?: string }> }
    const textBlock = payload.content?.find((b) => b.type === 'text')
    if (!textBlock?.text) throw new Error('Anthropic returned an empty response. Try again.')
    return textBlock.text
  }

  async listModels(): Promise<{ id: string; label: string }[]> {
    try {
      const response = await fetch('https://api.anthropic.com/v1/models?limit=100', {
        headers: {
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01'
        }
      })
      if (!response.ok) return ANTHROPIC_FALLBACK_MODELS
      const payload = (await response.json()) as { data?: Array<{ id?: string; display_name?: string }> }
      const models = (payload.data || [])
        .filter((m) => m.id)
        .map((m) => ({ id: m.id as string, label: m.display_name || (m.id as string) }))
      return models.length > 0 ? models : ANTHROPIC_FALLBACK_MODELS
    } catch {
      return ANTHROPIC_FALLBACK_MODELS
    }
  }
}

const ANTHROPIC_FALLBACK_MODELS = [
  { id: 'claude-sonnet-4-5-20250929', label: 'Claude Sonnet 4.5' },
  { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
  { id: 'claude-opus-4-1-20250805', label: 'Claude Opus 4.1' },
  { id: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' }
]

export class OpenRouterProvider implements AIProvider {
  private apiKey: string
  private modelName: string

  constructor(apiKey: string, modelName: string) {
    this.apiKey = apiKey
    this.modelName = modelName || 'meta-llama/llama-3.3-70b-instruct:free'
  }

  async chat(messages: { role: string; content: string }[], context: string): Promise<string> {
    const chatMessages: { role: string; content: string }[] = []
    if (context) {
      chatMessages.push({ role: 'system', content: `Context:\n${context}` })
    }
    for (const m of messages) {
      if (!m || typeof m.content !== 'string' || !m.content.trim()) continue
      chatMessages.push({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content })
    }
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/atikur0786/focus-fork-app',
        'X-Title': 'FocusFork'
      },
      body: JSON.stringify({ model: this.modelName, messages: chatMessages })
    })
    if (!response.ok) {
      const body = await response.text().catch(() => '')
      if (response.status === 401) {
        throw new Error('OpenRouter rejected the API key. Check your key in Settings.')
      }
      if (response.status === 429) {
        throw new Error('OpenRouter rate limit reached for this key. Wait a moment and retry.')
      }
      throw new Error(`OpenRouter request failed (${response.status}): ${body.slice(0, 300)}`)
    }
    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const text = payload.choices?.[0]?.message?.content
    if (!text) {
      throw new Error('OpenRouter returned an empty response. Try a different model.')
    }
    return text
  }

  async listModels(): Promise<{ id: string; label: string }[]> {
    try {
      const response = await fetch('https://openrouter.ai/api/v1/models', {
        headers: { Authorization: `Bearer ${this.apiKey}` }
      })
      if (!response.ok) return []
      const payload = (await response.json()) as { data?: Array<{ id?: string; name?: string }> }
      return (payload.data || [])
        .filter((m) => m.id)
        .map((m) => ({ id: m.id as string, label: m.name || (m.id as string) }))
    } catch {
      return []
    }
  }
}

export class AIService {
  private provider: AIProvider | null = null
  private apiKey: string = ''
  private providerName: string = 'gemini'
  private modelName: string = 'gemini-2.0-flash'

  constructor() {}

  setProvider(providerName: string, apiKey: string, modelName: string = 'gemini-2.0-flash') {
    this.providerName = providerName
    this.apiKey = apiKey
    if (providerName === 'gemini') {
      this.modelName = normalizeGeminiModel(modelName)
      this.provider = apiKey ? new GeminiProvider(apiKey, this.modelName) : null
    } else if (providerName === 'openai') {
      this.modelName = modelName || 'gpt-4o-mini'
      this.provider = apiKey ? new OpenAIProvider(apiKey, this.modelName) : null
    } else if (providerName === 'anthropic') {
      this.modelName = modelName || 'claude-sonnet-4-5-20250929'
      this.provider = apiKey ? new AnthropicProvider(apiKey, this.modelName) : null
    } else if (providerName === 'openrouter') {
      this.modelName = modelName || 'meta-llama/llama-3.3-70b-instruct:free'
      this.provider = apiKey ? new OpenRouterProvider(apiKey, this.modelName) : null
    } else {
      this.modelName = modelName
      this.provider = null
    }
    return { provider: this.providerName, hasKey: !!this.apiKey, model: this.modelName }
  }

  setModel(modelName: string) {
    if (modelName && modelName !== this.modelName) {
      this.setProvider(this.providerName, this.apiKey, modelName)
    }
    return { provider: this.providerName, hasKey: !!this.apiKey, model: this.modelName }
  }

  getProvider() {
      return { provider: this.providerName, hasKey: !!this.apiKey, model: this.modelName }
  }

  async chat(messages: any[], context: string, model?: string): Promise<string> {
    if (model) this.setModel(model)
    if (!this.provider) {
      throw new Error(
        'No AI API key configured. Add your own API key in Settings (free), or sign in to use a FocusFork subscription.'
      )
    }
    return await this.provider.chat(messages, context)
  }

  /**
   * Lists the models actually available for the current provider + API key.
   * Live-fetched from the provider when a key is present (so the picker shows
   * every model the key can use); falls back to a curated list otherwise.
   * Each model carries a `vendor` key used by the UI for grouping + brand icon:
   *  - openai/anthropic/gemini → 'openai'/'anthropic'/'google' (bare IDs)
   *  - openrouter → undefined, so the UI groups by the `vendor/model` ID prefix
   */
  async listModels(): Promise<{ id: string; label: string; vendor?: string }[]> {
    const key = this.apiKey
    try {
      if (this.providerName === 'openai' && key) {
        const models = await new OpenAIProvider(key, this.modelName).listModels()
        if (models.length > 0) return models.map((m) => ({ ...m, vendor: 'openai' }))
      } else if (this.providerName === 'gemini' && key) {
        const gemini =
          this.provider instanceof GeminiProvider ? this.provider : new GeminiProvider(key, this.modelName)
        const ids = await gemini.listAvailableModels()
        if (ids.length > 0) return ids.map((id) => ({ id, label: prettifyModelId(id), vendor: 'google' }))
      } else if (this.providerName === 'openrouter' && key) {
        const models = await new OpenRouterProvider(key, this.modelName).listModels()
        if (models.length > 0) return models // vendor parsed from `vendor/model` id
      } else if (this.providerName === 'anthropic' && key) {
        const models = await new AnthropicProvider(key, this.modelName).listModels()
        if (models.length > 0) return models.map((m) => ({ ...m, vendor: 'anthropic' }))
      }
    } catch (error) {
      console.warn(`[FocusFork AI] listModels live fetch failed for ${this.providerName}:`, error)
    }
    // No key yet, or the live fetch failed — fall back to the curated list.
    const vendor = CURATED_VENDOR_KEYS[this.providerName]
    return listModelsForProvider(this.providerName).map((m) => (vendor ? { ...m, vendor } : m))
  }
}

/** Brand vendor key per direct provider (OpenRouter groups by its own IDs). */
const CURATED_VENDOR_KEYS: Record<string, string | undefined> = {
  openai: 'openai',
  anthropic: 'anthropic',
  gemini: 'google',
  openrouter: undefined
}

/** Turns a bare model id like `gemini-2.0-flash` into `Gemini 2.0 Flash`. */
function prettifyModelId(id: string): string {
  return id
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bGemini\b/i, 'Gemini')
}

export const aiService = new AIService()
