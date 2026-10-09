import test from 'node:test'
import assert from 'node:assert/strict'
import { reviewerAgent } from '../../src/renderer/src/agents/reviewer-agent'
import { defaultContext, type AgentContext } from '../../src/renderer/src/agents/agent-context'

const buildContext = (overrides: Partial<AgentContext> = {}): AgentContext => ({
  ...defaultContext,
  ...overrides,
  repo: {
    ...defaultContext.repo,
    ...overrides.repo
  },
  auth: {
    ...defaultContext.auth,
    ...overrides.auth
  },
  issue: overrides.issue === undefined ? defaultContext.issue : overrides.issue
})

test('reviewer blocks discovery until auth and AI provider are ready', () => {
  const result = reviewerAgent.validateStep('discover', buildContext())

  assert.equal(result.ok, false)
  assert.deepEqual(result.errors, [
    'User is not authenticated.',
    'BYOK is selected but no provider key is saved yet.'
  ])
  assert.deepEqual(result.recovery, [
    'Sign in with GitHub, then retry the step.',
    'Open Settings, choose an AI provider, save that provider API key, then retry.'
  ])
})

test('reviewer allows BYOK discovery without backend when provider key is saved', () => {
  const result = reviewerAgent.validateStep(
    'discover',
    buildContext({
      auth: { isAuthenticated: true, userLogin: 'atikur0786', backendConnected: false },
      ai: {
        mode: 'byok',
        provider: 'gemini',
        hasKey: true,
        model: 'gemini-2.0-flash'
      }
    })
  )

  assert.equal(result.ok, true)
  assert.deepEqual(result.errors, [])
})

test('reviewer requires backend for subscription discovery', () => {
  const result = reviewerAgent.validateStep(
    'discover',
    buildContext({
      auth: { isAuthenticated: true, userLogin: 'atikur0786', backendConnected: false },
      ai: {
        mode: 'subscription',
        provider: 'openrouter',
        hasKey: false,
        model: 'meta-llama/llama-3.3-70b-instruct:free'
      }
    })
  )

  assert.equal(result.ok, false)
  assert.deepEqual(result.errors, ['Subscription router is not connected.'])
  assert.deepEqual(result.recovery, ['Reconnect the FocusFork backend session or switch to BYOK in Settings.'])
})

test('reviewer requires selected issue repository, title, and number', () => {
  const result = reviewerAgent.validateStep(
    'selected',
    buildContext({
      auth: { isAuthenticated: true, userLogin: 'atikur0786', backendConnected: true },
      issue: { title: 'Missing repo and number' }
    })
  )

  assert.equal(result.ok, false)
  assert.deepEqual(result.errors, [
    'Selected issue is missing a repository.',
    'Selected issue is missing an issue number.'
  ])
})

test('reviewer blocks shipping from default branches', () => {
  const result = reviewerAgent.validateStep(
    'pushed',
    buildContext({
      repo: {
        rootPath: '/tmp/repo',
        activeFilePath: '/tmp/repo/src/App.tsx',
        branchName: 'main'
      }
    })
  )

  assert.equal(result.ok, false)
  assert.deepEqual(result.errors, ['Create an issue branch before committing or pushing.'])
})

test('reviewer accepts an issue branch with a local repo', () => {
  const result = reviewerAgent.validateStep(
    'pushed',
    buildContext({
      repo: {
        rootPath: '/tmp/repo',
        activeFilePath: '/tmp/repo/src/App.tsx',
        branchName: 'issue-42-loading-state'
      }
    })
  )

  assert.equal(result.ok, true)
  assert.deepEqual(result.errors, [])
})

test('reviewer reports approval boundaries for PR creation', () => {
  const result = reviewerAgent.validateStep(
    'pr_created',
    buildContext({
      issue: {
        number: 42,
        title: 'Fix loading state',
        repoFullName: 'focusfork/demo'
      }
    })
  )

  assert.equal(result.ok, true)
  assert.deepEqual(result.approvalsRequired, ['filesystem-write', 'commit', 'push', 'pull-request'])
})
