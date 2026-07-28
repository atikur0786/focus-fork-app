/// <reference types="vite/client" />

interface AuthAPI {
  login: () => Promise<boolean>
  check: () => Promise<boolean>
  logout: () => Promise<void>
  configStatus: () => Promise<{ hasClientId: boolean; source: 'env' | 'app-config' | 'none' }>
}

interface GitHubAPI {
  search: (payload: {
    query: string
    page?: number
    perPage?: number
    sort?: 'comments' | 'created' | 'updated'
    order?: 'asc' | 'desc'
  }) => Promise<{
    items: any[]
    totalCount: number
    page: number
    perPage: number
    hasNextPage: boolean
  }>
  user: () => Promise<any>
  star: (owner: string, repo: string) => Promise<{ starred: boolean }>
  fork: (owner: string, repo: string) => Promise<any>
  commentOnIssue: (owner: string, repo: string, issueNumber: number, body: string) => Promise<{ id: number; html_url: string }>
  getIssue: (owner: string, repo: string, issueNumber: number) => Promise<{ number: number; state: string; assignees: { login: string }[]; html_url: string }>
  getPullRequest: (owner: string, repo: string, prNumber: number) => Promise<{ number: number; state: string; merged: boolean; html_url: string; review_comments: number; comments: number }>
  checkClaimability: (owner: string, repo: string, issueNumber: number) => Promise<{ state: string; stateReason: string | null; assignees: { login: string }[]; html_url: string; comments: number; linkedPullRequests: Array<{ number: number; state: string; merged: boolean; html_url: string; title: string }> }>
  syncFork: (owner: string, repo: string, branch: string) => Promise<{ merged: boolean; message: string }>
  getRepoDetails: (owner: string, repo: string) => Promise<any>
  createPullRequest: (params: { owner: string; repo: string; head: string; base: string; title: string; body?: string }) => Promise<any>
  listPullRequests: (params: { owner: string; repo: string; state?: 'open' | 'closed' | 'all' }) => Promise<any[]>
}

interface FileSystemAPI {
  selectDir: () => Promise<string | null>
  selectFiles: (payload?: {
    title?: string
    multi?: boolean
    filters?: Array<{ name: string; extensions: string[] }>
  }) => Promise<string[]>
  readDir: (path: string) => Promise<{ name: string; isDirectory: boolean }[]>
  readFile: (path: string) => Promise<string>
  readFileBuffer: (path: string) => Promise<ArrayBuffer>
  writeFile: (path: string, content: string) => Promise<void>
  createFile: (path: string, content?: string) => Promise<void>
  createDir: (path: string) => Promise<void>
  rename: (oldPath: string, newPath: string) => Promise<void>
  delete: (path: string) => Promise<void>
  search: (path: string, query: string, maxResults?: number) => Promise<Array<{ path: string; line: number; column: number; preview: string }>>
  pathExists: (path: string) => Promise<boolean>
  openTerminal: (path: string) => Promise<void>
  listEditors: () => Promise<{ items: Array<{ id: string; label: string }>; defaultEditorId: string | null }>
  openEditor: (path: string, editorId?: string) => Promise<void>
  runCommand: (path: string, command: string) => Promise<{ stdout: string; stderr: string; exitCode: number | null }>
}

interface GitAPI {
  clone: (url: string, parentDir: string, dirName: string) => Promise<string>
  status: (dir: string) => Promise<any>
  add: (dir: string, files: string[]) => Promise<void>
  commit: (dir: string, message: string) => Promise<void>
  push: (dir: string) => Promise<void>
  pull: (dir: string) => Promise<void>
  currentBranch: (dir: string) => Promise<string>
  checkout: (dir: string, branch: string, create?: boolean) => Promise<void>
  pushWithUpstream: (dir: string, branch: string) => Promise<void>
  readFileAtHead: (dir: string, path: string) => Promise<string>
  discardFile: (dir: string, path: string) => Promise<void>
  discardAll: (dir: string) => Promise<void>
  listTrackedFiles: (dir: string) => Promise<string[]>
  diff: (dir: string, staged?: boolean) => Promise<string>
  diffSummary: (dir: string, staged?: boolean) => Promise<{ changed: number; insertions: number; deletions: number }>
}

interface NotificationAPI {
  show: (title: string, body: string) => Promise<{ shown: boolean; reason?: string }>
}

