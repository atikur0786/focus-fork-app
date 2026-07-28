import test from 'node:test'
import assert from 'node:assert/strict'
import { sessionMatchesWorkspace } from '../../src/renderer/src/lib/workspace-session'

test('matches repo full name and issue thread keys', () => {
  assert.equal(
    sessionMatchesWorkspace('openagents/sdk#issue-114', {
      repoFullName: 'openagents/sdk',
      issueNumber: 114
    }),
    true
  )
})

test('matches local clone path keys', () => {
  assert.equal(
    sessionMatchesWorkspace('/Users/dev/OpenAgents', {
      repoPath: '/Users/dev/OpenAgents'
    }),
    true
  )
})

test('does not match unrelated repositories', () => {
  assert.equal(
    sessionMatchesWorkspace('other/repo#issue-1', {
      repoFullName: 'openagents/sdk',
      issueNumber: 114
    }),
    false
  )
})
