import { defineConfig } from '@playwright/test'

const e2ePort = Number(process.env.PLAYWRIGHT_E2E_PORT) || 5180
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${e2ePort}`

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  fullyParallel: false,
  retries: 0,
  webServer: {
    command: `VITE_DEV_SERVER_PORT=${e2ePort} npm run dev:renderer`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000
  },
  use: {
    baseURL,
    trace: 'on-first-retry'
  }
})
