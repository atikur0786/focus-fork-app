import * as vscode from 'vscode'

type GitHubRepo = {
  owner: { login: string }
  name: string
  default_branch: string
}

type PullRequest = {
  number: number
  html_url: string
  state: string
  merged_at: string | null
}

export class GitHubClient {
  private get token(): string {
    return String(vscode.workspace.getConfiguration('focusfork').get('githubToken') ?? '').trim()
  }

  private get headers(): Record<string, string> {
    if (!this.token) {
      throw new Error('Missing focusfork.githubToken. Configure it in settings.')
    }
    return {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${this.token}`,
      'X-GitHub-Api-Version': '2022-11-28'
    }
  }

  private async request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const response = await fetch(`https://api.github.com${path}`, {
      method,
      headers: this.headers,
      body: body ? JSON.stringify(body) : undefined
    })
    const data = (await response.json().catch(() => ({}))) as T & { message?: string }
    if (!response.ok) {
      throw new Error((data as { message?: string }).message || `GitHub API failed (${response.status})`)
    }
    return data
  }

  async getViewerLogin(): Promise<string> {
    const me = await this.request<{ login: string }>('GET', '/user')
    return me.login
  }

  async fork(owner: string, repo: string): Promise<{ clone_url: string; full_name: string }> {
    return this.request('POST', `/repos/${owner}/${repo}/forks`)
  }

  async getRepo(owner: string, repo: string): Promise<GitHubRepo> {
    return this.request('GET', `/repos/${owner}/${repo}`)
  }

  async createPullRequest(input: {
    owner: string
    repo: string
    title: string
    body: string
    head: string
    base: string
  }): Promise<{ html_url: string; number: number }> {
    return this.request('POST', `/repos/${input.owner}/${input.repo}/pulls`, {
      title: input.title,
      body: input.body,
      head: input.head,
      base: input.base
    })
  }

  async getPullRequest(owner: string, repo: string, number: number): Promise<PullRequest> {
    return this.request('GET', `/repos/${owner}/${repo}/pulls/${number}`)
  }
}
