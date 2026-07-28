import * as vscode from 'vscode'

type Json = Record<string, unknown>

export class FocusForkApiClient {
  constructor(private readonly context: vscode.ExtensionContext) {}

  private get backendUrl(): string {
    const cfg = vscode.workspace.getConfiguration('focusfork')
    const value = String(cfg.get('backendUrl') ?? 'http://localhost:8080').trim()
    return value.replace(/\/$/, '')
  }

  private get accessToken(): string {
    const cfg = vscode.workspace.getConfiguration('focusfork')
    return String(cfg.get('accessToken') ?? '').trim()
  }

  async get(path: string): Promise<Json> {
    return this.request('GET', path)
  }

  async post(path: string, body: Json): Promise<Json> {
    return this.request('POST', path, body)
  }

  private async request(method: 'GET' | 'POST', path: string, body?: Json): Promise<Json> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    }
    if (this.accessToken) {
      headers.Authorization = `Bearer ${this.accessToken}`
    }

    const response = await fetch(`${this.backendUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    })

    const data = (await response.json().catch(() => ({}))) as Json
    if (!response.ok) {
      const message = String((data?.message as string) || `HTTP ${response.status}`)
      throw new Error(message)
    }
    return data
  }
}
