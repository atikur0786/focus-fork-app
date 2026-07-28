import { app, safeStorage } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { randomUUID } from 'crypto'

export type AIMode = 'byok' | 'subscription'

export interface AIConfig {
  mode: AIMode
  provider: string
  model: string
  telemetryEnabled: boolean
  installId: string
  /** Which provider the stored API key belongs to — a key is never sent to a different provider. */
  keyProvider?: string
}

const DEFAULT_CONFIG: Omit<AIConfig, 'installId'> = {
  mode: 'byok',
  provider: 'openrouter',
  model: 'meta-llama/llama-3.3-70b-instruct:free',
  telemetryEnabled: true
}

/**
 * Persists AI mode/provider/model preferences (plaintext JSON, no secrets)
 * and the BYOK API key (encrypted with Electron safeStorage) in userData.
 */
export class AIConfigService {
  private configPath = ''
  private keyPath = ''
  private config: AIConfig | null = null
  private apiKey = ''

  initialize() {
    const userData = app.getPath('userData')
    this.configPath = path.join(userData, 'ai_config.json')
    this.keyPath = path.join(userData, 'ai_key')
    this.loadConfig()
    this.loadKey()
  }

  private loadConfig() {
    let parsed: Partial<AIConfig> = {}
    try {
      if (fs.existsSync(this.configPath)) {
        parsed = JSON.parse(fs.readFileSync(this.configPath, 'utf-8'))
      }
    } catch (error) {
      console.error('Failed to load AI config, using defaults:', error)
    }
    this.config = {
      mode: parsed.mode === 'subscription' ? 'subscription' : 'byok',
      provider: typeof parsed.provider === 'string' && parsed.provider ? parsed.provider : DEFAULT_CONFIG.provider,
      model: typeof parsed.model === 'string' && parsed.model ? parsed.model : DEFAULT_CONFIG.model,
      telemetryEnabled: parsed.telemetryEnabled !== false,
      installId: typeof parsed.installId === 'string' && parsed.installId ? parsed.installId : randomUUID(),
      // Keys stored before keyProvider existed belong to the provider that was
      // configured at the time, which is the persisted provider.
      keyProvider:
        typeof parsed.keyProvider === 'string' && parsed.keyProvider
          ? parsed.keyProvider
          : typeof parsed.provider === 'string' && parsed.provider
            ? parsed.provider
            : undefined
    }
    if (!parsed.installId) {
      this.saveConfig()
    }
  }

  private saveConfig() {
    if (!this.config) return
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2))
    } catch (error) {
      console.error('Failed to save AI config:', error)
    }
  }

  private loadKey() {
    try {
      if (fs.existsSync(this.keyPath) && safeStorage.isEncryptionAvailable()) {
        this.apiKey = safeStorage.decryptString(fs.readFileSync(this.keyPath))
      }
    } catch (error) {
      console.error('Failed to load AI API key from secure storage:', error)
      this.apiKey = ''
    }
  }

  getConfig(): AIConfig {
    if (!this.config) throw new Error('AIConfigService not initialized')
    return { ...this.config }
  }

  getApiKey(): string {
    return this.apiKey
  }

  hasKey(): boolean {
    return this.apiKey.length > 0
  }

  /**
   * The stored key, but only if it was saved for this provider. Prevents a key
   * from one provider ever being sent to a different provider's API.
   */
  getApiKeyForProvider(provider: string): string {
    if (!this.apiKey) return ''
    return this.config?.keyProvider === provider ? this.apiKey : ''
  }

  hasKeyForProvider(provider: string): boolean {
    return this.getApiKeyForProvider(provider).length > 0
  }

  setMode(mode: AIMode) {
    if (!this.config) throw new Error('AIConfigService not initialized')
    this.config.mode = mode
    this.saveConfig()
  }

  setProviderConfig(provider: string, model: string) {
    if (!this.config) throw new Error('AIConfigService not initialized')
    this.config.provider = provider
    this.config.model = model
    this.saveConfig()
  }

  setApiKey(key: string, provider?: string) {
    this.apiKey = key
    if (this.config) {
      this.config.keyProvider = key ? provider || this.config.provider : undefined
      this.saveConfig()
    }
    try {
      if (!key) {
        if (fs.existsSync(this.keyPath)) fs.unlinkSync(this.keyPath)
        return
      }
      if (!safeStorage.isEncryptionAvailable()) {
        throw new Error('OS secure storage is unavailable; refusing to persist the API key.')
      }
      fs.writeFileSync(this.keyPath, safeStorage.encryptString(key))
    } catch (error) {
      console.error('Failed to persist AI API key:', error)
      throw error
    }
  }

  setTelemetryEnabled(enabled: boolean) {
    if (!this.config) throw new Error('AIConfigService not initialized')
    this.config.telemetryEnabled = enabled
    this.saveConfig()
  }
}

export const aiConfigService = new AIConfigService()
