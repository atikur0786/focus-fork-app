export interface GitHubPushTarget {
  owner: string
  repo: string
}

export function assertPersonalGitHubFork(
  owner: string,
  login: string,
  repository?: { fork: boolean; owner: { login: string } }
): void {
  if (owner.toLowerCase() !== login.toLowerCase()) {
    throw new Error('Push blocked: the remote belongs to another owner. Point the push remote to your personal GitHub fork, not upstream.')
  }
  if (repository && (!repository.fork || repository.owner.login.toLowerCase() !== login.toLowerCase())) {
    throw new Error('Push blocked: the remote is not your personal GitHub fork. Canonical repositories cannot be pushed through FocusFork.')
  }
}

/** Accept only unambiguous GitHub HTTPS/SSH repository URLs. Never echo credentials. */
export function parseGitHubPushTarget(remoteUrl: string): GitHubPushTarget {
  const value = remoteUrl.trim()
  let pathname: string
  const scp = /^git@github\.com:([^?#]+)$/i.exec(value)
  if (scp) {
    pathname = scp[1]
  } else {
    let url: URL
    try {
      url = new URL(value)
    } catch {
      throw new Error('Push blocked: the remote must be a GitHub HTTPS or SSH repository URL.')
    }
    if (
      url.hostname.toLowerCase() !== 'github.com' ||
      !['https:', 'ssh:'].includes(url.protocol) ||
      url.password || url.search || url.hash ||
      (url.username && !(url.protocol === 'ssh:' && url.username === 'git')) ||
      (url.port && !(url.protocol === 'ssh:' && url.port === '22'))
    ) {
      throw new Error('Push blocked: only standard GitHub HTTPS or SSH remotes are supported.')
    }
    pathname = url.pathname.replace(/^\//, '')
  }
  const parts = pathname.replace(/\/$/, '').replace(/\.git$/, '').split('/')
  if (
    parts.length !== 2 ||
    parts.some((part) => !/^[a-z0-9_.-]+$/i.test(part) || part === '.' || part === '..')
  ) {
    throw new Error('Push blocked: the remote must identify a single GitHub owner and repository.')
  }
  return { owner: parts[0], repo: parts[1] }
}
