import { contextBridge, ipcRenderer, shell } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

ipcRenderer.on('focusfork:ai-chat-ack', (_event, payload) => {
  console.info('[FocusFork Preload] main process acknowledged AI chat IPC', payload)
})

const api = {
  auth: {
    login: (): Promise<boolean> => ipcRenderer.invoke('auth:login'),
    check: (): Promise<boolean> => ipcRenderer.invoke('auth:check'),
    logout: (): Promise<void> => ipcRenderer.invoke('auth:logout'),
    configStatus: (): Promise<{ hasClientId: boolean; source: 'env' | 'app-config' | 'none' }> =>
      ipcRenderer.invoke('auth:config-status')
  },
  github: {
    search: (payload: {
      query: string
      page?: number
      perPage?: number
      sort?: 'comments' | 'created' | 'updated'
      order?: 'asc' | 'desc'
    }): Promise<any> => ipcRenderer.invoke('github:search', payload),
    user: (): Promise<any> => ipcRenderer.invoke('github:user'),
    star: (owner: string, repo: string): Promise<any> => ipcRenderer.invoke('github:star', { owner, repo }),
    fork: (owner: string, repo: string): Promise<any> => ipcRenderer.invoke('github:fork', { owner, repo }),
    commentOnIssue: (owner: string, repo: string, issueNumber: number, body: string): Promise<{ id: number; html_url: string }> =>
      ipcRenderer.invoke('github:comment-issue', { owner, repo, issueNumber, body }),
    getIssue: (owner: string, repo: string, issueNumber: number): Promise<{ number: number; state: string; assignees: { login: string }[]; html_url: string }> =>
      ipcRenderer.invoke('github:get-issue', { owner, repo, issueNumber }),
    getPullRequest: (owner: string, repo: string, prNumber: number): Promise<{ number: number; state: string; merged: boolean; html_url: string; review_comments: number; comments: number }> =>
      ipcRenderer.invoke('github:get-pr', { owner, repo, prNumber }),
    checkClaimability: (owner: string, repo: string, issueNumber: number): Promise<{ state: string; stateReason: string | null; assignees: { login: string }[]; html_url: string; comments: number; linkedPullRequests: Array<{ number: number; state: string; merged: boolean; html_url: string; title: string }> }> =>
      ipcRenderer.invoke('github:check-claimability', { owner, repo, issueNumber }),
    syncFork: (owner: string, repo: string, branch: string): Promise<{ merged: boolean; message: string }> =>
      ipcRenderer.invoke('github:sync-fork', { owner, repo, branch }),
    getRepoDetails: (owner: string, repo: string): Promise<any> => ipcRenderer.invoke('github:get-repo', { owner, repo }),
    createPullRequest: (params: { owner: string; repo: string; head: string; base: string; title: string; body?: string }): Promise<any> =>
      ipcRenderer.invoke('github:create-pr', params),
    listPullRequests: (params: { owner: string; repo: string; state?: 'open' | 'closed' | 'all' }): Promise<any[]> =>
      ipcRenderer.invoke('github:list-prs', params)
  },
  fs: {
    selectDir: (): Promise<string | null> => ipcRenderer.invoke('fs:select-dir'),
    selectFiles: (payload?: {
      title?: string
      multi?: boolean
      filters?: Array<{ name: string; extensions: string[] }>
    }): Promise<string[]> => ipcRenderer.invoke('fs:select-files', payload),
    readDir: (path: string): Promise<{ name: string; isDirectory: boolean }[]> =>
      ipcRenderer.invoke('fs:read-dir', path),
    readFile: (path: string): Promise<string> => ipcRenderer.invoke('fs:read-file', path),
    readFileBuffer: (path: string): Promise<ArrayBuffer> => ipcRenderer.invoke('fs:read-file-buffer', path),
    writeFile: (path: string, content: string): Promise<void> =>
      ipcRenderer.invoke('fs:write-file', { path, content }),
    createFile: (path: string, content?: string): Promise<void> =>
      ipcRenderer.invoke('fs:create-file', { path, content }),
    createDir: (path: string): Promise<void> =>
      ipcRenderer.invoke('fs:create-dir', { path }),
    rename: (oldPath: string, newPath: string): Promise<void> =>
      ipcRenderer.invoke('fs:rename', { oldPath, newPath }),
    delete: (path: string): Promise<void> =>
      ipcRenderer.invoke('fs:delete', { path }),
    search: (path: string, query: string, maxResults?: number): Promise<Array<{ path: string; line: number; column: number; preview: string }>> =>
      ipcRenderer.invoke('fs:search', { path, query, maxResults }),
    pathExists: (path: string): Promise<boolean> =>
      ipcRenderer.invoke('fs:path-exists', { path }),
    openTerminal: (path: string): Promise<void> =>
      ipcRenderer.invoke('fs:open-terminal', { path }),
    listEditors: (): Promise<{ items: Array<{ id: string; label: string }>; defaultEditorId: string | null }> =>
      ipcRenderer.invoke('fs:list-editors'),
    openEditor: (path: string, editorId?: string): Promise<void> =>
      ipcRenderer.invoke('fs:open-editor', { path, editorId }),
    runCommand: (path: string, command: string): Promise<{ stdout: string; stderr: string; exitCode: number | null }> =>
      ipcRenderer.invoke('fs:run-command', { path, command })
  },
  git: {
    clone: (url: string, parentDir: string, dirName: string): Promise<string> =>
      ipcRenderer.invoke('git:clone', { url, parentDir, dirName }),
    status: (dir: string): Promise<any> => ipcRenderer.invoke('git:status', dir),
    add: (dir: string, files: string[]): Promise<void> => ipcRenderer.invoke('git:add', { dir, files }),
    commit: (dir: string, message: string): Promise<void> => ipcRenderer.invoke('git:commit', { dir, message }),
    push: (dir: string): Promise<void> => ipcRenderer.invoke('git:push', dir),
    pull: (dir: string): Promise<void> => ipcRenderer.invoke('git:pull', dir),
    currentBranch: (dir: string): Promise<string> => ipcRenderer.invoke('git:current-branch', dir),
    checkout: (dir: string, branch: string, create: boolean = false): Promise<void> =>
      ipcRenderer.invoke('git:checkout', { dir, branch, create }),
    pushWithUpstream: (dir: string, branch: string): Promise<void> =>
      ipcRenderer.invoke('git:push-upstream', { dir, branch }),
    readFileAtHead: (dir: string, path: string): Promise<string> =>
      ipcRenderer.invoke('git:read-file-at-head', { dir, path }),
    discardFile: (dir: string, path: string): Promise<void> =>
      ipcRenderer.invoke('git:discard-file', { dir, path }),
    discardAll: (dir: string): Promise<void> =>
      ipcRenderer.invoke('git:discard-all', { dir }),
    listTrackedFiles: (dir: string): Promise<string[]> =>
      ipcRenderer.invoke('git:list-tracked-files', dir),
    diff: (dir: string, staged?: boolean): Promise<string> =>
      ipcRenderer.invoke('git:diff', { dir, staged }),
    diffSummary: (dir: string, staged?: boolean): Promise<{ changed: number; insertions: number; deletions: number }> =>
      ipcRenderer.invoke('git:diff-summary', { dir, staged })
  },
  notification: {
    show: (title: string, body: string): Promise<{ shown: boolean; reason?: string }> =>
      ipcRenderer.invoke('notification:show', { title, body })
  },
  app: {
    checkForUpdates: (): Promise<{
      currentVersion: string
      updateAvailable: boolean
      manifest: { version: string; notes: string; download_url?: string; published_at?: string } | null
    }> => ipcRenderer.invoke('app:check-for-updates')
  },
  ai: {
    setProvider: (payload: { provider: string; apiKey: string; model?: string }): Promise<{ provider: string; hasKey: boolean; model: string; mode: string }> =>
      ipcRenderer.invoke('ai:set-provider', payload),
    getProvider: (): Promise<{ provider: string; hasKey: boolean; model: string; mode: string }> =>
      ipcRenderer.invoke('ai:get-provider'),
    setMode: (mode: 'byok' | 'subscription'): Promise<any> => ipcRenderer.invoke('ai:set-mode', { mode }),
    getConfig: (): Promise<{ mode: string; provider: string; model: string; telemetryEnabled: boolean; hasKey: boolean }> =>
      ipcRenderer.invoke('ai:get-config'),
    setTelemetry: (enabled: boolean): Promise<any> => ipcRenderer.invoke('ai:set-telemetry', { enabled })
  },
  platform: {
    status: (): Promise<{ enabled: boolean; fallbackEnabled: boolean; connected: boolean; hasSession: boolean; backendBaseURL: string }> =>
      ipcRenderer.invoke('platform:status'),
    health: (): Promise<{ enabled: boolean; fallbackEnabled: boolean; connected: boolean; hasSession: boolean; backendBaseURL: string; reachable: boolean }> =>
      ipcRenderer.invoke('platform:health'),
    me: (): Promise<{ login: string; name: string; avatar_url: string; html_url: string } | null> =>
      ipcRenderer.invoke('platform:me'),
    usage: (): Promise<any> => ipcRenderer.invoke('platform:usage'),
    usageHistory: (limit?: number): Promise<any> => ipcRenderer.invoke('platform:usage-history', { limit }),
    billingPlan: (): Promise<any> => ipcRenderer.invoke('platform:billing-plan'),
    aiModels: (): Promise<any> => ipcRenderer.invoke('platform:ai-models'),
    createCheckout: (payload: { planCode: 'pro' | 'max' | 'credits'; country: string; successURL?: string; cancelURL?: string }): Promise<any> =>
      ipcRenderer.invoke('platform:create-checkout', payload),
    upsertSession: (payload: { repoOwner: string; repoName: string; issueNumber?: number; status?: string; branchName?: string; metadata?: Record<string, unknown> }): Promise<any> =>
      ipcRenderer.invoke('platform:session-upsert', payload),
    addSessionEvent: (payload: { eventType: string; payload?: Record<string, unknown>; idempotencyKey?: string }): Promise<void> =>
      ipcRenderer.invoke('platform:session-event', payload),
    addContribution: (payload: {
      sessionId?: string
      repoOwner: string
      repoName: string
      issueNumber?: number
      prNumber?: number
      eventType: string
      metadata?: Record<string, unknown>
    }): Promise<void> => ipcRenderer.invoke('platform:contribution', payload),
    listContributions: (limit?: number, offset?: number): Promise<any> =>
      ipcRenderer.invoke('platform:list-contributions', { limit, offset }),
    listChatThreads: (limit?: number): Promise<{ items: Array<Record<string, unknown>> }> =>
      ipcRenderer.invoke('platform:list-chat-threads', { limit }),
    upsertChatThread: (
      clientKey: string,
      payload: Record<string, unknown>
    ): Promise<Record<string, unknown> | null> =>
      ipcRenderer.invoke('platform:upsert-chat-thread', { clientKey, payload }),
    deleteChatThread: (clientKey: string): Promise<void> =>
      ipcRenderer.invoke('platform:delete-chat-thread', { clientKey }),
    generateCommitMessage: (diff: string, context?: string): Promise<string> =>
      ipcRenderer.invoke('platform:commit-message', { diff, context }),
    aiChat: async (payload: {
      messages: Array<{ role: string; content: string }>
      context: string
      model?: string
    }): Promise<{ text?: string; errorCode?: string; message?: string; debugHint?: string }> => {
      const startedAt = Date.now()
      const timeoutMs = 130000
      console.info('[FocusFork Preload] platform:ai-chat invoke start', {
        messageCount: payload.messages?.length ?? 0,
        contextChars: payload.context?.length ?? 0,
        model: payload.model
      })

      let timeoutHandle: ReturnType<typeof setTimeout> | null = null
      try {
        const result = await Promise.race([
          ipcRenderer.invoke('platform:ai-chat', payload),
          new Promise<never>((_, reject) => {
            timeoutHandle = setTimeout(() => {
              reject(new Error(`AI IPC timed out after ${Math.round(timeoutMs / 1000)}s`))
            }, timeoutMs)
          })
        ])
        console.info('[FocusFork Preload] platform:ai-chat invoke resolved', {
          elapsedMs: Date.now() - startedAt,
          hasText: Boolean((result as { text?: string })?.text),
          errorCode: (result as { errorCode?: string })?.errorCode
        })
        return result as { text?: string; errorCode?: string; message?: string; debugHint?: string }
      } catch (error) {
        console.error('[FocusFork Preload] platform:ai-chat invoke failed', {
          elapsedMs: Date.now() - startedAt,
          error: error instanceof Error ? error.message : String(error)
        })
        throw error
      } finally {
        if (timeoutHandle) clearTimeout(timeoutHandle)
      }
    },
    ensureSession: (): Promise<boolean> => ipcRenderer.invoke('platform:ensure-session'),
    reconnectBackend: (): Promise<boolean> => ipcRenderer.invoke('platform:reconnect'),
    onBackendSessionChange: (
      callback: (payload: { connected: boolean; enabled: boolean; backendBaseURL?: string }) => void
    ): (() => void) => {
      const listener = (_event: unknown, payload: { connected: boolean; enabled: boolean; backendBaseURL?: string }) =>
        callback(payload)
      ipcRenderer.on('focusfork:backend-session', listener)
      return () => {
        ipcRenderer.removeListener('focusfork:backend-session', listener)
      }
    }
  },
  openExternal: (url: string) => shell.openExternal(url)
}