interface AppAPI {
  checkForUpdates: () => Promise<{
    currentVersion: string
    updateAvailable: boolean
    manifest: { version: string; notes: string; download_url?: string; published_at?: string } | null
  }>
}

interface TerminalAPI {
  create: (payload: {
    id: string
    cols: number
    rows: number
    cwd?: string
  }) => Promise<{ id: string; mode: 'pty' | 'fallback'; shell?: string; cwd?: string }>
  write: (payload: { id: string; data: string }) => Promise<void>
  resize: (payload: { id: string; cols: number; rows: number }) => Promise<void>
  destroy: (payload: { id: string }) => Promise<void>
  onData: (id: string, callback: (data: string) => void) => () => void
  onReady: (id: string, callback: (info: { shell?: string; cwd?: string; mode?: 'pty' | 'fallback' }) => void) => () => void
  onError: (id: string, callback: (error: { message?: string }) => void) => () => void
  onExit: (id: string, callback: (info: { exitCode?: number; signal?: number }) => void) => () => void
}

interface AIProviderAPI {
  setProvider: (payload: { provider: string; apiKey: string; model?: string }) => Promise<{ provider: string; hasKey: boolean; model: string; mode: string }>
  getProvider: () => Promise<{ provider: string; hasKey: boolean; model: string; mode: string }>
  setMode: (mode: 'byok' | 'subscription') => Promise<{ mode: string }>
  getConfig: () => Promise<{ mode: string; provider: string; model: string; telemetryEnabled: boolean; hasKey: boolean }>
  setTelemetry: (enabled: boolean) => Promise<{ telemetryEnabled: boolean }>
}

interface PlatformAPI {
  status: () => Promise<{ enabled: boolean; fallbackEnabled: boolean; connected: boolean; hasSession: boolean; backendBaseURL: string }>
  health: () => Promise<{ enabled: boolean; fallbackEnabled: boolean; connected: boolean; hasSession: boolean; backendBaseURL: string; reachable: boolean }>
  me: () => Promise<{ login: string; name: string; avatar_url: string; html_url: string } | null>
  usage: () => Promise<any>
  usageHistory: (limit?: number) => Promise<{ items: Array<Record<string, unknown>> }>
  billingPlan: () => Promise<any>
  aiModels: () => Promise<{ items: Array<{ id: string; provider: string; label: string }> }>
  createCheckout: (payload: { planCode: 'pro' | 'max' | 'credits'; country: string; successURL?: string; cancelURL?: string }) => Promise<{ checkout_url: string; session_id: string; plan: string; currency: string }>
  upsertSession: (payload: { repoOwner: string; repoName: string; issueNumber?: number; status?: string; branchName?: string; metadata?: Record<string, unknown> }) => Promise<any>
  addSessionEvent: (payload: { eventType: string; payload?: Record<string, unknown>; idempotencyKey?: string }) => Promise<void>
  addContribution: (payload: { sessionId?: string; repoOwner: string; repoName: string; issueNumber?: number; prNumber?: number; eventType: string; metadata?: Record<string, unknown> }) => Promise<void>
  listContributions: (limit?: number, offset?: number) => Promise<{ items: any[]; total?: number }>
  listChatThreads: (limit?: number) => Promise<{ items: Array<Record<string, unknown>> }>
  upsertChatThread: (clientKey: string, payload: Record<string, unknown>) => Promise<Record<string, unknown> | null>
  deleteChatThread: (clientKey: string) => Promise<void>
  generateCommitMessage: (diff: string, context?: string) => Promise<string>
  aiChat: (payload: { messages: Array<{ role: string; content: string }>; context: string; model?: string }) => Promise<{ text?: string; model?: string; fallbackUsed?: boolean; errorCode?: string; message?: string; debugHint?: string }>
  ensureSession: () => Promise<boolean>
  reconnectBackend: () => Promise<boolean>
  onBackendSessionChange: (
    callback: (payload: { connected: boolean; enabled: boolean; backendBaseURL?: string }) => void
  ) => () => void
}

interface Window {
  electron: import('@electron-toolkit/preload').ElectronAPI
  fsAPI: {
    listFiles: (path: string) => Promise<string[]>
    readFile: (path: string) => Promise<string>
  }
  api: {
    auth: AuthAPI
    github: GitHubAPI
    fs: FileSystemAPI
    git: GitAPI
    notification: NotificationAPI
    app: AppAPI
    ai: AIProviderAPI
    platform: PlatformAPI
    terminal: TerminalAPI
    openExternal: (url: string) => Promise<void>
  }
}
