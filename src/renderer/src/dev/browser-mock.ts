/**
 * Browser preview harness — DEV ONLY.
 *
 * When the renderer runs in a plain browser (no Electron preload), this
 * module installs a mock `window.api` with realistic demo data so every
 * screen renders and can be visually reviewed. It is loaded only when
 * `window.api` is undefined, which never happens inside Electron.
 */

const DEMO_USER = {
  login: 'demo-contributor',
  name: 'Demo Contributor',
  email: 'demo@example.com',
  avatar_url: 'https://avatars.githubusercontent.com/u/583231?v=4',
  html_url: 'https://github.com/octocat'
}

const DEMO_REPO_ROOT = '/Users/demo/workspace/zustand'

const DEMO_ISSUES = [
  {
    id: 1,
    number: 2814,
    title: 'persist middleware: rehydration race when storage is async',
    body: '## Description\n\nWhen using `persist` with an async storage adapter, a component that reads state during the first render can observe the pre-hydration default value.\n\n## Steps to reproduce\n\n1. Configure `persist` with `createJSONStorage(() => AsyncStorage)`\n2. Read a persisted value in a component that mounts immediately\n3. The default value flashes before the stored value appears\n\n## Expected\n\nAn option to delay render until hydration completes, or a documented pattern for it.\n\n- [ ] Reproduce in a minimal sandbox\n- [ ] Decide API surface\n\n```ts\nconst useStore = create(persist(creator, { name: \"app\" }))\n```',
    state: 'open',
    html_url: 'https://github.com/pmndrs/zustand/issues/2814',
    created_at: '2026-06-28T09:14:00Z',
    updated_at: '2026-07-08T16:40:00Z',
    comments: 7,
    labels: [
      { name: 'good first issue', color: '7057ff' },
      { name: 'bug', color: 'd73a4a' },
      { name: 'middleware', color: '0e8a16' }
    ],
    user: { login: 'dai-shi', avatar_url: 'https://avatars.githubusercontent.com/u/490574?v=4' },
    assignees: [],
    repository: {
      id: 101,
      name: 'zustand',
      full_name: 'pmndrs/zustand',
      owner: { login: 'pmndrs' },
      description: 'Bear necessities for state management in React',
      language: 'TypeScript',
      stargazers_count: 48211,
      forks_count: 1530,
      open_issues_count: 152,
      html_url: 'https://github.com/pmndrs/zustand'
    }
  },
  {
    id: 2,
    number: 9182,
    title: 'Docs: clarify difference between `useEffect` and `useLayoutEffect` timing in concurrent mode',
    body: 'The current docs page on effects does not explain how timing changes under concurrent features. A short section with a diagram would help newcomers a lot.\n\n**Scope**: docs only, no runtime changes.',
    state: 'open',
    html_url: 'https://github.com/reactjs/react.dev/issues/9182',
    created_at: '2026-07-01T12:00:00Z',
    updated_at: '2026-07-10T08:22:00Z',
    comments: 3,
    labels: [
      { name: 'good first issue', color: '7057ff' },
      { name: 'documentation', color: '0075ca' }
    ],
    user: { login: 'gaearon', avatar_url: 'https://avatars.githubusercontent.com/u/810438?v=4' },
    assignees: [{ login: 'sophiebits' }],
    repository: {
      id: 102,
      name: 'react.dev',
      full_name: 'reactjs/react.dev',
      owner: { login: 'reactjs' },
      description: 'The React documentation website',
      language: 'TypeScript',
      stargazers_count: 11894,
      forks_count: 7601,
      open_issues_count: 421,
      html_url: 'https://github.com/reactjs/react.dev'
    }
  },
  {
    id: 3,
    number: 30412,
    title: 'CLI: `--watch` flag ignores files added after startup on Linux',
    body: 'On Linux (inotify backend), files created after the watcher starts are not picked up until restart. macOS (fsevents) works fine.\n\nLikely in `packages/vite/src/node/watcher.ts`. A failing test exists in the linked PR.',
    state: 'open',
    html_url: 'https://github.com/vitejs/vite/issues/30412',
    created_at: '2026-06-20T18:30:00Z',
    updated_at: '2026-07-09T11:05:00Z',
    comments: 12,
    labels: [
      { name: 'bug', color: 'd73a4a' },
      { name: 'p3-minor-bug', color: 'fef2c0' },
      { name: 'help wanted', color: '008672' }
    ],
    user: { login: 'patak-dev', avatar_url: 'https://avatars.githubusercontent.com/u/583075?v=4' },
    repository: {
      id: 103,
      name: 'vite',
      full_name: 'vitejs/vite',
      owner: { login: 'vitejs' },
      description: 'Next generation frontend tooling',
      language: 'TypeScript',
      stargazers_count: 69120,
      forks_count: 6280,
      open_issues_count: 512,
      html_url: 'https://github.com/vitejs/vite'
    }
  },
  {
    id: 4,
    number: 512,
    title: 'Add `--json` output to the stats subcommand',
    body: 'Machine-readable output would let people pipe stats into jq. Should mirror the table columns 1:1.\n\nGood starter task — the table renderer already receives a struct you can serialize.',
    state: 'open',
    html_url: 'https://github.com/junegunn/fzf/issues/512',
    created_at: '2026-07-05T07:45:00Z',
    updated_at: '2026-07-11T19:12:00Z',
    comments: 2,
    labels: [
      { name: 'good first issue', color: '7057ff' },
      { name: 'enhancement', color: 'a2eeef' }
    ],
    user: { login: 'junegunn', avatar_url: 'https://avatars.githubusercontent.com/u/700826?v=4' },
    repository: {
      id: 104,
      name: 'fzf',
      full_name: 'junegunn/fzf',
      owner: { login: 'junegunn' },
      description: 'A command-line fuzzy finder',
      language: 'Go',
      stargazers_count: 65103,
      forks_count: 2450,
      open_issues_count: 89,
      html_url: 'https://github.com/junegunn/fzf'
    }
  }
]

