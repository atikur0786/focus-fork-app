/**
 * REAL golden-path proof: launches the built Electron app (real main process,
 * real GitHub auth from safeStorage, real git) and walks the full flow:
 *
 *   discover → select issue → star/fork/clone → branch → edit → commit →
 *   push → pull request
 *
 * Safety: the upstream target is octocat/Hello-World (GitHub's demo repo —
 * forking it is standard practice). The pull request is created on the
 * USER'S OWN FORK, never against the upstream, so no maintainer is spammed.
 *
 * Run: npx tsx tests/e2e/real-golden-path.mts
 */
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const APP_ROOT = resolve(import.meta.dirname, '../..')
const CDP_PORT = 9223
const SHOT_DIR = process.env.SHOT_DIR || tmpdir()
const UPSTREAM_OWNER = 'octocat'
const UPSTREAM_REPO = 'Hello-World'

const log = (step: string, detail = '') => {
  console.log(`\n[GOLDEN] ${step}${detail ? ` — ${detail}` : ''}`)
}

const fail = (step: string, error: unknown): never => {
  console.error(`\n[GOLDEN][FAIL] ${step}:`, error)
  process.exit(1)
}

async function main() {
  const workspace = mkdtempSync(join(tmpdir(), 'focusfork-golden-'))
  log('workspace', workspace)

  // Launch Electron directly (normal env → OS keychain works, real auth
  // loads) and attach Playwright over the Chrome DevTools Protocol.
  log('launching built Electron app with CDP')
  const child = spawn('npx', ['electron', '.', `--remote-debugging-port=${CDP_PORT}`], {
    cwd: APP_ROOT,
    stdio: ['ignore', 'pipe', 'pipe']
  })
  child.stdout.on('data', (d) => process.stdout.write(`[app] ${d}`))
  child.stderr.on('data', (d) => process.stderr.write(`[app:err] ${d}`))
  const app = { close: async () => child.kill() }

  let browser: Awaited<ReturnType<typeof chromium.connectOverCDP>> | null = null
  for (let attempt = 0; attempt < 20; attempt++) {
    await new Promise((r) => setTimeout(r, 1000))
    try {
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`)
      break
    } catch {
      // app still booting
    }
  }
  if (!browser) throw new Error('Could not attach to Electron over CDP')
  const contexts = browser.contexts()
  const page = contexts[0]?.pages()[0]
  if (!page) throw new Error('No renderer page found over CDP')
  await page.waitForLoadState('domcontentloaded')
  const shot = (name: string) => page.screenshot({ path: join(SHOT_DIR, `golden-${name}.png`) }).catch(() => undefined)

  try {
    // ---- Step 0: authenticated boot -------------------------------------
    log('step 0: check authentication')
    await page.waitForTimeout(2500)
    const user = await page.evaluate(() => (window as any).api.github.user())
    if (!user?.login) throw new Error('Not authenticated — no GitHub user resolved')
    log('step 0 OK', `logged in as ${user.login}`)

    // Skip onboarding if it appears, then seed the workspace root like the
    // Settings folder picker would.
    await page.evaluate((ws) => {
      localStorage.setItem('focusfork-onboarding-complete', 'true')
      const raw = localStorage.getItem('settings-storage')
      const parsed = raw ? JSON.parse(raw) : { state: {}, version: 0 }
      parsed.state = { ...parsed.state, workspaceRoot: ws, activeRepoPath: null }
      localStorage.setItem('settings-storage', JSON.stringify(parsed))
      location.reload()
    }, workspace)
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1500)

    // ---- Step 1: search real issues --------------------------------------
    log(`step 1: search issues in ${UPSTREAM_OWNER}/${UPSTREAM_REPO}`)
    await page.getByTestId('issue-search-input').fill(`repo:${UPSTREAM_OWNER}/${UPSTREAM_REPO}`)
    await page.getByTestId('issue-difficulty-filter').selectOption('all').catch(() => undefined)
    await page.getByTestId('search-btn').click()
    // A default search may already have painted cards; wait for a card that
    // belongs to the requested repo so we never grab stale results.
    const targetCard = page
      .getByTestId('issue-card')
      .filter({ hasText: `${UPSTREAM_OWNER}/${UPSTREAM_REPO}` })
      .first()
    await targetCard.waitFor({ timeout: 45000 })
    const cardCount = await page.getByTestId('issue-card').count()
    log('step 1 OK', `${cardCount} issue cards rendered from live GitHub search`)
    await shot('1-search')

    // ---- Step 2: select an issue -----------------------------------------
    log('step 2: select first issue')
    await targetCard.click()
    await page.getByTestId('issue-detail-panel').waitFor({ timeout: 10000 })
    await shot('2-detail')
    log('step 2 OK', 'detail panel rendered')

    // ---- Step 3: star + fork + clone via the real button -----------------
    log('step 3: star, fork & clone (real GitHub fork + real git clone)')
    await page.getByTestId('start-contribution-btn').click()
    await page.getByTestId('approval-approve-btn').click()
    // Clone of a fresh fork can take a while.
    await page.getByTestId('workspace-repo-name').waitFor({ timeout: 120000 })
    const repoName = await page.getByTestId('workspace-repo-name').innerText()
    log('step 3 OK', `workspace open: ${repoName}`)
    await shot('3-workspace')

    // ---- Step 4: create a branch -----------------------------------------
    log('step 4: create working branch (real git checkout -b)')
    await page.getByTestId('ide-tab-git').click()
    const branchInput = page.getByTestId('branch-name-input')
    await branchInput.waitFor({ timeout: 10000 })
    const branchName = `focusfork-proof-${Date.now()}`
    await branchInput.fill(branchName)
    await page.getByTestId('branch-create-btn').click()
    await page.waitForTimeout(2500)
    await shot('4-branch')
    log('step 4 OK', branchName)

    // ---- Step 5: edit a file (real fs write through the app bridge) ------
    log('step 5: edit README through the app fs bridge')
    const repoPath = await page.evaluate(() => {
      const raw = localStorage.getItem('settings-storage')
      return raw ? JSON.parse(raw).state.activeRepoPath : null
    })
    if (!repoPath) throw new Error('activeRepoPath not set after clone')
    await page.evaluate(async (dir) => {
      const api = (window as any).api
      const path = `${dir}/README`
      let current = ''
      try { current = await api.fs.readFile(path) } catch { /* new file */ }
      await api.fs.writeFile(path, `${current}\nFocusFork golden-path proof ${new Date().toISOString()}\n`)
    }, repoPath)
    await page.getByTestId('ide-git-refresh-btn').click()
    await page.waitForTimeout(1500)
    const changedFile = await page.getByTestId('ide-git-file').count()
    if (changedFile === 0) throw new Error('Edited file did not appear in git changes list')
    log('step 5 OK', 'README modified and visible in git panel')
    await shot('5-changes')

    // ---- Step 6: commit ---------------------------------------------------
    log('step 6: commit (real git commit with user identity)')
    await page.getByTestId('commit-msg-input').fill('docs: add FocusFork golden-path proof note')
    await page.getByTestId('ide-commit-btn').click()
    await page.getByTestId('approval-approve-btn').click()
    // Verify the commit actually happened: the changes list must clear.
    let committed = false
    for (let attempt = 0; attempt < 10 && !committed; attempt++) {
      await new Promise((r) => setTimeout(r, 1500))
      await page.getByTestId('ide-git-refresh-btn').click()
      await new Promise((r) => setTimeout(r, 1000))
      committed = (await page.getByTestId('ide-git-file').count()) === 0
    }
    if (!committed) throw new Error('Changes list never cleared — commit did not happen')
    await shot('6-commit')
    log('step 6 OK', 'commit verified (working tree clean)')

    // ---- Step 7: push -----------------------------------------------------
    log('step 7: push branch to fork (real git push)')
    await page.getByTestId('push-btn').click()
    await page.getByTestId('approval-approve-btn').click()
    // Verify the branch actually exists on GitHub — a silent local failure
    // must fail the proof, not slide by.
    let pushed = false
    for (let attempt = 0; attempt < 10 && !pushed; attempt++) {
      await new Promise((r) => setTimeout(r, 3000))
      const { execSync } = await import('node:child_process')
      try {
        const out = execSync(
          `git ls-remote https://github.com/${user.login}/${UPSTREAM_REPO}.git refs/heads/${branchName}`,
          { encoding: 'utf-8', timeout: 15000 }
        )
        pushed = out.includes(branchName)
      } catch {
        // remote check hiccup; retry
      }
    }
    if (!pushed) throw new Error(`Branch ${branchName} never appeared on the remote fork — push failed`)
    await shot('7-push')
    log('step 7 OK', `branch verified on github.com/${user.login}/${UPSTREAM_REPO}`)

    // ---- Step 8: pull request (on the user's own fork — no upstream spam) -
    log('step 8: create PR on your own fork via the real PR handler')
    const pr = await page.evaluate(
      async ({ login, repo, branch }) => {
        const api = (window as any).api
        const details = await api.github.getRepoDetails(login, repo)
        return api.github.createPullRequest({
          owner: login,
          repo,
          head: branch,
          base: details?.default_branch || 'master',
          title: 'FocusFork golden-path proof',
          body: 'Created by the FocusFork end-to-end proof run. Safe to close/delete.'
        })
      },
      { login: user.login, repo: UPSTREAM_REPO, branch: branchName }
    )
    if (!pr?.html_url && !pr?.url) throw new Error(`PR creation returned no URL: ${JSON.stringify(pr).slice(0, 300)}`)
    log('step 8 OK', `PULL REQUEST: ${pr.html_url || pr.url}`)
    await shot('8-done')

    console.log('\n============================================')
    console.log('GOLDEN PATH: ALL 8 STEPS PASSED FOR REAL')
    console.log(`User:      ${user.login}`)
    console.log(`Fork:      https://github.com/${user.login}/${UPSTREAM_REPO}`)
    console.log(`Branch:    ${branchName}`)
    console.log(`PR:        ${pr.html_url || pr.url}`)
    console.log('============================================\n')
  } catch (error) {
    await shot('failure')
    fail('golden path', error)
  } finally {
    await app.close().catch(() => undefined)
  }
}

void main()