const vscodeAPI = {
  listEditors: (): Promise<{ items: Array<{ id: string; label: string }>; defaultEditorId: string | null }> =>
    ipcRenderer.invoke('vscode:list-editors'),
  open: (path: string, editorId?: string): Promise<void> =>
    ipcRenderer.invoke('vscode:open', { path, editorId })
}

const gitAPI = {
  clone: (url: string, parentDir: string, dirName: string): Promise<string> =>
    ipcRenderer.invoke('git:clone', { url, parentDir, dirName }),
  commitAndPush: (dir: string, message: string, files?: string[], branch?: string): Promise<void> =>
    ipcRenderer.invoke('git:commitAndPush', { dir, message, files, branch }),
  status: (dir: string): Promise<any> => ipcRenderer.invoke('git:status', dir),
  add: (dir: string, files: string[]): Promise<void> => ipcRenderer.invoke('git:add', { dir, files }),
  commit: (dir: string, message: string): Promise<void> => ipcRenderer.invoke('git:commit', { dir, message }),
  push: (dir: string): Promise<void> => ipcRenderer.invoke('git:push', dir),
  currentBranch: (dir: string): Promise<string> => ipcRenderer.invoke('git:current-branch', dir),
  checkout: (dir: string, branch: string, create: boolean = false): Promise<void> =>
    ipcRenderer.invoke('git:checkout', { dir, branch, create }),
  pushWithUpstream: (dir: string, branch: string): Promise<void> =>
    ipcRenderer.invoke('git:push-upstream', { dir, branch }),
  readFileAtHead: (dir: string, path: string): Promise<string> =>
    ipcRenderer.invoke('git:read-file-at-head', { dir, path }),
  discardFile: (dir: string, path: string): Promise<void> =>
    ipcRenderer.invoke('git:discard-file', { dir, path }),
  discardAll: (dir: string): Promise<void> =>
    ipcRenderer.invoke('git:discard-all', { dir })
}

