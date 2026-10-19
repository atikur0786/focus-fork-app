import test from 'node:test'
import assert from 'node:assert/strict'
import { boundAIInput, githubWarningFromError } from '../../src/shared/agent-boundaries'
import { fetchAI, readAIJSON } from '../../src/main/lib/ai-network-boundary'
import { AIService } from '../../src/main/services/ai'
import { prepareAiChatPayload } from '../../src/renderer/src/lib/ai-chat-request'
import { humanizeError } from '../../src/renderer/src/lib/user-errors'

test('parses GitHub 429 and exhausted 403 reset epochs into a safe countdown', () => {
  for (const status of [403, 429]) {
    const warning = githubWarningFromError({ status, response: { headers: { 'X-RateLimit-Reset': '1060', 'x-ratelimit-remaining': '0' } } }, 1000000)
    assert.equal(warning?.retryAt, 1060000)
    assert.match(warning?.message || '', /60 seconds/)
  }
})

test('handles Retry-After, missing/invalid reset headers, and permission-only 403', () => {
  assert.equal(githubWarningFromError({ status: 429, response: { headers: { 'retry-after': '30', 'x-ratelimit-reset': 'invalid' } } }, 1000)?.retryAt, 31000)
  assert.equal(githubWarningFromError({ status: 429 })?.retryAt, null)
  assert.equal(githubWarningFromError({ status: 403, response: { headers: { 'x-ratelimit-reset': '9999999999', 'x-ratelimit-remaining': '4000' } } })?.kind, 'forbidden')
  assert.equal(githubWarningFromError({ status: 401 }), null)
  assert.equal(githubWarningFromError(null), null)
})

test('drops historical conversation first and preserves complete issue context, tree, and latest request', () => {
  const context = 'Issue description: original description\nFile tree:\n- src/main.ts'
  const result = boundAIInput([
    { role: 'user', content: 'old comment'.repeat(100) },
    { role: 'assistant', content: 'old answer'.repeat(100) },
    { role: 'user', content: 'latest task' }
  ], context, 250)
  assert.equal(result.context, context)
  assert.equal(result.droppedMessages, 2)
  assert.deepEqual(result.messages, [{ role: 'user', content: 'latest task' }])
})

test('rejects oversized protected context without truncating the original input', () => {
  const messages = [{ role: 'user', content: 'latest task' }]
  assert.throws(() => boundAIInput(messages, 'description'.repeat(100), 100), /preserved/)
  assert.equal(messages[0].content, 'latest task')
  assert.throws(() => boundAIInput([null, {}, { content: 123 }], ''), /no valid messages/)
})

test('renderer no longer slices long issue descriptions or the latest message', () => {
  const context = 'Issue description:\n' + 'x'.repeat(9000) + '\nFile tree:\n- src/main.ts'
  const latest = 'please inspect '.repeat(600)
  const payload = prepareAiChatPayload([{ role: 'user', content: latest }], context)
  assert.equal(payload.context, context)
  assert.equal(payload.messages[0].content, latest.trim())
})

test('handles malformed, oversized, and interrupted provider response bodies', async () => {
  await assert.rejects(readAIJSON(new Response('<html>bad gateway</html>')), /invalid response/)
  await assert.rejects(readAIJSON(new Response('x'.repeat(2 * 1024 * 1024 + 1))), /too large/)
  await assert.rejects(readAIJSON(new Response(new ReadableStream({ start(controller) { controller.error(new Error('connection reset')) } }))), /interrupted/)
  assert.deepEqual(await readAIJSON(new Response('{"ok":true}')), { ok: true })
})

test('normalizes network failures and aborts without leaking transport internals', async (t) => {
  const mock = t.mock.method(globalThis, 'fetch', async () => { throw new TypeError('internal socket details') })
  await assert.rejects(fetchAI('https://example.invalid'), /could not be reached/)
  mock.mock.mockImplementation(async () => { throw new DOMException('timeout', 'TimeoutError') })
  await assert.rejects(fetchAI('https://example.invalid'), /timed out/)
})

