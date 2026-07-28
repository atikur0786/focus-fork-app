import { safeStorage, shell, app, dialog, nativeImage } from 'electron'
import axios from 'axios'
import fs from 'fs'
import path from 'path'

const GITHUB_SCOPE = 'repo read:user user:email'

interface DeviceCodeResponse {
  device_code: string
  user_code: string
  verification_uri: string
  verification_uri_complete?: string
  expires_in: number
  interval?: number
}

interface TokenResponse {
  access_token?: string
  error?: 'authorization_pending' | 'slow_down' | 'expired_token' | 'access_denied' | string
  error_description?: string
}

export class AuthService {
  private accessToken: string | null = null
  private tokenPath: string = ''
  private githubClientId: string | null = null
  private githubClientSource: 'env' | 'app-config' | 'none' = 'none'

  constructor() {}

  async initialize() {
    this.tokenPath = path.join(app.getPath('userData'), 'auth_token')
    this.loadToken()
  }

  private loadToken() {
    try {
      if (fs.existsSync(this.tokenPath) && safeStorage.isEncryptionAvailable()) {
        const encryptedBuffer = fs.readFileSync(this.tokenPath)
        const decryptedString = safeStorage.decryptString(encryptedBuffer)
        this.accessToken = decryptedString
        console.log('Auth token loaded from secure storage')
      }
    } catch (error) {
      console.error('Failed to load access token:', error)
      this.accessToken = null
    }
  }

  private saveToken(token: string) {
    if (safeStorage.isEncryptionAvailable()) {
      const encryptedBuffer = safeStorage.encryptString(token)
      fs.writeFileSync(this.tokenPath, encryptedBuffer)
    }
  }

  async login(): Promise<boolean> {
    const { clientId } = this.resolveGitHubClientId()
    if (!clientId || clientId === 'your_client_id_here') {
      const isPackaged = app.isPackaged
      dialog.showMessageBox({
        type: 'error',
        title: 'Configuration Error',
        icon: this.getDialogIcon(),
        message: 'GitHub Client ID missing.',
        detail: isPackaged
          ? 'This app build is missing GitHub OAuth configuration. Please reinstall using an official build from the app publisher.'
          : 'For local dev: set GITHUB_CLIENT_ID in .env.\nFor packaged builds: include resources/app-config.json with {"githubClientId":"<your_client_id>"}.'
      })
      return false
    }

    try {
      const deviceCode = await this.requestDeviceCode(clientId)
      const verificationUrl = deviceCode.verification_uri_complete ?? deviceCode.verification_uri
      await shell.openExternal(verificationUrl)

      await dialog.showMessageBox({
        type: 'info',
        title: 'GitHub Sign In',
        icon: this.getDialogIcon(),
        message: 'Complete sign in in your browser.',
        detail: `If prompted, enter this code: ${deviceCode.user_code}\n\nVerification URL: ${deviceCode.verification_uri}`,
        buttons: ['Continue']
      })

      const token = await this.pollDeviceAccessToken(deviceCode, clientId)
      this.accessToken = token
      this.saveToken(token)
      return true
    } catch (error: any) {
      await dialog.showMessageBox({
        type: 'error',
        title: 'GitHub Login Failed',
        icon: this.getDialogIcon(),
        message: 'GitHub Login Failed',
        detail: error?.message || 'Unknown authentication error',
        buttons: ['OK']
      })
      return false
    }
  }

  private getDialogIcon() {
    const candidates = [
      path.join(app.getAppPath(), 'resources', 'app-icon.png'),
      path.join(app.getAppPath(), '..', 'app.asar.unpacked', 'resources', 'app-icon.png'),
      path.join(process.resourcesPath, 'app-icon.png'),
      path.join(process.resourcesPath, 'resources', 'app-icon.png'),
      path.join(process.cwd(), 'resources', 'app-icon.png')
    ]
    for (const iconPath of candidates) {
      try {
        if (!fs.existsSync(iconPath)) continue
        const icon = nativeImage.createFromPath(iconPath)
        if (!icon.isEmpty()) return icon
      } catch {
        // try next candidate
      }
    }
    return undefined
  }