const fsAPI = {
  listFiles: (path: string): Promise<string[]> => ipcRenderer.invoke('fs:listFiles', path),
  readFile: (path: string): Promise<string> => ipcRenderer.invoke('fs:readFile', path)
}

const terminalAPI = {
  create: (payload: { id: string; cols: number; rows: number; cwd?: string }) =>
    ipcRenderer.invoke('pty:create', payload),
  write: (payload: { id: string; data: string }) => {
    const id = String(payload?.id ?? '')
    const data = typeof payload?.data === 'string' ? payload.data : String(payload?.data ?? '')
    return ipcRenderer.invoke('pty:write', id, data)
  },
  resize: (payload: { id: string; cols: number; rows: number }) =>
    ipcRenderer.invoke('pty:resize', payload),
  destroy: (payload: { id: string }) => ipcRenderer.invoke('pty:destroy', payload),
  onData: (id: string, callback: (data: string) => void) => {
    const channel = `pty:data:${id}`
    const handler = (_event: Electron.IpcRendererEvent, data: string) => callback(data)
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.removeListener(channel, handler)
  },
  onReady: (id: string, callback: (info: { shell?: string; cwd?: string; mode?: 'pty' | 'fallback' }) => void) => {
    const channel = `pty:ready:${id}`
    const handler = (_event: Electron.IpcRendererEvent, info: { shell?: string; cwd?: string; mode?: 'pty' | 'fallback' }) =>
      callback(info)
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.removeListener(channel, handler)
  },
  onError: (id: string, callback: (error: { message?: string }) => void) => {
    const channel = `pty:error:${id}`
    const handler = (_event: Electron.IpcRendererEvent, error: { message?: string }) => callback(error)
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.removeListener(channel, handler)
  },
  onExit: (id: string, callback: (info: { exitCode?: number; signal?: number }) => void) => {
    const channel = `pty:exit:${id}`
    const handler = (_event: Electron.IpcRendererEvent, info: { exitCode?: number; signal?: number }) => callback(info)
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.removeListener(channel, handler)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', { ...api, terminal: terminalAPI })
    contextBridge.exposeInMainWorld('vscodeAPI', vscodeAPI)
    contextBridge.exposeInMainWorld('gitAPI', gitAPI)
    contextBridge.exposeInMainWorld('fsAPI', fsAPI)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.electron = electronAPI
  // @ts-ignore
  window.api = { ...api, terminal: terminalAPI }
  // @ts-ignore
  window.vscodeAPI = vscodeAPI
  // @ts-ignore
  window.gitAPI = gitAPI
  // @ts-ignore
  window.fsAPI = fsAPI
}