test('LLM anomalies are rejected cleanly and the same service can recover on the next call', async (t) => {
  const service = new AIService()
  service.setProvider('openai', 'test-key', 'test-model')
  const mock = t.mock.method(globalThis, 'fetch', async () => new Response('null'))
  await assert.rejects(service.chat([{ role: 'user', content: 'hello' }], ''), /AI provider could not complete/)
  mock.mock.mockImplementation(async () => new Response('{"choices":[{"message":{"content":"recovered"}}]}'))
  assert.equal(await service.chat([{ role: 'user', content: 'hello' }], ''), 'recovered')
  await assert.rejects(service.chat([], ''), /no valid messages/)
})

test('preserves countdown and context-limit advice through Electron IPC humanization', () => {
  assert.equal(humanizeError(new Error("Error invoking remote method 'github:fork': Error: GitHub rate limit reached. Retry in 60 seconds.")), 'GitHub rate limit reached. Retry in 60 seconds.')
})

test('real Octokit interceptor publishes a warning and prevents requests during cooldown', async (t) => {
  // Load the exact service source with native ESM Octokit; tsx's CJS loader
  // cannot load Octokit's import-only dependencies in this repository.
  const { readFileSync } = await import('node:fs')
  const { runInNewContext } = await import('node:vm')
  const ts = await import('typescript')
  const { Octokit } = await new Function('return import("octokit")')()
  const module = { exports: {} as { GitHubService: new () => any } }
  let clock = Date.now()
  runInNewContext(ts.transpileModule(readFileSync('src/main/services/github.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText, {
    module, exports: module.exports, console, Date: { now: () => clock },
    require: (name: string) => name === 'octokit' ? { Octokit }
      : name === './auth' ? { authService: { getToken: () => 'test-token' } }
      : { githubWarningFromError }
  })
  let calls = 0
  const reset = Math.ceil(Date.now() / 1000) + 90
  t.mock.method(globalThis, 'fetch', async () => {
    calls += 1
    return calls === 1
      ? new Response('{"message":"API rate limit exceeded"}', { status: 429, headers: { 'content-type': 'application/json', 'x-ratelimit-reset': String(reset) } })
      : new Response('{"fork":true}', { headers: { 'content-type': 'application/json' } })
  })
  const service = new module.exports.GitHubService()
  const warnings: unknown[] = []
  service.onRequestWarning((warning) => { warnings.push(warning) })
  await assert.rejects(service.getRepoDetails('octocat', 'project'), /GitHub rate limit reached/)
  await assert.rejects(service.getRepoDetails('octocat', 'project'), /GitHub rate limit reached/)
  assert.equal(calls, 1)
  assert.equal(warnings.length, 1)
  clock = reset * 1000 + 1000
  assert.equal((await service.getRepoDetails('octocat', 'project')).fork, true)
  assert.equal(calls, 2)
})

test('Zustand records warnings without advancing the workflow and clears them on recovery', async () => {
  const previousWindow = globalThis.window
  Object.assign(globalThis, { window: { api: { appStorage: { getItem: async () => null, setItem: async () => undefined } } } })
  try {
    const { useWorkflowEngineStore } = await import('../../src/renderer/src/store/useWorkflowEngineStore')
    const warning = githubWarningFromError({ status: 429 })!
    const before = useWorkflowEngineStore.getState().currentStep
    useWorkflowEngineStore.getState().recordGitHubWarning(warning)
    assert.equal(useWorkflowEngineStore.getState().currentStep, before)
    assert.equal(useWorkflowEngineStore.getState().githubWarning?.status, 429)
    assert.equal(useWorkflowEngineStore.getState().events[0].type, 'warning')
    useWorkflowEngineStore.getState().transition(before, 'Request recovered')
    assert.equal(useWorkflowEngineStore.getState().githubWarning, null)
  } finally {
    Object.assign(globalThis, { window: previousWindow })
  }
})