const DEMO_FILES: Record<string, string> = {
  [`${DEMO_REPO_ROOT}/README.md`]: '# zustand (demo checkout)\n\nBear necessities for state management in React.\n\n## Install\n\n```bash\nnpm install zustand\n```\n',
  [`${DEMO_REPO_ROOT}/package.json`]: '{\n  "name": "zustand",\n  "version": "5.0.2",\n  "main": "index.js"\n}\n',
  [`${DEMO_REPO_ROOT}/src/index.ts`]: "export { create } from './react'\nexport { createStore } from './vanilla'\nexport * from './middleware'\n",
  [`${DEMO_REPO_ROOT}/src/middleware/persist.ts`]: "import type { StateCreator } from '../vanilla'\n\nexport interface PersistOptions<S> {\n  name: string\n  version?: number\n}\n\nexport const persist = <S>(config: StateCreator<S>, options: PersistOptions<S>) => {\n  // NOTE: hydration currently resolves after first paint for async storages.\n  // See issue #2814 — a race between rehydrate() and the first selector read.\n  return config\n}\n",
  [`${DEMO_REPO_ROOT}/src/vanilla.ts`]: 'export type StateCreator<S> = (set: (s: Partial<S>) => void, get: () => S) => S\n\nexport const createStore = <S>(creator: StateCreator<S>) => {\n  let state: S\n  const listeners = new Set<() => void>()\n  const set = (partial: Partial<S>) => {\n    state = { ...state, ...partial }\n    listeners.forEach((l) => l())\n  }\n  state = creator(set, () => state)\n  return { getState: () => state, subscribe: (l: () => void) => listeners.add(l) }\n}\n',
  [`${DEMO_REPO_ROOT}/docs/hydration.md`]: '# Hydration\n\nHow persisted state is restored on startup.\n'
}

