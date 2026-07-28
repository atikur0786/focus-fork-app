/**
 * Backend-connected proof: launches the built Electron app against a RUNNING
 * FocusFork backend and verifies the full subscription-side integration —
 * JWT session sync from the stored GitHub login, backend health/billing/model
 * APIs, and the anonymous telemetry ping landing in Postgres.
 *
 * Prereqs: docker compose up -d && go run ./cmd/api (backend repo).
 * Run: npx tsx tests/e2e/backend-connected.mts
 */
import { chromium } from 'playwright'
import { spawn, execSync } from 'node:child_process'
import { resolve } from 'node:path'

const APP_ROOT = resolve(import.meta.dirname, '../..')
const CDP_PORT = 9224

const log = (step: string, detail = '') => {
  console.log(`\n[BACKEND-E2E] ${step}${detail ? ` — ${detail}` : ''}`)
}

async function main() {
  // Preflight: backend must be up.
  const health = execSync('curl -s -m 5 http://localhost:8080/healthz', { encoding: 'utf-8' })
  if (!health.includes('ok')) throw new Error('Backend /healthz not answering — start it first')
  log('preflight OK', 'backend /healthz answering')

  const child = spawn('npx', ['electron', '.', `--remote-debugging-port=${CDP_PORT}`], {
    cwd: APP_ROOT,
    stdio: ['ignore', 'pipe', 'pipe']
  })
  child.stderr.on('data', (d) => {
    const line = String(d)
    if (/error/i.test(line)) process.stderr.write(`[app:err] ${line}`)
  })

  let browser: Awaited<ReturnType<typeof chromium.connectOverCDP>> | null = null
  for (let attempt = 0; attempt < 20 && !browser; attempt++) {
    await new Promise((r) => setTimeout(r, 1000))
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`).catch(() => null)
  }
  if (!browser) throw new Error('Could not attach over CDP')
  const page = browser.contexts()[0]?.pages()[0]
  if (!page) throw new Error('No renderer page')
  await page.waitForLoadState('domcontentloaded')

  try {
    // 1. Backend reachable from the app
    log('check 1: app sees backend as reachable')
    const healthFromApp = await page.evaluate(() => (window as any).api.platform.health())
    if (!healthFromApp.reachable) throw new Error(`reachable=false: ${JSON.stringify(healthFromApp)}`)
    log('check 1 OK', healthFromApp.backendBaseURL)

    // 2. Session auto-connects (GitHub token → backend JWT)
    log('check 2: backend session auto-connects from stored GitHub login')
    let connected = false
    for (let attempt = 0; attempt < 15 && !connected; attempt++) {
      await new Promise((r) => setTimeout(r, 2000))
      await page.evaluate(() => (window as any).api.platform.reconnectBackend().catch(() => false))
      const status = await page.evaluate(() => (window as any).api.platform.status())
      connected = !!status.connected
    }
    if (!connected) throw new Error('Backend session never connected')
    const me = await page.evaluate(() => (window as any).api.platform.me())
    if (!me?.login) throw new Error('platform /auth/me returned no user')
    log('check 2 OK', `backend session for ${me.login}`)

    // 3. Billing plan + backend model catalog (subscription-side APIs)
    log('check 3: billing plan + backend model catalog')
    const plan = await page.evaluate(() => (window as any).api.platform.billingPlan())
    await page.evaluate(() => (window as any).api.ai.setMode('subscription'))
    const models = await page.evaluate(() => (window as any).api.platform.aiModels())
    await page.evaluate(() => (window as any).api.ai.setMode('byok'))
    const modelCount = Array.isArray(models?.items) ? models.items.length : 0
    if (modelCount === 0) throw new Error('Backend returned no models')
    log('check 3 OK', `plan=${plan?.plan || 'free'}, ${modelCount} backend models`)

    // 4. Issue search through the backend path
    log('check 4: issue search (backend-first path)')
    const search = await page.evaluate(() =>
      (window as any).api.github.search({ query: 'repo:octocat/Hello-World', page: 1 })
    )
    if (!Array.isArray(search?.items) || search.items.length === 0) {
      throw new Error('Search returned no items with backend connected')
    }
    log('check 4 OK', `${search.items.length} issues`)

    // 5. Real telemetry ping row for this install
    log('check 5: telemetry ping row in Postgres for the real install id')
    const installId = await page.evaluate(async () => (await (window as any).api.ai.getConfig()).installId)
    const row = execSync(
      `docker exec focus-fork-backend-postgres-1 psql -U focusfork -d focusfork -tAc "SELECT count(*) FROM telemetry_pings WHERE install_id='${installId}'"`,
      { encoding: 'utf-8' }
    ).trim()
    if (row === '0') throw new Error(`No telemetry row for install ${installId}`)
    log('check 5 OK', `install ${installId.slice(0, 8)}… counted for today`)

    console.log('\n==============================================')
    console.log('BACKEND-CONNECTED E2E: ALL 5 CHECKS PASSED')
    console.log(`User:    ${me.login}`)
    console.log(`Plan:    ${plan?.plan || 'free'}`)
    console.log(`Models:  ${modelCount} from backend`)
    console.log('==============================================\n')
  } catch (error) {
    console.error('\n[BACKEND-E2E][FAIL]', error)
    process.exitCode = 1
  } finally {
    child.kill()
  }
}

void main()
