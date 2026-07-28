import axios from 'axios'
import fs from 'fs'
import path from 'path'
import { app, safeStorage } from 'electron'
import type { IssueSearchRequest, IssueSearchResponse } from '../../shared/issue-search-types'

export type AIErrorCode =
  | 'QUOTA_EXCEEDED'
  | 'AUTH_FAILED'
  | 'MODEL_UNAVAILABLE'
  | 'RATE_LIMITED'
  | 'NETWORK_ERROR'
  | 'INVALID_REQUEST'
  | 'ACCOUNT_SUSPENDED'

export interface GitHubIdentityPayload {
  email: string
  display_name: string
  avatar_url: string
  github_id: number
  github_login: string
  access_token: string
}

interface BackendSessionState {
  accessToken: string
  refreshToken: string
  userId: string
  currentSessionId?: string
}

interface SessionUpsertInput {
  repoOwner: string
  repoName: string
  issueNumber?: number
  status?: string
  branchName?: string
  metadata?: Record<string, unknown>
}

interface ContributionInput {
  sessionId?: string
  repoOwner: string
  repoName: string
  issueNumber?: number
  prNumber?: number
  eventType: string
  metadata?: Record<string, unknown>
}

interface BackendForkResponse {
  full_name?: string
  html_url?: string
  owner_login?: string
  default_branch?: string
}

interface BackendPullRequestInput {
  owner: string
  repo: string
  head: string
  base: string
  title: string
  body?: string
  issueNumber?: number
}

interface BackendUserProfile {
  id?: string
  email?: string
  display_name?: string
  avatar_url?: string
  github_login?: string
}

export class PlatformService {
  private backendBaseURL = (process.env.FOCUSFORK_BACKEND_URL || 'http://localhost:8080').replace(/\/$/, '')
  private enabled = String(process.env.FEATURE_BACKEND_SYNC ?? 'true') === 'true'
  private fallbackEnabled = String(process.env.FEATURE_DESKTOP_FALLBACK ?? 'false') === 'true'
  private sessionPath = ''
  private state: BackendSessionState | null = null
  private sessionChangeListeners = new Set<(connected: boolean) => void>()

  initialize() {
    this.sessionPath = path.join(app.getPath('userData'), 'platform_session')
    this.loadSession()
  }

  // null = never checked yet; once a health check runs, "connected" requires
  // the server to actually be reachable — a stale session token alone must
  // never present as connected in the UI.
  private lastReachable: boolean | null = null

  status() {
    return {
      enabled: this.enabled,
      fallbackEnabled: this.fallbackEnabled,
      connected: !!this.state?.accessToken && this.lastReachable !== false,
      hasSession: !!this.state?.currentSessionId,
      backendBaseURL: this.backendBaseURL
    }
  }

  async checkBackendReachable(): Promise<boolean> {
    if (!this.enabled) return false
    let reachable = false
    try {
      const response = await axios.get(`${this.backendBaseURL}/healthz`, { timeout: 4000 })
      reachable = response.status >= 200 && response.status < 300
    } catch {
      reachable = false
    }
    const changed = this.lastReachable !== reachable
    this.lastReachable = reachable
    if (changed) {
      this.notifySessionChange()
    }
    return reachable
  }

  private requireConnected(feature: string): void {
    if (!this.enabled) {
      throw new Error(`Backend sync is disabled. Cannot use ${feature}.`)
    }
    if (!this.state?.accessToken) {
      throw new Error(`Backend session is not connected. Sign in again to use ${feature}.`)
    }
  }

  private getAccessToken(feature: string): string {
    this.requireConnected(feature)
    return this.state!.accessToken
  }

  onSessionChange(listener: (connected: boolean) => void): () => void {
    this.sessionChangeListeners.add(listener)
    return () => {
      this.sessionChangeListeners.delete(listener)
    }
  }

  private notifySessionChange(): void {
    const connected = !!this.state?.accessToken
    for (const listener of this.sessionChangeListeners) {
      try {
        listener(connected)
      } catch {
        // Ignore listener failures.
      }
    }
  }

  logout() {
    this.state = null
    try {
      if (fs.existsSync(this.sessionPath)) {
        fs.unlinkSync(this.sessionPath)
      }
    } catch {
      // Ignore cleanup errors.
    }
    this.notifySessionChange()
  }

