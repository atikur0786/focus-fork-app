import { expect, test } from '@playwright/test'

const sampleIssue = {
  id: 101,
  number: 42,
  title: 'Add loading state to contribution form',
  body: 'Improve the submit flow and add tests for the loading state.',
  state: 'open',
  html_url: 'https://github.com/example/repo/issues/42',
  repository: {
    full_name: 'example/repo',
    name: 'repo',
    stars: 1200,
    forks: 180,
    openIssues: 24,
    openPRs: 6,
    owner: {
      avatar_url: 'https://avatars.githubusercontent.com/u/1?v=4',
      login: 'example'
    },
    primaryLanguage: {
      name: 'TypeScript',
      color: '#3178c6'
    }
  },
  labels: [
    { id: 1, name: 'good first issue', color: '7057ff' },
    { id: 2, name: 'frontend', color: '1d76db' }
  ],
  created_at: '2026-05-01T10:00:00.000Z',
  updated_at: '2026-05-20T10:00:00.000Z'
}

const mockContribution = {
  id: 'evt-1',
  created_at: new Date('2026-05-13T10:00:00.000Z').toISOString(),
  repo_owner: 'example',
  repo_name: 'repo',
  issue_number: 42,
  event_type: 'pr.created',
  metadata: {
    title: 'fix: add loading state to contribution form',
    url: 'https://github.com/example/repo/pull/99'
  }
}

const registerDesktopMocks = async (page: import('@playwright/test').Page) => {
  await page.addInitScript(
    ({ issue, contribution }) => {
      const setPersistedState = (key: string, state: unknown, version = 1) => {
        localStorage.setItem(key, JSON.stringify({ state, version }))
      }

      ;(window as any).electron = {
        ipcRenderer: {
          invoke: async (channel: string) => {
            if (channel === 'ai:set-provider') return { model: 'openai/gpt-4o-mini' }
            return null
          }
        }
      }

      ;(window as any).vscodeAPI = {
        open: async () => undefined,
        listEditors: async () => ({ items: [{ id: 'code', label: 'VS Code' }], defaultEditorId: 'code' })
      }

      ;(window as any).gitAPI = {
        clone: async () => '/tmp/repo',
        commitAndPush: async () => undefined,
        status: async () => ({ modified: ['src/App.tsx'], not_added: [], created: [], deleted: [], renamed: [] }),
        add: async () => undefined,
        commit: async () => undefined,
        push: async () => undefined,
        currentBranch: async () => 'issue-42-add-loading-state',
        checkout: async () => undefined,
        pushWithUpstream: async () => undefined,
        readFileAtHead: async () => '',
        discardFile: async () => undefined,
        discardAll: async () => undefined
      }

      ;(window as any).fsAPI = {
        listFiles: async () => ['README.md', 'src/App.tsx'],
        readFile: async () => '# Repo'
      }

      ;(window as any).api = {
        auth: {
          check: async () => true,
          login: async () => true,
          logout: async () => undefined,
          configStatus: async () => ({ hasClientId: true, source: 'env' })
        },
        github: {
          search: async () => ({
            items: [issue],
            totalCount: 1,
            page: 1,
            perPage: 30,
            hasNextPage: false
          }),
          user: async () => ({
            login: 'atikur0786',
            name: 'Atikur',
            avatar_url: 'https://avatars.githubusercontent.com/u/2?v=4',
            html_url: 'https://github.com/atikur0786'
          }),
          fork: async () => ({ full_name: 'atikur0786/repo' }),
          getRepoDetails: async () => issue.repository,
          createPullRequest: async () => ({ html_url: 'https://github.com/example/repo/pull/99', number: 99 }),
          listPullRequests: async () => [{ id: 99, number: 99, title: 'Fix loading state', html_url: 'https://github.com/example/repo/pull/99' }]
        },
        fs: {
          selectDir: async () => '/tmp',
          readDir: async (path: string) => {
            if (path.endsWith('/repo')) {
              return [
                { name: 'README.md', isDirectory: false },
                { name: 'src', isDirectory: true }
              ]
            }
            if (path.endsWith('/repo/src')) {
              return [{ name: 'App.tsx', isDirectory: false }]
            }
            return []
          },
          readFile: async (path: string) => (path.endsWith('README.md') ? '# Repo' : 'export const App = () => null'),
          readFileBuffer: async () => new ArrayBuffer(0),
          writeFile: async () => undefined,
          createFile: async () => undefined,
          createDir: async () => undefined,
          rename: async () => undefined,
          delete: async () => undefined,
          search: async () => [{ path: '/tmp/repo/src/App.tsx', line: 1, column: 1, preview: 'loading state' }],
          pathExists: async () => true,
          openTerminal: async () => undefined,
          listEditors: async () => ({ items: [{ id: 'code', label: 'VS Code' }], defaultEditorId: 'code' }),
          openEditor: async () => undefined,
          runCommand: async () => ({ stdout: '', stderr: '', exitCode: 0 })
        },
        git: {
          clone: async () => '/tmp/repo',
          status: async () => ({ modified: ['src/App.tsx'], not_added: [], created: [], deleted: [], renamed: [] }),
          add: async () => undefined,
          commit: async () => undefined,
          push: async () => undefined,
          currentBranch: async () => 'issue-42-add-loading-state',
          checkout: async () => undefined,
          pushWithUpstream: async () => undefined,
          readFileAtHead: async () => '',
          discardFile: async () => undefined,
          discardAll: async () => undefined
        },
        notification: {
          show: async () => undefined
        },
        platform: {
          status: async () => ({ enabled: true, fallbackEnabled: false, connected: true, hasSession: true, backendBaseURL: 'http://localhost:8080' }),
          me: async () => ({
            login: 'atikur0786',
            name: 'Atikur',
            avatar_url: 'https://avatars.githubusercontent.com/u/2?v=4',
            html_url: 'https://github.com/atikur0786'
          }),
          usage: async () => ({}),
          billingPlan: async () => ({}),
          aiModels: async () => ({
            items: [
              { id: 'openai/gpt-4o-mini', label: 'GPT-4o mini', provider: 'openai' },
              { id: 'deepseek/deepseek-chat', label: 'DeepSeek Chat', provider: 'deepseek' }
            ]
          }),
          createCheckout: async () => ({}),
          upsertSession: async () => ({ sessionId: 'session-1', resumed: false }),
          addSessionEvent: async () => undefined,
          addContribution: async () => undefined,
          listContributions: async () => ({ items: [contribution] }),
          aiChat: async ({ messages }: { messages: Array<{ role: string; content: string }> }) => ({
            text: `AI response for: ${messages[messages.length - 1]?.content || 'request'}`
          })
        },
        openExternal: async () => undefined
      }

      setPersistedState('settings-storage', {
        workspaceRoot: '/tmp',
        activeRepoPath: '/tmp/repo',
        preferredEditorId: 'code'
      }, 2)
      setPersistedState('issue-storage', {
        selectedIssue: issue,
        activeIssues: [issue]
      }, 1)
      setPersistedState('ui-storage', {
        currentView: 'issues'
      }, 2)
      setPersistedState('contribution-workflow-storage', {
        activeIssueId: issue.id,
        steps: {
          fork: 'success',
          clone: 'success',
          install: 'pending',
          branch: 'success',
          code: 'pending',
          test: 'pending',
          commit: 'pending',
          pr: 'pending'
        },
        activityTimeline: []
      }, 1)
    },
    { issue: sampleIssue, contribution: mockContribution }
  )
}