  private async requestDeviceCode(clientId: string): Promise<DeviceCodeResponse> {
    try {
      const body = new URLSearchParams({
        client_id: clientId,
        scope: GITHUB_SCOPE
      })
      const response = await axios.post('https://github.com/login/device/code', body.toString(), {
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      })
      return response.data as DeviceCodeResponse
    } catch (error: unknown) {
      throw new Error(this.formatGitHubAuthError('Failed to start GitHub device flow', error))
    }
  }

  private async pollDeviceAccessToken(deviceCode: DeviceCodeResponse, clientId: string): Promise<string> {
    const start = Date.now()
    const expiresAt = start + deviceCode.expires_in * 1000
    let intervalSeconds = Math.max(deviceCode.interval ?? 5, 1)

    while (Date.now() < expiresAt) {
      await new Promise((resolve) => setTimeout(resolve, intervalSeconds * 1000))
      const body = new URLSearchParams({
        client_id: clientId,
        device_code: deviceCode.device_code,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
      })
      const response = await axios.post('https://github.com/login/oauth/access_token', body.toString(), {
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      })

      const data = response.data as TokenResponse
      if (data.access_token) {
        return data.access_token
      }

      if (data.error === 'authorization_pending') {
        continue
      }

      if (data.error === 'slow_down') {
        intervalSeconds += 5
        continue
      }

      if (data.error === 'expired_token') {
        throw new Error('Device code expired. Please try sign in again.')
      }

      if (data.error === 'access_denied') {
        throw new Error('GitHub authorization was denied.')
      }

      throw new Error(data.error_description || data.error || 'Failed to get access token from GitHub.')
    }

    throw new Error('Timed out waiting for GitHub authorization.')
  }

  private formatGitHubAuthError(prefix: string, error: unknown): string {
    if (!axios.isAxiosError(error)) {
      return `${prefix}.`
    }

    const status = error.response?.status
    const data = error.response?.data as { error?: string; error_description?: string } | undefined
    const detail = data?.error_description || data?.error || error.message
    const message = status ? `${prefix} (${status}): ${detail}` : `${prefix}: ${detail}`
    console.error('GitHub auth request failed', { status, data })
    return message
  }

  getToken() {
    return this.accessToken
  }

  isAuthenticated() {
    return !!this.accessToken
  }

  async logout() {
    this.accessToken = null
    if (fs.existsSync(this.tokenPath)) {
      fs.unlinkSync(this.tokenPath)
    }
  }

  getConfigStatus(): { hasClientId: boolean; source: 'env' | 'app-config' | 'none' } {
    const { clientId, source } = this.resolveGitHubClientId()
    return { hasClientId: !!clientId, source }
  }

  private resolveGitHubClientId(): { clientId: string | null; source: 'env' | 'app-config' | 'none' } {
    if (this.githubClientId) return { clientId: this.githubClientId, source: this.githubClientSource }

    const envClientId = (process.env.GITHUB_CLIENT_ID || '').trim()
    if (envClientId) {
      this.githubClientId = envClientId
      this.githubClientSource = 'env'
      return { clientId: this.githubClientId, source: this.githubClientSource }
    }

    const candidatePaths = [
      path.join(app.getAppPath(), 'resources', 'app-config.json'),
      path.join(app.getAppPath(), '..', 'app.asar.unpacked', 'resources', 'app-config.json'),
      path.join(process.resourcesPath, 'app-config.json'),
      path.join(process.resourcesPath, 'resources', 'app-config.json'),
      path.join(process.cwd(), 'resources', 'app-config.json')
    ]

    for (const configPath of candidatePaths) {
      try {
        if (!fs.existsSync(configPath)) continue
        const raw = fs.readFileSync(configPath, 'utf-8')
        const parsed = JSON.parse(raw) as { githubClientId?: string }
        const fromFile = (parsed.githubClientId || '').trim()
        if (fromFile) {
          this.githubClientId = fromFile
          this.githubClientSource = 'app-config'
          return { clientId: this.githubClientId, source: this.githubClientSource }
        }
      } catch (error) {
        console.error('Failed to read app-config.json', { configPath, error })
      }
    }

    this.githubClientSource = 'none'
    return { clientId: null, source: this.githubClientSource }
  }
}

export const authService = new AuthService()