  async syncAuth(identity: GitHubIdentityPayload): Promise<boolean> {
    if (!this.enabled) return false
    const response = await this.httpPost('/v1/auth/github/callback', identity)
    this.state = {
      accessToken: response.access_token,
      refreshToken: response.refresh_token,
      userId: response.user_id,
      currentSessionId: this.state?.currentSessionId
    }
    this.saveSession()
    this.notifySessionChange()
    return true
  }

  async upsertSession(input: SessionUpsertInput): Promise<{ sessionId: string; resumed: boolean } | null> {
    if (!this.enabled || !this.state?.accessToken) return null

    const sessions = await this.httpGet('/v1/sessions?limit=50&offset=0', this.state.accessToken)
    const items = Array.isArray(sessions?.items) ? sessions.items : []
    const found = items.find((item: any) => {
      const sameRepo = item?.repo_owner === input.repoOwner && item?.repo_name === input.repoName
      const sameIssue = Number(item?.issue_number || 0) === Number(input.issueNumber || 0)
      return sameRepo && sameIssue && item?.status !== 'completed'
    })

    if (found?.id) {
      this.state.currentSessionId = found.id
      this.saveSession()
      return { sessionId: found.id, resumed: true }
    }

    const created = await this.httpPost(
      '/v1/sessions',
      {
        repo_owner: input.repoOwner,
        repo_name: input.repoName,
        issue_number: input.issueNumber,
        status: input.status || 'active',
        branch_name: input.branchName,
        metadata: input.metadata || {}
      },
      this.state.accessToken
    )

    this.state.currentSessionId = created.id
    this.saveSession()
    return { sessionId: created.id, resumed: false }
  }

  async addSessionEvent(eventType: string, payload: Record<string, unknown>, idempotencyKey?: string): Promise<void> {
    if (!this.enabled || !this.state?.accessToken || !this.state.currentSessionId) return
    await this.httpPost(
      `/v1/sessions/${this.state.currentSessionId}/events`,
      {
        event_type: eventType,
        payload
      },
      this.state.accessToken,
      idempotencyKey
    )
  }

  async addContribution(input: ContributionInput): Promise<void> {
    if (!this.enabled || !this.state?.accessToken) return
    await this.httpPost(
      '/v1/contributions',
      {
        session_id: input.sessionId || this.state.currentSessionId,
        repo_owner: input.repoOwner,
        repo_name: input.repoName,
        issue_number: input.issueNumber,
        pr_number: input.prNumber,
        event_type: input.eventType,
        metadata: input.metadata || {}
      },
      this.state.accessToken
    )
  }