test.describe('golden path shell', () => {
  test('login screen renders the github entrypoint', async ({ page }) => {
    await page.addInitScript(() => {
      ;(window as any).electron = { ipcRenderer: { invoke: async () => ({ model: 'openai/gpt-4o-mini' }) } }
      ;(window as any).api = {
        auth: {
          check: async () => false,
          login: async () => true,
          logout: async () => undefined,
          configStatus: async () => ({ hasClientId: true, source: 'env' })
        },
        platform: {
          status: async () => ({ enabled: true, connected: false, fallbackEnabled: false, hasSession: false, backendBaseURL: 'http://localhost:8080' })
        }
      }
    })
    await page.goto('/')
    await expect(page.getByTestId('login-screen')).toBeVisible()
    await expect(page.getByTestId('github-login-btn')).toBeVisible()
  })

  test('authenticated discover flow shell renders issue selection', async ({ page }) => {
    await registerDesktopMocks(page)
    await page.goto('/')
    await expect(page.getByTestId('user-avatar')).toBeVisible()
    await expect(page.getByTestId('discover-tab')).toBeVisible()
    await expect(page.getByTestId('issue-search-input')).toBeVisible()
    await expect(page.getByTestId('issue-card').first()).toBeVisible()
    await page.getByTestId('issue-card').first().click()
    await expect(page.getByTestId('issue-detail-panel')).toBeVisible()
    await expect(page.getByTestId('evaluate-fit-btn')).toBeVisible()
  })

  test('ide shell exposes branch workflow and guided ai actions', async ({ page }) => {
    await registerDesktopMocks(page)
    await page.addInitScript(() => {
      localStorage.setItem('ui-storage', JSON.stringify({ state: { currentView: 'ide' }, version: 2 }))
    })
    await page.goto('/')
    await page.getByTestId('ide-tab-git').click()
    await expect(page.getByTestId('branch-name-input')).toBeVisible()
    await expect(page.getByTestId('branch-create-btn')).toBeVisible()
    await expect(page.getByTestId('open-vscode-btn')).toBeVisible()
    await expect(page.getByTestId('ai-chat-panel')).toBeVisible()
    await expect(page.getByTestId('ai-quick-summary-btn')).toBeVisible()
    await expect(page.getByTestId('ai-quick-files-btn')).toBeVisible()
    await expect(page.getByTestId('ai-quick-plan-btn')).toBeVisible()
    await expect(page.getByTestId('ai-quick-commit-btn')).toBeVisible()
    await expect(page.getByTestId('ai-quick-pr-btn')).toBeVisible()
  })

  test('contribution history renders tracked workflow events', async ({ page }) => {
    await registerDesktopMocks(page)
    await page.addInitScript(() => {
      localStorage.setItem('ui-storage', JSON.stringify({ state: { currentView: 'contributions' }, version: 2 }))
    })
    await page.goto('/')
    await expect(page.getByTestId('history-tab')).toBeVisible()
    await expect(page.getByTestId('contribution-list')).toBeVisible()
    await expect(page.getByText('Pull request created')).toBeVisible()
  })

  test('evaluate fit runs AI analysis and start contribution opens approval gate', async ({ page }) => {
    await registerDesktopMocks(page)
    await page.goto('/')
    await page.getByTestId('issue-card').first().click()
    await expect(page.getByTestId('issue-detail-panel')).toBeVisible()
    await page.getByTestId('evaluate-fit-btn').click()
    await expect(page.getByText('AI response for:')).toBeVisible({ timeout: 10000 })
    await page.getByTestId('start-contribution-btn').click()
    await expect(page.getByTestId('approval-gate')).toBeVisible()
    await expect(page.getByTestId('approval-approve-btn')).toBeVisible()
  })
})
