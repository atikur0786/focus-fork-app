import test from 'node:test'
import assert from 'node:assert/strict'
import simpleGit from 'simple-git'
import { GitService } from '../../src/main/services/git'
import { assertPersonalGitHubFork, parseGitHubPushTarget } from '../../src/main/lib/github-push-target'
import { humanizeError } from '../../src/renderer/src/lib/user-errors'

test('preserves the actionable push guard message across Electron IPC errors', () => {
  assert.equal(
    humanizeError(new Error("Error invoking remote method 'git:push': Error: Push blocked: select your personal fork.")),
    'Push blocked: select your personal fork.'
  )
})

test('parses GitHub HTTPS, SCP-style SSH, and SSH URLs', () => {
  for (const url of ['https://github.com/octocat/project.git', 'git@github.com:octocat/project.git', 'ssh://git@github.com/octocat/project.git']) {
    assert.deepEqual(parseGitHubPushTarget(url), { owner: 'octocat', repo: 'project' })
  }
})

test('rejects local paths, other hosts, credentials, and ambiguous repository paths', () => {
  for (const url of ['/tmp/repo', 'file:///tmp/repo', 'https://github.com.evil.test/octocat/project', 'https://github.com/octocat/project/extra', 'https://token@github.com/octocat/project', 'https://github.com/octocat/project?redirect=upstream']) {
    assert.throws(() => parseGitHubPushTarget(url), /Push blocked:/)
  }
})

test('requires personal ownership and actual fork metadata, including redirected repositories', () => {
  assert.doesNotThrow(() => assertPersonalGitHubFork('Octocat', 'octocat', { fork: true, owner: { login: 'octocat' } }))
  assert.throws(() => assertPersonalGitHubFork('upstream', 'octocat'), /another owner/)
  assert.throws(() => assertPersonalGitHubFork('octocat', 'octocat', { fork: false, owner: { login: 'octocat' } }), /Canonical repositories/)
  assert.throws(() => assertPersonalGitHubFork('octocat', 'octocat', { fork: true, owner: { login: 'upstream' } }), /not your personal/)
})

function fixture(config: Record<string, string> = {}, urls: Record<string, string> = { origin: 'https://github.com/octocat/project.git' }) {
  const pushes: unknown[][] = []
  const remoteCalls: string[][] = []
  const client = {
    getConfig: async (key: string) => ({ value: config[key] ?? null }),
    branchLocal: async () => ({ current: 'fix/issue-42' }),
    raw: async () => '',
    remote: async (args: string[]) => {
      remoteCalls.push(args)
      if (!(args[3] in urls)) throw new Error('missing remote')
      return urls[args[3]]
    },
    push: async (...args: unknown[]) => { pushes.push(args) }
  }
  const service = new GitService((() => client) as unknown as typeof simpleGit)
  service.setPushVerifier(async (owner) => assertPersonalGitHubFork(owner, 'octocat', { fork: true, owner: { login: owner } }))
  return { service, pushes, remoteCalls }
}

test('checks the effective push URL and pushes only the current branch explicitly', async () => {
  const { service, pushes, remoteCalls } = fixture()
  await service.push('/repo')
  assert.deepEqual(remoteCalls, [['get-url', '--push', '--all', 'origin']])
  assert.deepEqual(pushes, [['origin', 'HEAD:refs/heads/fix/issue-42']])
})

test('blocks upstream tracking and prevents fallback from bypassing the block', async () => {
  const { service, pushes } = fixture({ 'branch.fix/issue-42.remote': 'upstream' }, {
    origin: 'https://github.com/octocat/project.git', upstream: 'git@github.com:canonical/project.git'
  })
  await assert.rejects(service.push('/repo'), /Push blocked:.*another owner/)
  await assert.rejects(service.pushWithUpstream('/repo', 'fix/issue-42'), /Push blocked:.*another owner/)
  assert.equal(pushes.length, 0)
})

test('honors branch pushRemote and remote.pushDefault ahead of tracking remote', async () => {
  for (const key of ['branch.fix/issue-42.pushRemote', 'remote.pushDefault']) {
    const { service, pushes } = fixture({ [key]: 'upstream' }, { upstream: 'https://github.com/canonical/project.git' })
    await assert.rejects(service.push('/repo'), /Push blocked:/)
    assert.equal(pushes.length, 0)
  }
})

test('checks push URLs rather than fetch URLs and refuses multiple push destinations', async () => {
  for (const origin of ['https://github.com/canonical/project.git', 'https://github.com/octocat/project.git\nhttps://github.com/canonical/project.git']) {
    const { service, pushes } = fixture({}, { origin })
    await assert.rejects(service.push('/repo'), /Push blocked:/)
    assert.equal(pushes.length, 0)
  }
})

test('sets upstream only after ownership verification', async () => {
  const { service, pushes } = fixture()
  await service.pushWithUpstream('/repo', 'fix/issue-42')
  assert.deepEqual(pushes, [['origin', 'HEAD:refs/heads/fix/issue-42', { '--set-upstream': null }]])
})

test('fails closed when authentication/ownership verification or remote resolution fails', async () => {
  const { service, pushes } = fixture()
  service.setPushVerifier(async () => { throw new Error('Push blocked: verification unavailable') })
  await assert.rejects(service.push('/repo'), /verification unavailable/)
  assert.equal(pushes.length, 0)
  const missing = fixture({}, {})
  await assert.rejects(missing.service.push('/repo'), /could not be resolved/)
  assert.equal(missing.pushes.length, 0)
  const unconfigured = new GitService((() => ({ branchLocal: async () => ({ current: 'fix' }), getConfig: async () => ({ value: null }), raw: async () => '' })) as unknown as typeof simpleGit)
  await assert.rejects(unconfigured.push('/repo'), /sign in to GitHub/)
})
