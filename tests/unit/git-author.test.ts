import test from 'node:test'
import assert from 'node:assert/strict'
import { gitAuthorEnv } from '../../src/main/lib/git-author'

test('builds git author and committer env from identity', () => {
  const env = gitAuthorEnv({ name: 'Jane Contributor', email: 'jane@example.com' })
  assert.deepEqual(env, {
    GIT_AUTHOR_NAME: 'Jane Contributor',
    GIT_AUTHOR_EMAIL: 'jane@example.com',
    GIT_COMMITTER_NAME: 'Jane Contributor',
    GIT_COMMITTER_EMAIL: 'jane@example.com'
  })
})

test('uses the identity verbatim without rewriting it', () => {
  const env = gitAuthorEnv({ name: 'octocat', email: 'octocat@users.noreply.github.com' })
  assert.equal(env.GIT_AUTHOR_NAME, 'octocat')
  assert.equal(env.GIT_AUTHOR_EMAIL, 'octocat@users.noreply.github.com')
})
