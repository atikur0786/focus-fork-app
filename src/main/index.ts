import 'dotenv/config'
import axios from 'axios'
import { app, shell, BrowserWindow, ipcMain, nativeImage } from 'electron'
import { githubService } from './services/github'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import appIcon from '../../resources/app-icon.png?asset'
import { authService } from './services/auth'
import { gitService } from './services/git'
import { fileSystemService } from './services/fs'
import { notificationService } from './services/notification'
import { ptyService } from './services/pty'
import { aiService } from './services/ai'
import { aiConfigService } from './services/ai-config'
import { platformService } from './services/platform'
import { rendererStorageService } from './services/renderer-storage'
import { vscodeBridge } from './vscode-bridge'
import { gitBridge } from './git-bridge'
import { normalizeIssueSearchPayload } from '../shared/issue-search-types'
import { assertPersonalGitHubFork } from './lib/github-push-target'
import { boundAIInput } from '../shared/agent-boundaries'

githubService.onRequestWarning((warning) => {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
      window.webContents.send('github:request-warning', warning)
    }
  }
})

gitService.setPushVerifier(async (owner, repo) => {
  try {
    const user = await githubService.getUser()
    assertPersonalGitHubFork(owner, user.login)
    const repository = await githubService.getRepoDetails(owner, repo)
    assertPersonalGitHubFork(owner, user.login, repository)
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Push blocked:')) throw error
    throw new Error('Push blocked: could not verify fork ownership with GitHub. Check your sign-in and connection, then retry.')
  }
})