  async listContributions(limit: number = 50, offset: number = 0): Promise<any> {
    if (!this.enabled || !this.state?.accessToken) {
      return { items: [], total: 0 }
    }
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(200, Math.floor(limit))) : 50
    const safeOffset = Number.isFinite(offset) ? Math.max(0, Math.floor(offset)) : 0
    return this.httpGetWithAuth(`/v1/contributions?limit=${safeLimit}&offset=${safeOffset}`)
  }

  async listChatThreads(limit: number = 200): Promise<any> {
    if (!this.enabled || !this.state?.accessToken) {
      return { items: [] }
    }
    try {
      const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(500, Math.floor(limit))) : 200
      return await this.httpGetWithAuth(`/v1/chat/threads?limit=${safeLimit}`)
    } catch (error) {
      if (this.isRecoverableUsageError(error)) {
        return { items: [] }
      }
      throw error
    }
  }

  async upsertChatThread(clientKey: string, payload: Record<string, unknown>): Promise<any> {
    if (!this.enabled || !this.state?.accessToken || !clientKey.trim()) return null
    try {
      const encodedKey = encodeURIComponent(clientKey)
      return await this.httpPutWithAuth(`/v1/chat/threads/${encodedKey}`, payload)
    } catch (error) {
      if (this.isRecoverableUsageError(error)) {
        return null
      }
      throw error
    }
  }

  async deleteChatThread(clientKey: string): Promise<void> {
    if (!this.enabled || !this.state?.accessToken || !clientKey.trim()) return
    try {
      const encodedKey = encodeURIComponent(clientKey)
      await this.httpDeleteWithAuth(`/v1/chat/threads/${encodedKey}`)
    } catch (error) {
      if (this.isRecoverableUsageError(error)) {
        return
      }
      throw error
    }
  }

  async usage(): Promise<any> {
    try {
      return await this.httpGetWithAuth('/v1/usage')
    } catch (error) {
      if (this.isRecoverableUsageError(error)) {
        return this.defaultUsageSnapshot()
      }
      throw error
    }
  }

  async usageHistory(limit = 50): Promise<any> {
    try {
      const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(100, Math.floor(limit))) : 50
      return await this.httpGetWithAuth(`/v1/usage/history?limit=${safeLimit}`)
    } catch (error) {
      if (this.isRecoverableUsageError(error)) {
        return { items: [] }
      }
      throw error
    }
  }

  async billingPlan(): Promise<any> {
    try {
      return await this.httpGetWithAuth('/v1/billing/plan')
    } catch (error) {
      if (this.isRecoverableUsageError(error)) {
        return { plan: 'free', status: 'active' }
      }
      throw error
    }
  }

  async aiModels(): Promise<any> {
    try {
      return await this.httpGetWithAuth('/v1/ai/models')
    } catch (error) {
      if (this.isRecoverableUsageError(error)) {
        return { items: [] }
      }
      throw error
    }
  }

  async ensureBackendSession(): Promise<boolean> {
    if (!this.enabled) return false
    if (!this.state?.accessToken) {
      if (this.state?.refreshToken && (await this.refreshAccessToken())) {
        return true
      }
      return false
    }
    try {
      await this.httpGetWithAuth('/auth/me')
      return true
    } catch {
      if (this.state?.refreshToken && (await this.refreshAccessToken())) {
        return true
      }
      return false
    }
  }

  async currentUser(): Promise<{ login: string; name: string; email: string; avatar_url: string; html_url: string } | null> {
    const response = (await this.httpGetWithAuth('/auth/me')) as BackendUserProfile
    const login = String(response?.github_login || '').trim()
    if (!login) return null
    return {
      login,
      name: String(response?.display_name || login),
      email: String((response as any)?.email || ''),
      avatar_url: String(response?.avatar_url || ''),
      html_url: `https://github.com/${login}`
    }
  }

  async createCheckoutSession(
    planCode: 'pro' | 'max' | 'credits',
    country: string,
    successURL?: string,
    cancelURL?: string
  ): Promise<any> {
    if (!this.enabled || !this.state?.accessToken) {
      throw new Error('Backend billing is not enabled.')
    }
    return this.httpPost(
      '/v1/billing/checkout-session',
      {
        plan_code: planCode,
        country,
        success_url: successURL,
        cancel_url: cancelURL
      },
      this.state.accessToken
    )
  }

  async searchIssues(request: IssueSearchRequest): Promise<IssueSearchResponse> {
    const token = this.getAccessToken('issue search')
    const query = (request.query || '').trim()
    const page = Math.max(1, request.page ?? 1)
    const perPage = Math.min(100, Math.max(1, request.perPage ?? 30))
    const params = new URLSearchParams({
      q: query,
      page: String(page),
      per_page: String(perPage)
    })
    if (request.sort) params.set('sort', request.sort)
    if (request.order) params.set('order', request.order)

    let response: any
    try {
      response = await this.httpGet(`/v1/github/issues?${params.toString()}`, token)
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status
        const rawMessage = String((error.response?.data as any)?.error?.message || error.message || '').toLowerCase()
        if (status === 401) {
          this.logout()
          throw new Error('Backend session expired. Please sign in again.')
        }
        if (status === 403 || rawMessage.includes('quota exhausted') || rawMessage.includes('rate limit')) {
          throw new Error('GitHub API rate limit reached. Please wait a few minutes and retry.')
        }
        if (status === 429) {
          throw new Error('Backend rate limit reached. Please wait and retry.')
        }
      }
      throw error
    }
    const items = Array.isArray(response?.items) ? response.items : []
    const totalCount = Number(response?.total_count ?? items.length)
    const maxPage = Math.max(1, Math.ceil(totalCount / perPage))
    const parseOptionalNumber = (value: unknown): number | undefined => {
      if (typeof value === 'number' && Number.isFinite(value)) return value
      if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) return Number(value)
      return undefined
    }

    const mappedItems = items.map((item: any) => {
      const fullName = String(
        item?.repo_full_name ||
          item?.repository?.full_name ||
          item?.repository?.nameWithOwner ||
          ''
      ).trim()
      const fromSplit = fullName.includes('/') ? fullName.split('/') : []
      const ownerFromObject =
        typeof item?.owner === 'string'
          ? item.owner
          : typeof item?.owner?.login === 'string'
            ? item.owner.login
            : typeof item?.repository?.owner?.login === 'string'
              ? item.repository.owner.login
              : fromSplit[0] || ''
      const repoFromObject =
        typeof item?.repo === 'string'
          ? item.repo
          : typeof item?.repository?.name === 'string'
            ? item.repository.name
            : fromSplit[1] || ''
      const ownerLogin = String(ownerFromObject || '').trim()
      const repoName = String(repoFromObject || '').trim()
      const resolvedFullName = fullName || `${ownerLogin}/${repoName}`

      return {
      labels: Array.isArray(item?.labels)
        ? item.labels.map((label: any, idx: number) => ({
            id: Number(label?.id ?? idx + 1),
            name: String(label?.name ?? label ?? ''),
            color: String(label?.color ?? 'd4d4d8')
          }))
        : [],
      id: Number(item?.id || 0),
      number: Number(item?.number || 0),
      title: String(item?.title || 'Untitled issue'),
      body: item?.body ?? null,
      html_url: String(item?.html_url || ''),
      state: String(item?.state || 'open').toLowerCase(),
      repository: {
        full_name: resolvedFullName,
        name: repoName,
        stars: parseOptionalNumber(item?.stars ?? item?.stargazers_count),
        forks: parseOptionalNumber(item?.forks ?? item?.forks_count),
        openIssues: parseOptionalNumber(item?.open_issues ?? item?.open_issues_count),
        openPRs: parseOptionalNumber(item?.open_prs ?? item?.open_pull_requests),
        owner: {
          login: ownerLogin,
          avatar_url: ownerLogin ? `https://github.com/${ownerLogin}.png` : ''
        },
        primaryLanguage:
          item?.primary_language_name || item?.language || item?.repo_language
            ? {
                name: String(item?.primary_language_name || item?.language || item?.repo_language || 'Unknown'),
                color: String(item?.primary_language_color || item?.language_color || '64748b')
              }
            : null
      },
      created_at: String(item?.created_at || item?.createdAt || ''),
      updated_at: String(item?.updated_at || item?.updatedAt || item?.created_at || item?.createdAt || '')
    }
    })

    return {
      items: mappedItems,
      totalCount,
      page,
      perPage,
      hasNextPage: page < maxPage
    }
  }

  async forkRepository(owner: string, repo: string): Promise<BackendForkResponse> {
    const token = this.getAccessToken('repository fork')
    return this.httpPost('/api/github/fork', { owner, repo }, token)
  }

  async createPullRequest(input: BackendPullRequestInput): Promise<any> {
    const token = this.getAccessToken('pull request creation')
    return this.httpPost(
      '/api/github/pr',
      {
        owner: input.owner,
        repo: input.repo,
        head: input.head,
        base: input.base,
        title: input.title,
        body: input.body,
        issue_number: input.issueNumber,
        session_id: this.state?.currentSessionId
      },
      token
    )
  }

  async listPullRequests(owner: string, repo: string, state: 'open' | 'closed' | 'all' = 'open'): Promise<any[]> {
    const token = this.getAccessToken('pull request list')
    const encodedOwner = encodeURIComponent(owner)
    const encodedRepo = encodeURIComponent(repo)
    const encodedState = encodeURIComponent(state)
    const response = await this.httpGet(`/api/github/prs?owner=${encodedOwner}&repo=${encodedRepo}&state=${encodedState}`, token)
    return Array.isArray(response?.items) ? response.items : []
  }

  async aiChat(
    messages: Array<{ role: string; content: string }>,
    context: string,
    model?: string
  ): Promise<{ text?: string; model?: string; fallbackUsed?: boolean; errorCode?: AIErrorCode; message?: string; debugHint?: string }> {
    if (!this.enabled) {
      return { errorCode: 'NETWORK_ERROR', message: 'Backend AI is disabled for this build.' }
    }
    if (!this.state?.accessToken) {
      if (this.state?.refreshToken && (await this.refreshAccessToken())) {
        // Session restored from refresh token.
      } else {
        return {
          errorCode: 'AUTH_FAILED',
          message:
            'Your GitHub account is connected, but FocusFork lost its backend session. Reconnect to continue chatting.',
          debugHint:
            'Managed AI chat requires a backend session token. Use Reconnect backend in chat or open Settings and sign in again if this keeps happening.'
        }
      }
    }

    const payload = { messages, context, model }
    const payloadChars = JSON.stringify(payload).length
    const timeoutMs = payloadChars > 120000 ? 180000 : 120000

    try {
      const response = await this.httpPostWithAuth('/v1/ai/chat', payload, undefined, timeoutMs)
      const text =
        typeof response?.message === 'string'
          ? response.message
          : typeof response?.text === 'string'
            ? response.text
            : ''
      if (text.trim()) {
        const resolvedModel = typeof response?.model === 'string' ? response.model : model
        return {
          text,
          model: resolvedModel,
          fallbackUsed: response?.fallback_used === true
        }
      }
      console.error('[FocusFork AI] Empty backend response', {
        model,
        messageCount: messages.length,
        payloadChars,
        backend: this.backendBaseURL
      })
      return {
        errorCode: 'NETWORK_ERROR',
        message: 'FocusFork received an empty AI response from the backend.',
        debugHint: `Backend returned no text (${Math.round(payloadChars / 1024)}KB request, ${messages.length} messages). The upstream model may have timed out or rejected the payload.`
      }
    } catch (error: any) {
      const code = this.extractErrorCode(error)
      const debugHint = this.buildAiDebugHint(error, {
        model,
        messageCount: messages.length,
        payloadChars,
        timeoutMs
      })
      console.error('[FocusFork AI] Request failed', {
        code,
        model,
        messageCount: messages.length,
        payloadChars,
        timeoutMs,
        backend: this.backendBaseURL,
        status: axios.isAxiosError(error) ? error.response?.status : undefined,
        apiMessage: axios.isAxiosError(error) ? (error.response?.data as any)?.error?.message : undefined,
        error: error instanceof Error ? error.message : String(error)
      })
      return {
        errorCode: code,
        message: this.normalizeErrorMessage(code, error),
        debugHint
      }
    }
  }

  async generateCommitMessage(diff: string, context: string): Promise<string> {
    if (!this.enabled || !this.state?.accessToken) {
      throw new Error('Backend session required to generate commit messages.')
    }
    try {
      const response = await this.httpPostWithAuth('/api/ai/commit-message', { diff: diff.slice(0, 60000), context })
      const text = typeof response?.message === 'string' ? response.message : typeof response?.text === 'string' ? response.text : ''
      return text.trim()
    } catch (error: any) {
      console.error('[FocusFork] commit-message generation failed', error?.message || error)
      throw new Error('Could not generate a commit message. Please try again.')
    }
  }

  private buildAiDebugHint(
    error: unknown,
    stats: { model?: string; messageCount: number; payloadChars: number; timeoutMs: number }
  ): string {
    const kb = Math.round(stats.payloadChars / 1024)
    if (axios.isAxiosError(error)) {
      if (error.code === 'ECONNABORTED') {
        return `Request timed out after ${Math.round(stats.timeoutMs / 1000)}s (${kb}KB payload, ${stats.messageCount} messages). Try fewer attached files, a shorter prompt, or switch models in Settings.`
      }
      const status = error.response?.status
      if (status) {
        return `Backend HTTP ${status} (${kb}KB payload, ${stats.messageCount} messages${stats.model ? `, model ${stats.model}` : ''}). Check backend logs around /v1/ai/chat for this status.`
      }
      if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        return `Could not reach backend at ${this.backendBaseURL}. Confirm the backend is running and VITE_BACKEND_URL is correct.`
      }
    }
    return `AI request failed (${kb}KB payload, ${stats.messageCount} messages). Open DevTools > Console in FocusFork for [FocusFork AI] logs.`
  }

  private normalizeErrorMessage(code: AIErrorCode, error: unknown): string {
    switch (code) {
      case 'QUOTA_EXCEEDED':
        return 'Your monthly quota is exhausted. Upgrade your plan, buy extra credits, or wait for reset.'
      case 'ACCOUNT_SUSPENDED':
        return 'Your account is paused due to an unpaid bill. Resolve billing in Usage & Billing to continue.'
      case 'AUTH_FAILED':
        return 'Authentication failed. Reconnect your account from Settings.'
      case 'MODEL_UNAVAILABLE':
        if (axios.isAxiosError(error)) {
          const apiMessage = String((error.response?.data as { error?: { message?: string } })?.error?.message || '').trim()
          if (apiMessage) return apiMessage
        }
        return 'Selected model is unavailable on your plan or on OpenRouter. Try Llama 3.3 70B (Free), then retry.'
      case 'RATE_LIMITED':
        if (axios.isAxiosError(error)) {
          const apiMessage = String((error.response?.data as { error?: { message?: string } })?.error?.message || '').trim()
          if (apiMessage) return apiMessage
        }
        return 'That model is busy or you are sending messages too quickly. Wait about a minute, try another free model from the chat header, then retry.'
      case 'INVALID_REQUEST':
        return 'That AI request could not be processed. Try another model, shorten the prompt, or remove attachments.'
      case 'NETWORK_ERROR':
        return 'The AI service lost connection or timed out. Check your network and try again.'
      default:
        if (axios.isAxiosError(error)) {
          if (error.code === 'ECONNABORTED') {
            return 'The AI request timed out. Please try again or use a shorter prompt.'
          }
          const lower = String(error.message || '').toLowerCase()
          if (
            error.code === 'ECONNRESET' ||
            lower.includes('socket hang up') ||
            error.code === 'ECONNREFUSED' ||
            error.code === 'ENOTFOUND'
          ) {
            return 'The AI service lost connection or timed out. Check your network and try again.'
          }
        }
        return 'We could not reach the AI assistant. Please try again.'
    }
  }

  private extractErrorCode(error: unknown): AIErrorCode {
    if (!axios.isAxiosError(error)) return 'NETWORK_ERROR'
    const apiCode = (error.response?.data as any)?.error?.code
    if (
      apiCode === 'QUOTA_EXCEEDED' ||
      apiCode === 'AUTH_FAILED' ||
      apiCode === 'MODEL_UNAVAILABLE' ||
      apiCode === 'RATE_LIMITED' ||
      apiCode === 'NETWORK_ERROR' ||
      apiCode === 'INVALID_REQUEST' ||
      apiCode === 'ACCOUNT_SUSPENDED'
    ) {
      return apiCode
    }
    if (error.code === 'ECONNABORTED') return 'NETWORK_ERROR'
    if (error.code === 'ECONNRESET') return 'NETWORK_ERROR'
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') return 'NETWORK_ERROR'
    if (String(error.message || '').toLowerCase().includes('socket hang up')) return 'NETWORK_ERROR'
    return 'NETWORK_ERROR'
  }

  private defaultUsageSnapshot() {
    const now = new Date()
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
    return {
      plan: 'free',
      subscription_status: 'active',
      account_blocked: false,
      monthly_tokens_used: 0,
      monthly_tokens_quota: 0,
      monthly_requests_used: 0,
      monthly_requests_quota: 0,
      bonus_tokens_remaining: 0,
      per_minute_limit: 0,
      allowed_models: [],
      estimated_cost_usd_period: 0,
      period_start: start.toISOString(),
      period_end: end.toISOString()
    }
  }

  private isRecoverableUsageError(error: unknown): boolean {
    if (!axios.isAxiosError(error)) return false
    const status = error.response?.status
    return status === 404 || status === 500 || status === 503
  }

  private wrapHttpError(error: unknown): Error {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status
      const apiMessage = String((error.response?.data as any)?.error?.message || '').trim()
      if (status === 401) {
        return new Error('Backend session expired. Please sign in again.')
      }
      if (apiMessage) return new Error(apiMessage)
      if (status === 500) return new Error('The backend could not complete that request right now.')
      if (status === 503) return new Error('The backend is temporarily unavailable.')
    }
    if (error instanceof Error) return error
    return new Error('Request failed.')
  }

  private async refreshAccessToken(): Promise<boolean> {
    if (!this.state?.refreshToken) return false
    try {
      const response = await axios.post(
        `${this.backendBaseURL}/v1/auth/refresh`,
        {},
        {
          timeout: 15000,
          headers: {
            Cookie: `focusfork_refresh_token=${this.state.refreshToken}`
          },
          validateStatus: () => true
        }
      )
      if (response.status !== 200) return false
      const accessToken = response.data?.access_token
      if (typeof accessToken !== 'string' || !accessToken.trim()) return false
      this.state.accessToken = accessToken
      const setCookies = response.headers['set-cookie']
      if (Array.isArray(setCookies)) {
        for (const cookie of setCookies) {
          const match = cookie.match(/focusfork_refresh_token=([^;]+)/)
          if (match?.[1]) {
            this.state.refreshToken = match[1]
            break
          }
        }
      }
      this.saveSession()
      this.notifySessionChange()
      return true
    } catch {
      return false
    }
  }

  private async httpPostWithAuth(
    pathname: string,
    body: any,
    idempotencyKey?: string,
    timeoutMs: number = 15000,
    retried = false
  ): Promise<any> {
    const token = this.getAccessToken('request')
    try {
      return await this.httpPost(pathname, body, token, idempotencyKey, timeoutMs)
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 401 && !retried) {
        const refreshed = await this.refreshAccessToken()
        if (refreshed) {
          return this.httpPostWithAuth(pathname, body, idempotencyKey, timeoutMs, true)
        }
        this.logout()
      }
      throw error
    }
  }

  private async httpGetWithAuth(pathname: string, retried = false): Promise<any> {
    const token = this.getAccessToken('request')
    try {
      return await this.httpGet(pathname, token)
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 401 && !retried) {
        const refreshed = await this.refreshAccessToken()
        if (refreshed) {
          return this.httpGetWithAuth(pathname, true)
        }
        this.logout()
      }
      throw this.wrapHttpError(error)
    }
  }

  private async httpPutWithAuth(pathname: string, body: any, retried = false): Promise<any> {
    const token = this.getAccessToken('request')
    try {
      return await this.httpPut(pathname, body, token)
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 401 && !retried) {
        const refreshed = await this.refreshAccessToken()
        if (refreshed) {
          return this.httpPutWithAuth(pathname, body, true)
        }
        this.logout()
      }
      throw this.wrapHttpError(error)
    }
  }

  private async httpDeleteWithAuth(pathname: string, retried = false): Promise<void> {
    const token = this.getAccessToken('request')
    try {
      await this.httpDelete(pathname, token)
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 401 && !retried) {
        const refreshed = await this.refreshAccessToken()
        if (refreshed) {
          await this.httpDeleteWithAuth(pathname, true)
          return
        }
        this.logout()
      }
      throw this.wrapHttpError(error)
    }
  }

  private async httpGet(pathname: string, accessToken: string): Promise<any> {
    const response = await axios.get(`${this.backendBaseURL}${pathname}`, {
      timeout: 15000,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    })
    return response.data
  }

  private async httpPost(
    pathname: string,
    body: any,
    accessToken?: string,
    idempotencyKey?: string,
    timeoutMs: number = 15000
  ): Promise<any> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    }
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey

    const response = await axios.post(`${this.backendBaseURL}${pathname}`, body, {
      timeout: timeoutMs,
      headers
    })
    return response.data
  }

  private async httpPut(pathname: string, body: any, accessToken: string): Promise<any> {
    const response = await axios.put(`${this.backendBaseURL}${pathname}`, body, {
      timeout: 30000,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    })
    return response.data
  }

  private async httpDelete(pathname: string, accessToken: string): Promise<void> {
    await axios.delete(`${this.backendBaseURL}${pathname}`, {
      timeout: 15000,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      validateStatus: (status) => status === 204 || status === 404
    })
  }

  private loadSession() {
    try {
      if (!this.sessionPath || !fs.existsSync(this.sessionPath) || !safeStorage.isEncryptionAvailable()) {
        return
      }
      const encrypted = fs.readFileSync(this.sessionPath)
      const decrypted = safeStorage.decryptString(encrypted)
      const parsed = JSON.parse(decrypted) as BackendSessionState
      if (parsed?.accessToken && parsed?.refreshToken) {
        this.state = parsed
      }
    } catch {
      this.state = null
    }
  }

  private saveSession() {
    if (!this.state || !safeStorage.isEncryptionAvailable() || !this.sessionPath) return
    try {
      const payload = JSON.stringify(this.state)
      const encrypted = safeStorage.encryptString(payload)
      fs.writeFileSync(this.sessionPath, encrypted)
    } catch {
      // Ignore storage errors; runtime state still works.
    }
  }
}

export const platformService = new PlatformService()
