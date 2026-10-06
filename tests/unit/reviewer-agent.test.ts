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

test('reviewer blocks discovery until auth and backend are ready', () => {
  const result = reviewerAgent.validateStep('discover', buildContext())

  assert.equal(result.ok, false)
  assert.deepEqual(result.errors, ['User is not authenticated.', 'Backend session is not connected.'])
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