const assertString = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Invalid ${field}`)
  }
  return value
}

const assertPlainString = (value: unknown, field: string): string => {
  if (typeof value !== 'string') {
    throw new Error(`Invalid ${field}`)
  }
  return value
}

const readPtyWriteInput = (idOrPayload: unknown, maybeData?: unknown): { id: string; data: string } => {
  if (typeof idOrPayload === 'object' && idOrPayload !== null && 'id' in idOrPayload) {
    const payload = idOrPayload as { id?: unknown; data?: unknown }
    const id = typeof payload.id === 'string' ? payload.id.trim() : ''
    if (!id) throw new Error('Invalid id')
    const data = typeof payload.data === 'string' ? payload.data : payload.data == null ? '' : String(payload.data)
    return { id, data }
  }

  const id = typeof idOrPayload === 'string' ? idOrPayload.trim() : ''
  if (!id) throw new Error('Invalid id')
  const data =
    typeof maybeData === 'string' ? maybeData : maybeData == null ? '' : String(maybeData)
  return { id, data }
}

const assertNumber = (value: unknown, field: string): number => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new Error(`Invalid ${field}`)
  }
  return value
}

const assertStringArray = (value: unknown, field: string): string[] => {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`Invalid ${field}`)
  }
  return value as string[]
}

const maybeSyncBackendIdentity = async (retries = 3) => {
  try {
    if (!authService.isAuthenticated()) return false
    if (!platformService.status().enabled) return false
    const githubToken = authService.getToken()
    if (!githubToken) return false

    const identity = await githubService.getAuthIdentity()
    let lastError: unknown = null
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        await platformService.syncAuth({
          ...identity,
          access_token: githubToken
        })
        return true
      } catch (error) {
        lastError = error
        if (attempt < retries - 1) {
          await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)))
        }
      }
    }
    throw lastError
  } catch (error) {
    console.warn('Backend identity sync skipped:', error instanceof Error ? error.message : 'unknown')
    return false
  }
}

const broadcastBackendSession = () => {
  const status = platformService.status()
  BrowserWindow.getAllWindows().forEach((window) => {
    window.webContents.send('focusfork:backend-session', {
      connected: status.connected,
      enabled: status.enabled,
      backendBaseURL: status.backendBaseURL
    })
  })
}

let reconnectInFlight: Promise<boolean> | null = null

const reconnectBackendSession = async (): Promise<boolean> => {
  if (reconnectInFlight) {
    return reconnectInFlight
  }

  reconnectInFlight = (async () => {
    if (!platformService.status().enabled) return false
    const reachable = await platformService.checkBackendReachable()
    if (!reachable) {
      console.warn(`[FocusFork] Backend API unreachable at ${platformService.status().backendBaseURL}`)
      return false
    }
    if (platformService.status().connected) {
      const healthy = await platformService.ensureBackendSession()
      if (healthy) return true
    }
    if (!authService.isAuthenticated()) return false
    const synced = await maybeSyncBackendIdentity()
    broadcastBackendSession()
    return synced && platformService.status().connected
  })()

  try {
    return await reconnectInFlight
  } finally {
    reconnectInFlight = null
  }
}

const resolveCurrentUser = async () => {
  if (platformService.status().enabled && platformService.status().connected) {
    try {
      const backendUser = await platformService.currentUser()
      if (backendUser) return backendUser
    } catch {
      console.warn('Backend profile lookup failed. Falling back to GitHub profile.')
    }
  }

  if (platformService.status().enabled && !platformService.status().connected && authService.isAuthenticated()) {
    void reconnectBackendSession()
  }

  return githubService.getUser()
}

/**
 * Single entry point for all AI chat requests. Routes by the user's AI mode:
 * BYOK (default, no account needed) goes directly to the provider with the
 * user's own key; subscription goes through the FocusFork backend.
 */
const runAIChat = async (
  messages: { role: string; content: string }[],
  context: string,
  model?: string
): Promise<string> => {
  const bounded = boundAIInput(messages, context)
  messages = bounded.messages
  context = bounded.context
  const { mode } = aiConfigService.getConfig()

  if (mode === 'subscription') {
    const backendResult = await platformService.aiChat(messages, context, model)
    if (backendResult.text) return backendResult.text
    if (aiConfigService.hasKeyForProvider(aiConfigService.getConfig().provider)) {
      console.warn('[FocusFork AI] Subscription request failed; falling back to local API key.')
      return aiService.chat(messages, context, model)
    }
    throw new Error(
      backendResult.message ||
        'FocusFork subscription request failed. Check your connection, or switch to your own API key in Settings.'
    )
  }

  return aiService.chat(messages, context, model)
}

const sendTelemetryPing = async (): Promise<void> => {
  try {
    const config = aiConfigService.getConfig()
    if (!config.telemetryEnabled) return
    const { backendBaseURL } = platformService.status()
    await axios.post(
      `${backendBaseURL}/v1/telemetry/ping`,
      {
        install_id: config.installId,
        app_version: app.getVersion(),
        platform: process.platform,
        ai_mode: config.mode
      },
      { timeout: 5000 }
    )
  } catch {
    // Telemetry is fire-and-forget; never disrupt the app.
  }
}

const withSearchTimeout = async <T,>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error('Issue search timed out. Please retry.')), timeoutMs)
    })
  ])
}

const withTimeout = async <T,>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | null = null
  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), timeoutMs)
      })
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

const fetchRepoMetadataPublic = async (
  owner: string,
  repo: string
): Promise<{ stargazers_count: number; forks_count: number; open_issues_count: number; language: string | null }> => {
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
    method: 'GET',
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'FocusFork'
    }
  })
  if (!response.ok) {
    throw new Error(`repo metadata fetch failed (${response.status})`)
  }
  const data: any = await response.json()
  return {
    stargazers_count: Number(data?.stargazers_count ?? 0),
    forks_count: Number(data?.forks_count ?? 0),
    open_issues_count: Number(data?.open_issues_count ?? 0),
    language: typeof data?.language === 'string' ? data.language : null
  }
}

const pickMetric = (existing: unknown, fallback: number): number => {
  if (typeof existing === 'number' && Number.isFinite(existing)) {
    if (existing > 0) return existing
    if (fallback === 0) return existing
  }
  return fallback
}

const enrichRepositoryMetadata = async (items: any[]) => {
  const cache = new Map<string, { stars: number; forks: number; openIssues: number; openPRs: number; language: string | null }>()
  const repoKeys: Array<{ key: string; owner: string; repo: string }> = []
  const seen = new Set<string>()

  const toKey = (owner: string, repo: string) => `${owner}/${repo}`.toLowerCase()

  for (const item of items) {
    const fullName = String(item?.repository?.full_name || '').trim()
    const [ownerFromFull, repoFromFull] = fullName.includes('/') ? fullName.split('/') : ['', '']
    const owner = String(item?.repository?.owner?.login || ownerFromFull || '').trim()
    const repo = String(item?.repository?.name || repoFromFull || '').trim()
    if (!owner || !repo) continue
    const key = toKey(owner, repo)
    if (seen.has(key)) continue
    seen.add(key)
    repoKeys.push({ key, owner, repo })
  }

  // Enrich only first N unique repos to keep Discover responsive.
  const maxReposToEnrich = 15
  await Promise.all(
    repoKeys.slice(0, maxReposToEnrich).map(async ({ key, owner, repo }) => {
      try {
        const repoDetailsFromAuth = await withTimeout(githubService.getRepoDetails(owner, repo), 4000, null)
        let repoDetails: {
          stargazers_count?: number
          forks_count?: number
          open_issues_count?: number
          language?: string | null
        } | null = repoDetailsFromAuth
        if (!repoDetails) {
          repoDetails = await withTimeout(fetchRepoMetadataPublic(owner, repo), 4000, null)
        }
        const openPRs = await withTimeout(githubService.getOpenPullRequestCount(owner, repo), 4000, 0)
        cache.set(key, {
          stars: Number(repoDetails?.stargazers_count ?? 0),
          forks: Number(repoDetails?.forks_count ?? 0),
          openIssues: Number(repoDetails?.open_issues_count ?? 0),
          openPRs: Number(openPRs ?? 0),
          language: typeof repoDetails?.language === 'string' ? repoDetails.language : null
        })
      } catch {
        cache.set(key, { stars: 0, forks: 0, openIssues: 0, openPRs: 0, language: null })
      }
    })
  )

  return items.map((item) => {
    const fullName = String(item?.repository?.full_name || '').trim()
    const [ownerFromFull, repoFromFull] = fullName.includes('/') ? fullName.split('/') : ['', '']
    const owner = String(item?.repository?.owner?.login || ownerFromFull || '').trim()
    const repo = String(item?.repository?.name || repoFromFull || '').trim()
    const meta = cache.get(toKey(owner, repo))
    if (!meta) return item
    return {
      ...item,
      repository: {
        ...item.repository,
        stars: pickMetric(item?.repository?.stars, meta.stars),
        forks: pickMetric(item?.repository?.forks, meta.forks),
        openIssues: pickMetric(item?.repository?.openIssues, meta.openIssues),
        openPRs: pickMetric(item?.repository?.openPRs, meta.openPRs),
        primaryLanguage:
          item?.repository?.primaryLanguage ||
          (meta.language
            ? {
                name: meta.language,
                color: '64748b'
              }
            : null)
      }
    }
  })
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    title: 'FocusFork',
    ...(process.platform === 'linux' ? { icon: appIcon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return

    const key = input.key.toLowerCase()
    const toggleDevTools =
      key === 'f12' ||
      (input.alt && input.meta && key === 'i') ||
      (input.shift && input.meta && key === 'i')

    if (toggleDevTools) {
      mainWindow.webContents.toggleDevTools()
      return
    }

    if (!is.dev) {
      const reloadKey = key === 'r' && (input.meta || input.control)
      const f5Reload = input.key === 'F5'
      if (reloadKey || f5Reload) {
        event.preventDefault()
      }
    }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.setName('FocusFork')
app.name = 'FocusFork'

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.focusfork.app')

  if (process.platform === 'darwin' && app.dock) {
    const dockIcon = nativeImage.createFromPath(join(__dirname, '../../resources/app-icon.png'))
    if (!dockIcon.isEmpty()) {
      app.dock.setIcon(dockIcon)
    }
  }

  authService.initialize()
  gitService.setGitHubToken(authService.getToken())
  platformService.initialize()
  platformService.onSessionChange(() => broadcastBackendSession())
  rendererStorageService.initialize()

  aiConfigService.initialize()
  {
    const aiConfig = aiConfigService.getConfig()
    aiService.setProvider(aiConfig.provider, aiConfigService.getApiKeyForProvider(aiConfig.provider), aiConfig.model)
  }
  void sendTelemetryPing()
  setInterval(() => void sendTelemetryPing(), 24 * 60 * 60 * 1000)

  // Keep the reported backend status honest: verify reachability now and
  // every minute; checkBackendReachable() broadcasts on change.
  void platformService.checkBackendReachable()
  setInterval(() => void platformService.checkBackendReachable(), 60 * 1000)

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  ipcMain.on('ping', () => console.log('pong'))

  ipcMain.handle('app-storage:get', (_, key) => rendererStorageService.getItem(assertString(key, 'key')))
  ipcMain.handle('app-storage:set', (_, payload) => {
    rendererStorageService.setItem(assertString(payload?.key, 'key'), assertPlainString(payload?.value, 'value'))
  })
  ipcMain.handle('app-storage:remove', (_, key) => rendererStorageService.removeItem(assertString(key, 'key')))

  ipcMain.handle('auth:login', async () => {
    const ok = await authService.login()
    if (!ok) return false

    gitService.setGitHubToken(authService.getToken())
    await maybeSyncBackendIdentity()
    broadcastBackendSession()
    return true
  })
  ipcMain.handle('auth:check', async () => {
    const isAuth = authService.isAuthenticated()
    if (!isAuth) return false

    if (!platformService.status().connected) {
      void reconnectBackendSession().then(() => broadcastBackendSession())
    }
    return isAuth
  })
  ipcMain.handle('auth:logout', async () => {
    await authService.logout()
    gitService.setGitHubToken(null)
    platformService.logout()
    broadcastBackendSession()
  })
  ipcMain.handle('auth:config-status', () => authService.getConfigStatus())

  ipcMain.handle('github:search', async (_, payload) => {
    const request = normalizeIssueSearchPayload(payload)

    const enrichResult = async (result: { items: any[]; totalCount: number; page: number; perPage: number; hasNextPage: boolean }) => {
      const enrichedItems = await withSearchTimeout(enrichRepositoryMetadata(result.items), 12000)
      return { ...result, items: enrichedItems }
    }

    try {
      if (platformService.status().enabled && platformService.status().connected) {
        const result = await withSearchTimeout(platformService.searchIssues(request), 25000)
        if (result.items.length > 0) {
          return enrichResult(result)
        }
      }
    } catch {
      // Backend search failed; fall through to direct GitHub search.
    }
    const result = await withSearchTimeout(githubService.searchIssues(request), 25000)
    return enrichResult(result)
  })
  ipcMain.handle('github:user', async () => {
    return resolveCurrentUser()
  })
  ipcMain.handle('github:star', async (_, payload) => {
    const owner = assertString(payload?.owner, 'owner')
    const repo = assertString(payload?.repo, 'repo')
    return githubService.starRepository(owner, repo)
  })
  ipcMain.handle('github:fork', async (_, payload) => {
    const owner = assertString(payload?.owner, 'owner')
    const repo = assertString(payload?.repo, 'repo')
    return githubService.forkRepository(owner, repo)
  })
  ipcMain.handle('github:get-issue', async (_, payload) =>
    githubService.getIssue(
      assertString(payload?.owner, 'owner'),
      assertString(payload?.repo, 'repo'),
      assertNumber(payload?.issueNumber, 'issueNumber')
    )
  )
  ipcMain.handle('github:check-claimability', async (_, payload) =>
    githubService.checkIssueClaimability(
      assertString(payload?.owner, 'owner'),
      assertString(payload?.repo, 'repo'),
      assertNumber(payload?.issueNumber, 'issueNumber')
    )
  )
  ipcMain.handle('github:get-pr', async (_, payload) =>
    githubService.getPullRequest(
      assertString(payload?.owner, 'owner'),
      assertString(payload?.repo, 'repo'),
      assertNumber(payload?.prNumber, 'prNumber')
    )
  )
  ipcMain.handle('github:comment-issue', async (_, payload) =>
    githubService.commentOnIssue(
      assertString(payload?.owner, 'owner'),
      assertString(payload?.repo, 'repo'),
      assertNumber(payload?.issueNumber, 'issueNumber'),
      assertString(payload?.body, 'body')
    )
  )
  ipcMain.handle('github:sync-fork', async (_, payload) =>
    githubService.syncForkWithUpstream(
      assertString(payload?.owner, 'owner'),
      assertString(payload?.repo, 'repo'),
      assertString(payload?.branch, 'branch')
    )
  )
  ipcMain.handle('github:get-repo', (_, payload) =>
    githubService.getRepoDetails(assertString(payload?.owner, 'owner'), assertString(payload?.repo, 'repo'))
  )
  ipcMain.handle('github:create-pr', async (_, params) => {
    const owner = assertString(params?.owner, 'owner')
    const repo = assertString(params?.repo, 'repo')
    const head = assertString(params?.head, 'head')
    const base = assertString(params?.base, 'base')
    const title = assertString(params?.title, 'title')
    const body = typeof params?.body === 'string' ? params.body : undefined
    return githubService.createPullRequest({ owner, repo, head, base, title, body })
  })
  ipcMain.handle('github:list-prs', async (_, params) => {
    const owner = assertString(params?.owner, 'owner')
    const repo = assertString(params?.repo, 'repo')
    const state =
      params?.state === 'open' || params?.state === 'closed' || params?.state === 'all'
        ? params.state
        : 'open'

    return githubService.listPullRequests({ owner, repo, state })
  })

  ipcMain.handle('fs:select-dir', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return null
    return fileSystemService.selectDirectory(win)
  })
  ipcMain.handle('fs:select-files', (event, payload) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return []
    return fileSystemService.selectFiles(win, {
      title: typeof payload?.title === 'string' ? payload.title : undefined,
      multi: payload?.multi !== false,
      filters: Array.isArray(payload?.filters) ? payload.filters : undefined
    })
  })
  ipcMain.handle('fs:read-dir', (_, path) => fileSystemService.readDirectory(assertString(path, 'path')))
  ipcMain.handle('fs:read-file', (_, path) => fileSystemService.readFile(assertString(path, 'path')))
  ipcMain.handle('fs:readFile', (_, path) => gitBridge.readFile(assertString(path, 'path')))
  ipcMain.handle('fs:listFiles', (_, path) => gitBridge.listFiles(assertString(path, 'path')))
  ipcMain.handle('fs:read-file-buffer', (_, path) => fileSystemService.readFileBuffer(assertString(path, 'path')))
  ipcMain.handle('fs:write-file', (_, payload) =>
    fileSystemService.writeFile(assertString(payload?.path, 'path'), assertPlainString(payload?.content, 'content'))
  )
  ipcMain.handle('fs:create-file', (_, payload) =>
    fileSystemService.createFile(
      assertString(payload?.path, 'path'),
      typeof payload?.content === 'string' ? payload.content : ''
    )
  )
  ipcMain.handle('fs:create-dir', (_, payload) => fileSystemService.createDirectory(assertString(payload?.path, 'path')))
  ipcMain.handle('fs:rename', (_, payload) =>
    fileSystemService.renamePath(assertString(payload?.oldPath, 'oldPath'), assertString(payload?.newPath, 'newPath'))
  )
  ipcMain.handle('fs:delete', (_, payload) => fileSystemService.deletePath(assertString(payload?.path, 'path')))
  ipcMain.handle('fs:search', (_, payload) =>
    fileSystemService.searchInDirectory(assertString(payload?.path, 'path'), assertString(payload?.query, 'query'), {
      maxResults: typeof payload?.maxResults === 'number' ? payload.maxResults : undefined
    })
  )
  ipcMain.handle('fs:path-exists', (_, payload) => fileSystemService.pathExists(assertString(payload?.path, 'path')))
  ipcMain.handle('fs:open-terminal', (_, payload) => fileSystemService.openTerminalAtPath(assertString(payload?.path, 'path')))
  ipcMain.handle('fs:list-editors', () => fileSystemService.getAvailableEditors())
  ipcMain.handle('fs:open-editor', (_, payload) =>
    fileSystemService.openEditorAtPath(
      assertString(payload?.path, 'path'),
      typeof payload?.editorId === 'string' ? payload.editorId : undefined
    )
  )
  ipcMain.handle('vscode:list-editors', () => vscodeBridge.listEditors())
  ipcMain.handle('vscode:open', (_, payload) =>
    vscodeBridge.open(
      assertString(payload?.path, 'path'),
      typeof payload?.editorId === 'string' ? payload.editorId : undefined
    )
  )
  ipcMain.handle('fs:run-command', (_, payload) =>
    fileSystemService.runCommandInDirectory(assertString(payload?.path, 'path'), assertString(payload?.command, 'command'))
  )
  ipcMain.handle('git:clone', (_, payload) =>
    gitBridge.clone(
      assertString(payload?.url, 'url'),
      assertString(payload?.parentDir, 'parentDir'),
      assertString(payload?.dirName, 'dirName')
    )
  )
  ipcMain.handle('git:commitAndPush', async (_, payload) => {
    const user = await resolveCurrentUser()
    const author = { name: user?.name || user?.login || 'FocusFork User', email: user?.email || `${user?.login || 'user'}@users.noreply.github.com` }
    return gitBridge.commitAndPush({
      dir: assertString(payload?.dir, 'dir'),
      message: assertString(payload?.message, 'message'),
      files: Array.isArray(payload?.files) ? assertStringArray(payload.files, 'files') : undefined,
      branch: typeof payload?.branch === 'string' ? payload.branch : undefined,
      author
    })
  })
  ipcMain.handle('git:status', async (_, dir) => {
    try {
      return await gitService.status(assertString(dir, 'dir'))
    } catch (error: any) {
      throw new Error(error?.message || 'Failed to get git status')
    }
  })
  ipcMain.handle('git:add', (_, payload) =>
    gitService.add(assertString(payload?.dir, 'dir'), assertStringArray(payload?.files, 'files'))
  )
  ipcMain.handle('git:commit', async (_, payload) => {
    const user = await resolveCurrentUser()
    const author = { name: user?.name || user?.login || 'FocusFork User', email: user?.email || `${user?.login || 'user'}@users.noreply.github.com` }
    return gitService.commit(assertString(payload?.dir, 'dir'), assertString(payload?.message, 'message'), author)
  })
  ipcMain.handle('git:push', (_, dir) => gitService.push(assertString(dir, 'dir')))
  ipcMain.handle('git:pull', (_, dir) => gitService.pull(assertString(dir, 'dir')))
  ipcMain.handle('git:current-branch', (_, dir) => gitService.currentBranch(assertString(dir, 'dir')))
  ipcMain.handle('git:checkout', (_, payload) =>
    gitService.checkout(assertString(payload?.dir, 'dir'), assertString(payload?.branch, 'branch'), !!payload?.create)
  )
  ipcMain.handle('git:push-upstream', (_, payload) =>
    gitService.pushWithUpstream(assertString(payload?.dir, 'dir'), assertString(payload?.branch, 'branch'))
  )
  ipcMain.handle('git:read-file-at-head', (_, payload) =>
    gitService.readFileAtHead(assertString(payload?.dir, 'dir'), assertString(payload?.path, 'path'))
  )
  ipcMain.handle('git:discard-file', (_, payload) =>
    gitService.discardFile(assertString(payload?.dir, 'dir'), assertString(payload?.path, 'path'))
  )
  ipcMain.handle('git:discard-all', (_, payload) => gitService.discardAll(assertString(payload?.dir, 'dir')))
  ipcMain.handle('git:list-tracked-files', (_, dir) => gitBridge.listTrackedFiles(assertString(dir, 'dir')))
  ipcMain.handle('git:diff', (_, payload) =>
    gitService.diff(assertString(payload?.dir, 'dir'), !!payload?.staged)
  )
  ipcMain.handle('git:diff-summary', (_, payload) =>
    gitService.diffSummary(assertString(payload?.dir, 'dir'), !!payload?.staged)
  )

  ipcMain.handle('notification:show', (_, payload) =>
    notificationService.show(assertString(payload?.title, 'title'), assertString(payload?.body, 'body'))
  )
  ipcMain.handle('app:version', () => app.getVersion())
  ipcMain.handle('app:check-for-updates', async () => {
    const { checkForDesktopUpdate } = await import('./services/update-check')
    return checkForDesktopUpdate(platformService.status().backendBaseURL)
  })
  ipcMain.handle('platform:commit-message', async (_, payload) => {
    const diff = assertString(payload?.diff, 'diff')
    const context = typeof payload?.context === 'string' ? payload.context : ''
    if (aiConfigService.getConfig().mode === 'subscription') {
      return platformService.generateCommitMessage(diff, context)
    }
    const prompt =
      'Write a conventional commit message (type(scope): summary, max 72 chars for the first line) for this diff. ' +
      'Reply with ONLY the commit message, no code fences or explanation.' +
      (context ? `\n\nContext: ${context}` : '') +
      `\n\nDiff:\n${diff.slice(0, 12000)}`
    const text = await runAIChat([{ role: 'user', content: prompt }], '')
    return text.trim().replace(/^```[a-z]*\n?|```$/g, '').trim()
  })
  ipcMain.handle('platform:ensure-session', async () => reconnectBackendSession())
  ipcMain.handle('platform:reconnect', async () => reconnectBackendSession())

  ipcMain.handle('pty:create', (_, payload) => {
    const id = assertString(payload?.id, 'id')
    const options = {
      cols: typeof payload?.cols === 'number' ? payload.cols : 80,
      rows: typeof payload?.rows === 'number' ? payload.rows : 24,
      cwd: typeof payload?.cwd === 'string' ? payload.cwd : undefined
    }
    ptyService.create(id, options)
    const session = ptyService.getSession(id)
    return session ?? { id, mode: 'pty' as const }
  })
  ipcMain.handle('pty:write', (_, idOrPayload: unknown, maybeData?: unknown) => {
    const { id, data } = readPtyWriteInput(idOrPayload, maybeData)
    ptyService.write(id, data)
  })
  ipcMain.handle('pty:resize', (_, payload) =>
    ptyService.resize(assertString(payload?.id, 'id'), payload?.cols ?? 80, payload?.rows ?? 24)
  )
  ipcMain.handle('pty:destroy', (_, payload) => ptyService.destroy(assertString(payload?.id, 'id')))

  ipcMain.handle('ai:chat', async (_, payload) => {
    const messages = Array.isArray(payload?.messages) ? payload.messages : []
    const context = typeof payload?.context === 'string' ? payload.context : ''
    const model = typeof payload?.model === 'string' ? payload.model : undefined
    return runAIChat(messages, context, model)
  })

  ipcMain.handle('ai:set-provider', (_, payload) => {
    const provider = assertString(payload?.provider, 'provider')
    const submittedKey = assertPlainString(payload?.apiKey, 'apiKey')
    const model = typeof payload?.model === 'string' && payload.model ? payload.model : undefined
    // An empty key means "keep the stored key"; pass clearKey to remove it.
    // SECURITY: the stored key is only reused when it was saved for this same
    // provider — a key must never be sent to a different provider's API.
    const clearKey = payload?.clearKey === true
    const effectiveKey = clearKey ? '' : submittedKey || aiConfigService.getApiKeyForProvider(provider)
    const result = aiService.setProvider(provider, effectiveKey, model)
    aiConfigService.setProviderConfig(result.provider, result.model)
    if (submittedKey || clearKey) {
      aiConfigService.setApiKey(effectiveKey, provider)
    }
    return { ...result, mode: aiConfigService.getConfig().mode }
  })
  ipcMain.handle('ai:get-provider', () => {
    const config = aiConfigService.getConfig()
    return { ...aiService.getProvider(), hasKey: aiConfigService.hasKeyForProvider(config.provider), mode: config.mode }
  })
  ipcMain.handle('ai:set-mode', (_, payload) => {
    const mode = payload?.mode === 'subscription' ? 'subscription' : 'byok'
    aiConfigService.setMode(mode)
    return aiConfigService.getConfig()
  })
  ipcMain.handle('ai:get-config', () => {
    const config = aiConfigService.getConfig()
    return { ...config, hasKey: aiConfigService.hasKeyForProvider(config.provider) }
  })
  ipcMain.handle('ai:set-telemetry', (_, payload) => {
    aiConfigService.setTelemetryEnabled(payload?.enabled !== false)
    return aiConfigService.getConfig()
  })

  ipcMain.handle('platform:status', () => platformService.status())
  ipcMain.handle('platform:health', async () => {
    const status = platformService.status()
    const reachable = await platformService.checkBackendReachable()
    return { ...status, reachable }
  })
  ipcMain.handle('platform:me', () => platformService.currentUser())
  ipcMain.handle('platform:usage', () => platformService.usage())
  ipcMain.handle('platform:usage-history', (_, payload) =>
    platformService.usageHistory(typeof payload?.limit === 'number' ? payload.limit : 50)
  )
  ipcMain.handle('platform:billing-plan', () => platformService.billingPlan())
  ipcMain.handle('platform:ai-models', async () => {
    if (aiConfigService.getConfig().mode === 'subscription') {
      return platformService.aiModels()
    }
    // BYOK: list models from the user's own provider. Zero platform cost, so
    // everything is selectable regardless of billing plan. `provider` carries
    // the vendor key the UI uses for grouping + brand icon (undefined for
    // OpenRouter, whose `vendor/model` ids the UI parses per vendor).
    const models = await aiService.listModels()
    return {
      items: models.map((m) => ({
        id: m.id,
        label: m.label,
        provider: m.vendor,
        input_cost_per_1m: 0,
        output_cost_per_1m: 0,
        available: true,
        category: 'byok'
      }))
    }
  })
  ipcMain.handle('platform:create-checkout', (_, payload) =>
    platformService.createCheckoutSession(
      payload?.planCode === 'max' ? 'max' : payload?.planCode === 'credits' ? 'credits' : 'pro',
      typeof payload?.country === 'string' ? payload.country : 'US',
      typeof payload?.successURL === 'string' ? payload.successURL : undefined,
      typeof payload?.cancelURL === 'string' ? payload.cancelURL : undefined
    )
  )
  ipcMain.handle('platform:session-upsert', (_, payload) =>
    platformService.upsertSession({
      repoOwner: assertString(payload?.repoOwner, 'repoOwner'),
      repoName: assertString(payload?.repoName, 'repoName'),
      issueNumber: typeof payload?.issueNumber === 'number' ? assertNumber(payload.issueNumber, 'issueNumber') : undefined,
      status: typeof payload?.status === 'string' ? payload.status : undefined,
      branchName: typeof payload?.branchName === 'string' ? payload.branchName : undefined,
      metadata: typeof payload?.metadata === 'object' && payload?.metadata ? payload.metadata : {}
    })
  )
  ipcMain.handle('platform:session-event', (_, payload) =>
    platformService.addSessionEvent(
      assertString(payload?.eventType, 'eventType'),
      typeof payload?.payload === 'object' && payload?.payload ? payload.payload : {},
      typeof payload?.idempotencyKey === 'string' ? payload.idempotencyKey : undefined
    )
  )
  ipcMain.handle('platform:contribution', (_, payload) =>
    platformService.addContribution({
      sessionId: typeof payload?.sessionId === 'string' ? payload.sessionId : undefined,
      repoOwner: assertString(payload?.repoOwner, 'repoOwner'),
      repoName: assertString(payload?.repoName, 'repoName'),
      issueNumber: typeof payload?.issueNumber === 'number' ? assertNumber(payload.issueNumber, 'issueNumber') : undefined,
      prNumber: typeof payload?.prNumber === 'number' ? assertNumber(payload.prNumber, 'prNumber') : undefined,
      eventType: assertString(payload?.eventType, 'eventType'),
      metadata: typeof payload?.metadata === 'object' && payload?.metadata ? payload.metadata : {}
    })
  )
  ipcMain.handle('platform:list-contributions', (_, payload) =>
    platformService.listContributions(
      typeof payload?.limit === 'number' ? payload.limit : 50,
      typeof payload?.offset === 'number' ? payload.offset : 0
    )
  )
  ipcMain.handle('platform:list-chat-threads', (_, payload) =>
    platformService.listChatThreads(typeof payload?.limit === 'number' ? payload.limit : 200)
  )
  ipcMain.handle('platform:upsert-chat-thread', (_, payload) =>
    platformService.upsertChatThread(
      assertString(payload?.clientKey, 'clientKey'),
      typeof payload?.payload === 'object' && payload?.payload ? payload.payload : {}
    )
  )
  ipcMain.handle('platform:delete-chat-thread', (_, payload) =>
    platformService.deleteChatThread(assertString(payload?.clientKey, 'clientKey'))
  )
  ipcMain.removeHandler('platform:ai-chat')
  ipcMain.handle('platform:ai-chat', async (event, payload) => {
    const messages = Array.isArray(payload?.messages) ? payload.messages : []
    const context = typeof payload?.context === 'string' ? payload.context : ''
    const model = typeof payload?.model === 'string' ? payload.model : undefined
    const aiMode = aiConfigService.getConfig().mode
    process.stdout.write(
      `[FocusFork AI] platform:ai-chat invoked mode=${aiMode} model=${model || 'default'} messages=${messages.length} contextChars=${context.length}\n`
    )
    event.sender.send('focusfork:ai-chat-ack', {
      model,
      messageCount: messages.length,
      contextChars: context.length,
      backendBaseURL: platformService.status().backendBaseURL,
      connected: platformService.status().connected
    })
    try {
      const text = await runAIChat(messages, context, model)
      return { text }
    } catch (error) {
      console.error('[FocusFork AI] platform:ai-chat handler failed', error)
      const detail = error instanceof Error ? error.message : 'Unexpected main-process AI handler failure.'
      return {
        errorCode: aiMode === 'byok' ? 'PROVIDER_ERROR' : 'NETWORK_ERROR',
        message: detail,
        debugHint: detail
      }
    }
  })

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