const DIR_LISTING: Record<string, { name: string; isDirectory: boolean }[]> = {
  [DEMO_REPO_ROOT]: [
    { name: 'src', isDirectory: true },
    { name: 'docs', isDirectory: true },
    { name: 'README.md', isDirectory: false },
    { name: 'package.json', isDirectory: false }
  ],
  [`${DEMO_REPO_ROOT}/src`]: [
    { name: 'middleware', isDirectory: true },
    { name: 'index.ts', isDirectory: false },
    { name: 'vanilla.ts', isDirectory: false }
  ],
  [`${DEMO_REPO_ROOT}/src/middleware`]: [{ name: 'persist.ts', isDirectory: false }],
  [`${DEMO_REPO_ROOT}/docs`]: [{ name: 'hydration.md', isDirectory: false }]
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

let aiConfig = {
  mode: 'byok' as string,
  provider: 'openrouter',
  model: 'meta-llama/llama-3.3-70b-instruct:free',
  telemetryEnabled: true,
  hasKey: true,
  installId: 'demo-install'
}

const gitState = {
  branch: 'issue-2814-persist-hydration-race',
  files: [
    { path: 'src/middleware/persist.ts', index: ' ', working_dir: 'M' },
    { path: 'docs/hydration.md', index: '?', working_dir: '?' }
  ]
}

const mockAiChat = async (payload: { messages: Array<{ role: string; content: string }> }) => {
  await delay(600)
  const last = payload.messages[payload.messages.length - 1]?.content || ''
  return {
    text:
      `Here's my take on that.\n\n**What's happening**: the \`persist\` middleware resolves hydration after the first paint for async storages, so the initial selector read sees the default value (see \`src/middleware/persist.ts\`).\n\n**Suggested approach**:\n\n1. Track a \`hasHydrated\` flag on the store\n2. Expose \`onRehydrateStorage\` so consumers can gate rendering\n3. Add a regression test with a fake async storage\n\n\`\`\`ts\nconst useStore = create(persist(creator, {\n  name: 'app',\n  onRehydrateStorage: () => (state) => state?.setHasHydrated(true)\n}))\n\`\`\`\n\nWant me to propose the exact file edits?` +
      (last.length > 400 ? '\n\n_(demo response — browser preview mode)_' : '')
  }
}

const api = {
  auth: {
    login: async () => {
      await delay(400)
      return true
    },
    check: async () => true,
    logout: async () => undefined,
    configStatus: async () => ({ hasClientId: true, source: 'env' as const })
  },
  github: {
    search: async () => {
      await delay(500)
      return { items: DEMO_ISSUES, totalCount: DEMO_ISSUES.length, page: 1, perPage: 30, hasNextPage: false }
    },
    user: async () => DEMO_USER,
    star: async () => ({}),
    fork: async () => ({ full_name: `${DEMO_USER.login}/zustand` }),
    getIssue: async (_owner: string, _repo: string, issueNumber: number) => {
      await delay(400)
      return {
        number: issueNumber,
        state: 'open',
        assignees: [{ login: DEMO_USER.login }],
        html_url: `https://github.com/pmndrs/zustand/issues/${issueNumber}`
      }
    },
    getPullRequest: async (_owner: string, _repo: string, prNumber: number) => {
      await delay(400)
      return {
        number: prNumber,
        state: 'open',
        merged: false,
        html_url: `https://github.com/pmndrs/zustand/pull/${prNumber}`,
        review_comments: 2,
        comments: 1
      }
    },
    checkClaimability: async (_owner: string, _repo: string, issueNumber: number) => {
      await delay(450)
      // Each demo issue exercises one pre-claim outcome:
      //   #2814 → closed + merged PR (blocked) · #9182 → assigned + open PR
      //   (blocked, "taken") · #30412 → assigned only (warn, claim anyway) ·
      //   anything else → clean (claimable).
      const base = {
        html_url: `https://github.com/pmndrs/zustand/issues/${issueNumber}`,
        comments: 3
      }
      const pr = (state: 'open' | 'closed', merged: boolean) => [
        { number: issueNumber + 100, state, merged, html_url: `https://github.com/pmndrs/zustand/pull/${issueNumber + 100}`, title: 'Fix the issue' }
      ]
      if (issueNumber === 2814) {
        return { ...base, state: 'closed', stateReason: 'completed', assignees: [{ login: 'other-dev' }], linkedPullRequests: pr('closed', true) }
      }
      if (issueNumber === 9182) {
        return { ...base, state: 'open', stateReason: null, assignees: [{ login: 'other-dev' }], linkedPullRequests: pr('open', false) }
      }
      if (issueNumber === 30412) {
        return { ...base, state: 'open', stateReason: null, assignees: [{ login: 'other-dev' }], linkedPullRequests: [] }
      }
      return { ...base, state: 'open', stateReason: null, assignees: [], linkedPullRequests: [] }
    },
    commentOnIssue: async (_owner: string, _repo: string, issueNumber: number) => {
      await delay(500)
      return { id: 1, html_url: `https://github.com/pmndrs/zustand/issues/${issueNumber}#issuecomment-demo` }
    },
    syncFork: async () => {
      await delay(400)
      return { merged: true, message: 'Fork synced with upstream.' }
    },
    getRepoDetails: async (_owner: string, repo: string) => ({
      name: repo,
      default_branch: 'main',
      stargazers_count: 48211
    }),
    createPullRequest: async () => ({
      number: 2861,
      html_url: 'https://github.com/pmndrs/zustand/pull/2861'
    }),
    listPullRequests: async () => [
      {
        number: 2861,
        title: 'Fix #2814: expose hydration state for async storages',
        state: 'open',
        html_url: 'https://github.com/pmndrs/zustand/pull/2861',
        head: { ref: gitState.branch },
        created_at: '2026-07-11T10:00:00Z'
      }
    ]
  },
  fs: {
    selectDir: async () => '/Users/demo/workspace',
    selectFiles: async () => [],
    readDir: async (path: string) => DIR_LISTING[path] || [],
    readFile: async (path: string) => DEMO_FILES[path] ?? `// ${path.split('/').pop()}\n`,
    readFileBuffer: async () => new ArrayBuffer(0),
    writeFile: async (path: string, content: string) => {
      DEMO_FILES[path] = content
    },
    createFile: async (path: string, content?: string) => {
      DEMO_FILES[path] = content || ''
    },
    createDir: async () => undefined,
    rename: async () => undefined,
    delete: async () => undefined,
    search: async (_path: string, query: string) =>
      Object.entries(DEMO_FILES)
        .filter(([, content]) => content.toLowerCase().includes(query.toLowerCase()))
        .slice(0, 10)
        .map(([path, content]) => {
          const lineIndex = content.toLowerCase().split('\n').findIndex((line) => line.toLowerCase().includes(query.toLowerCase()))
          return {
            path,
            line: Math.max(1, lineIndex + 1),
            column: 1,
            preview: content.split('\n')[Math.max(0, lineIndex)]?.trim() || ''
          }
        }),
    pathExists: async (path: string) => path.startsWith(DEMO_REPO_ROOT) || path === '/Users/demo/workspace',
    openTerminal: async () => undefined,
    listEditors: async () => ({
      items: [
        { id: 'vscode', label: 'Visual Studio Code' },
        { id: 'cursor', label: 'Cursor' }
      ],
      defaultEditorId: 'vscode'
    }),
    openEditor: async () => undefined,
    runCommand: async () => ({ stdout: 'demo\n', stderr: '', exitCode: 0 })
  },
  git: {
    clone: async (_url: string, parentDir: string, dirName: string) => {
      await delay(900)
      return `${parentDir}/${dirName}`
    },
    status: async () => ({ current: gitState.branch, files: gitState.files, ahead: 1, behind: 0 }),
    add: async () => undefined,
    commit: async () => {
      gitState.files = []
    },
    push: async () => undefined,
    pull: async () => undefined,
    currentBranch: async () => gitState.branch,
    checkout: async (_dir: string, branch: string) => {
      gitState.branch = branch
    },
    pushWithUpstream: async () => undefined,
    readFileAtHead: async (_dir: string, path: string) => DEMO_FILES[`${DEMO_REPO_ROOT}/${path}`] || '',
    discardFile: async () => undefined,
    discardAll: async () => undefined,
    listTrackedFiles: async () => Object.keys(DEMO_FILES),
    diff: async () =>
      `diff --git a/src/middleware/persist.ts b/src/middleware/persist.ts\n--- a/src/middleware/persist.ts\n+++ b/src/middleware/persist.ts\n@@ -6,4 +6,6 @@\n export const persist = ...\n+  let hasHydrated = false\n+  const markHydrated = () => { hasHydrated = true }\n`,
    diffSummary: async () => ({ changed: 2, insertions: 14, deletions: 2 })
  },
  notification: {
    show: async () => ({ shown: true })
  },
  app: {
    checkForUpdates: async () => ({ currentVersion: '1.0.0', updateAvailable: false, manifest: null })
  },
  ai: {
    setProvider: async (payload: { provider: string; apiKey: string; model?: string }) => {
      aiConfig.provider = payload.provider
      if (payload.model) aiConfig.model = payload.model
      if (payload.apiKey) aiConfig.hasKey = true
      return { provider: aiConfig.provider, hasKey: aiConfig.hasKey, model: aiConfig.model, mode: aiConfig.mode }
    },
    getProvider: async () => ({ provider: aiConfig.provider, hasKey: aiConfig.hasKey, model: aiConfig.model, mode: aiConfig.mode }),
    setMode: async (mode: 'byok' | 'subscription') => {
      aiConfig.mode = mode
      return { ...aiConfig }
    },
    getConfig: async () => ({ ...aiConfig }),
    setTelemetry: async (enabled: boolean) => {
      aiConfig.telemetryEnabled = enabled
      return { ...aiConfig }
    }
  },
  platform: {
    status: async () => ({ enabled: true, fallbackEnabled: false, connected: false, hasSession: false, backendBaseURL: 'http://localhost:8080' }),
    health: async () => ({ enabled: true, fallbackEnabled: false, connected: false, hasSession: false, backendBaseURL: 'http://localhost:8080', reachable: false }),
    me: async () => DEMO_USER,
    usage: async () => ({}),
    usageHistory: async () => ({ items: [] }),
    billingPlan: async () => ({ plan: 'free', status: 'active' }),
    aiModels: async () => ({
      items: [
        { id: 'meta-llama/llama-3.3-70b-instruct:free', label: 'Llama 3.3 70B (Free)', provider: 'openrouter', input_cost_per_1m: 0, output_cost_per_1m: 0, available: true, category: 'byok' },
        { id: 'deepseek/deepseek-chat-v3:free', label: 'DeepSeek V3 (Free)', provider: 'openrouter', input_cost_per_1m: 0, output_cost_per_1m: 0, available: true, category: 'byok' },
        { id: 'qwen/qwen3-coder:free', label: 'Qwen3 Coder (Free)', provider: 'openrouter', input_cost_per_1m: 0, output_cost_per_1m: 0, available: true, category: 'byok' }
      ]
    }),
    createCheckout: async () => ({ checkout_url: 'https://example.com', session_id: 'demo', plan: 'pro', currency: 'USD' }),
    upsertSession: async () => ({}),
    addSessionEvent: async () => undefined,
    addContribution: async () => undefined,
    listContributions: async () => ({ items: [] }),
    listChatThreads: async () => ({ items: [] }),
    upsertChatThread: async () => null,
    deleteChatThread: async () => undefined,
    generateCommitMessage: async () => 'fix(persist): expose hydration state for async storages',
    aiChat: mockAiChat,
    ensureSession: async () => false,
    reconnectBackend: async () => false,
    onBackendSessionChange: () => () => undefined
  },
  terminal: {
    create: async (payload: { id: string }) => ({ id: payload.id, mode: 'fallback' as const, shell: 'demo-shell', cwd: DEMO_REPO_ROOT }),
    write: async () => undefined,
    resize: async () => undefined,
    destroy: async () => undefined,
    onData: () => () => undefined,
    onReady: (_id: string, callback: (info: { shell?: string; cwd?: string; mode?: 'pty' | 'fallback' }) => void) => {
      setTimeout(() => callback({ shell: 'demo-shell', cwd: DEMO_REPO_ROOT, mode: 'fallback' }), 100)
      return () => undefined
    },
    onError: () => () => undefined,
    onExit: () => () => undefined
  },
  openExternal: async (url: string) => {
    window.open(url, '_blank')
  }
}

export function installBrowserMock(): void {
  const w = window as any
  w.api = api

  // Seed a demo workspace + selected issue so the full IDE renders for review.
  if (!localStorage.getItem('settings-storage')) {
    localStorage.setItem(
      'settings-storage',
      JSON.stringify({ state: { workspaceRoot: '/Users/demo/workspace', activeRepoPath: DEMO_REPO_ROOT, preferredEditorId: 'vscode' }, version: 0 })
    )
    localStorage.setItem(
      'issue-storage',
      JSON.stringify({ state: { selectedIssue: DEMO_ISSUES[0] }, version: 0 })
    )
    localStorage.setItem('focusfork-onboarding-complete', 'true')
  }
  w.gitAPI = {
    clone: api.git.clone,
    commitAndPush: async () => undefined,
    status: api.git.status,
    add: api.git.add,
    commit: api.git.commit,
    push: api.git.push,
    currentBranch: api.git.currentBranch,
    checkout: api.git.checkout,
    pushWithUpstream: api.git.pushWithUpstream,
    readFileAtHead: api.git.readFileAtHead,
    discardFile: api.git.discardFile,
    discardAll: api.git.discardAll,
    listTrackedFiles: api.git.listTrackedFiles
  }
  w.fsAPI = {
    listFiles: async () => Object.keys(DEMO_FILES),
    readFile: api.fs.readFile
  }
  w.vscodeAPI = {
    listEditors: api.fs.listEditors,
    open: async () => undefined
  }
  w.electron = {
    ipcRenderer: {
      invoke: async (channel: string, ..._args: unknown[]) => {
        if (channel === 'app:version') return '1.0.0 (preview)'
        if (channel === 'ai:set-provider') return api.ai.getProvider()
        return undefined
      },
      on: () => undefined,
      removeListener: () => undefined,
      send: () => undefined
    }
  }
  console.info('[FocusFork] Browser preview mode: mock window.api installed with demo data.')
}
