import { Octokit } from 'octokit'
import { authService } from './auth'
import type { IssueSearchRequest, IssueSearchResponse } from '../../shared/issue-search-types'

export interface Issue {
  id: number
  number: number
  title: string
  body: string | null
  html_url: string
  state: string
  repository: {
    full_name: string
    name: string
    stars?: number
    forks?: number
    openIssues?: number
    openPRs?: number
    owner: {
      login: string
      avatar_url: string
    }
    primaryLanguage?: {
      name: string
      color: string
    } | null
  }
  labels: {
    id: number
    name: string
    color: string
  }[]
  assignees?: { login: string }[]
  comments?: number
  created_at: string
  updated_at: string
}

export interface GitHubIdentity {
  github_id: number
  github_login: string
  display_name: string
  avatar_url: string
  email: string
}

function splitRepositoryUrl(repositoryUrl: unknown): { owner: string; repo: string } {
  const url = String(repositoryUrl || '').trim()
  const marker = '/repos/'
  const idx = url.indexOf(marker)
  if (idx < 0) return { owner: '', repo: '' }
  const tail = url.slice(idx + marker.length)
  const [owner, repo] = tail.split('/')
  return { owner: (owner || '').trim(), repo: (repo || '').trim() }
}

function resolveSearchIssueRepository(item: any): { owner: string; repo: string; fullName: string } {
  const nestedOwner = String(item?.repository?.owner?.login || '').trim()
  const nestedRepo = String(item?.repository?.name || '').trim()
  const nestedFull = String(item?.repository?.full_name || '').trim()
  if (nestedOwner && nestedRepo) {
    return {
      owner: nestedOwner,
      repo: nestedRepo,
      fullName: nestedFull || `${nestedOwner}/${nestedRepo}`
    }
  }

  const fromUrl = splitRepositoryUrl(item?.repository_url)
  if (fromUrl.owner && fromUrl.repo) {
    return {
      owner: fromUrl.owner,
      repo: fromUrl.repo,
      fullName: `${fromUrl.owner}/${fromUrl.repo}`
    }
  }

  if (nestedFull.includes('/')) {
    const [owner, repo] = nestedFull.split('/')
    return { owner: owner || '', repo: repo || '', fullName: nestedFull }
  }

  return { owner: '', repo: '', fullName: '' }
}

export class GitHubService {
  private octokit: Octokit | null = null

  constructor() {}

  private async getOctokit(): Promise<Octokit> {
    const token = authService.getToken()
    if (!token) {
      throw new Error('Not authenticated')
    }

    if (!this.octokit || (this.octokit.request as any).defaults?.headers?.authorization !== `token ${token}`) {
      this.octokit = new Octokit({
        auth: token,
        userAgent: 'FocusFork',
        headers: { 'X-GitHub-Api-Version': '2022-11-28' }
      })
      // Octokit core ignores constructor headers; pin the outgoing REST defaults too.
      this.octokit.request = this.octokit.request.defaults({
        headers: { 'X-GitHub-Api-Version': '2022-11-28' }
      })
    }
    return this.octokit
  }

  async getUser() {
    const octokit = await this.getOctokit()
    const { data } = await octokit.rest.users.getAuthenticated()
    return {
      login: data.login,
      name: data.name || data.login,
      email: data.email || '',
      avatar_url: data.avatar_url,
      html_url: data.html_url
    }
  }

  async getAuthIdentity(): Promise<GitHubIdentity> {
    const octokit = await this.getOctokit()
    const [{ data: user }, { data: emails }] = await Promise.all([
      octokit.rest.users.getAuthenticated(),
      octokit.request('GET /user/emails')
    ])

    const primaryEmail = Array.isArray(emails)
      ? emails.find((item: any) => item?.primary && item?.verified)?.email ||
        emails.find((item: any) => item?.verified)?.email ||
        emails.find((item: any) => item?.email)?.email
      : undefined

    if (!primaryEmail) {
      throw new Error('GitHub account does not expose a verified email.')
    }

    return {
      github_id: user.id,
      github_login: user.login,
      display_name: user.name || user.login,
      avatar_url: user.avatar_url,
      email: primaryEmail
    }
  }

  async searchIssues(request: IssueSearchRequest): Promise<IssueSearchResponse> {
    const octokit = await this.getOctokit()
    const q = request.query || 'is:open is:issue label:"good first issue" archived:false'
    const page = Math.max(1, request.page ?? 1)
    const perPage = Math.min(100, Math.max(1, request.perPage ?? 30))
    const order = request.order === 'asc' ? 'asc' : 'desc'

    try {
      const { data } = await octokit.rest.search.issuesAndPullRequests({
        q,
        sort: request.sort,
        order,
        per_page: perPage,
        page
      })

      const items = (Array.isArray(data.items) ? data.items : [])
        .filter((item: any) => item && item.id)
        .map((item: any) => {
          const repo = resolveSearchIssueRepository(item)
          const ownerLogin = repo.owner
          const repoName = repo.repo
          const fullName = repo.fullName
          return {
            id: Number(item.id),
            number: Number(item.number ?? 0),
            title: String(item.title ?? 'Untitled issue'),
            body: item.body ?? null,
            html_url: String(item.html_url ?? ''),
            state: typeof item.state === 'string' ? item.state.toLowerCase() : 'open',
            repository: {
              full_name: fullName,
              name: repoName,
              owner: {
                login: ownerLogin,
                avatar_url: ownerLogin
                  ? String(item.repository?.owner?.avatar_url || `https://github.com/${ownerLogin}.png`)
                  : ''
              },
              primaryLanguage: null
            },
            labels: (Array.isArray(item.labels) ? item.labels : [])
              .filter((label: any) => label && typeof label.name === 'string')
              .map((label: any) => ({
                id: Number(label.id ?? 0),
                name: String(label.name),
                color: typeof label.color === 'string' ? label.color : '999999'
              })),
            assignees: (Array.isArray(item.assignees) ? item.assignees : [])
              .filter((assignee: any) => assignee && typeof assignee.login === 'string')
              .map((assignee: any) => ({ login: String(assignee.login) })),
            comments: typeof item.comments === 'number' ? item.comments : undefined,
            created_at: String(item.created_at ?? ''),
            updated_at: String(item.updated_at ?? item.created_at ?? '')
          } satisfies Issue
        })
        .filter((item) => item.repository.owner.login && item.repository.name)

      const totalCount = Number(data.total_count ?? items.length)
      const maxPage = Math.max(1, Math.ceil(totalCount / perPage))
      return {
        items,
        totalCount,
        page,
        perPage,
        hasNextPage: page < maxPage
      }
    } catch (error: any) {
      console.error('GitHub issue search failed:', error)
      throw this.normalizeGitHubError(error, 'Failed to search GitHub issues')
    }
  }

  async getRepoDetails(owner: string, repo: string) {
    try {
      const octokit = await this.getOctokit()
      const { data } = await octokit.rest.repos.get({
        owner,
        repo
      })
      return data
    } catch (error: any) {
      throw this.normalizeGitHubError(error, 'Failed to load repository details')
    }
  }

  async starRepository(owner: string, repo: string) {
    try {
      const octokit = await this.getOctokit()
      await octokit.rest.activity.starRepoForAuthenticatedUser({ owner, repo })
      return { starred: true }
    } catch (error: any) {
      if (error.status === 304) return { starred: true }
      throw this.normalizeGitHubError(error, 'Failed to star repository')
    }
  }

  async forkRepository(owner: string, repo: string) {
    try {
      const octokit = await this.getOctokit()
      const { data } = await octokit.rest.repos.createFork({
        owner,
        repo
      })
      return data
    } catch (error: any) {
      throw this.normalizeGitHubError(error, 'Failed to fork repository')
    }
  }

  /** Fetch one issue's live state — used to check whether a claim was assigned. */
  async getIssue(owner: string, repo: string, issueNumber: number) {
    try {
      const octokit = await this.getOctokit()
      const { data } = await octokit.rest.issues.get({ owner, repo, issue_number: issueNumber })
      return {
        number: data.number,
        state: String(data.state || 'open'),
        assignees: (Array.isArray(data.assignees) ? data.assignees : [])
          .filter((a: any) => a && typeof a.login === 'string')
          .map((a: any) => ({ login: String(a.login) })),
        html_url: String(data.html_url || '')
      }
    } catch (error: any) {
      throw this.normalizeGitHubError(error, 'Failed to load the issue')
    }
  }

  /**
   * Live pre-claim check: the search results can be minutes-to-hours stale, so
   * before the user posts a claim comment we fetch the issue's current state,
   * assignees, and any pull requests linked in its timeline. A merged linked PR
   * or a closed issue means the work is done and claiming would be noise.
   */
  async checkIssueClaimability(owner: string, repo: string, issueNumber: number) {
    try {
      const octokit = await this.getOctokit()
      const { data: issue } = await octokit.rest.issues.get({ owner, repo, issue_number: issueNumber })

      let linkedPullRequests: Array<{ number: number; state: string; merged: boolean; html_url: string; title: string }> = []
      try {
        const { data: events } = await octokit.rest.issues.listEventsForTimeline({
          owner,
          repo,
          issue_number: issueNumber,
          per_page: 100
        })
        linkedPullRequests = (events as any[])
          .filter((e) => e?.event === 'cross-referenced' && e?.source?.issue?.pull_request)
          .map((e) => {
            const src = e.source.issue
            return {
              number: Number(src.number),
              state: String(src.state || 'open'),
              merged: Boolean(src.pull_request?.merged_at),
              html_url: String(src.pull_request?.html_url || src.html_url || ''),
              title: String(src.title || '')
            }
          })
          // De-dupe by PR number, keep the latest reference.
          .filter((pr, idx, arr) => arr.findIndex((p) => p.number === pr.number) === idx)
          .slice(0, 10)
      } catch {
        // Timeline API is best-effort; state + assignees alone are still useful.
      }

      return {
        state: String(issue.state || 'open'),
        stateReason: issue.state_reason ? String(issue.state_reason) : null,
        assignees: (Array.isArray(issue.assignees) ? issue.assignees : [])
          .filter((a: any) => a && typeof a.login === 'string')
          .map((a: any) => ({ login: String(a.login) })),
        html_url: String(issue.html_url || ''),
        comments: Number(issue.comments ?? 0),
        linkedPullRequests
      }
    } catch (error: any) {
      throw this.normalizeGitHubError(error, 'Failed to check the issue status')
    }
  }

  /** Fetch one pull request's live state — used to track shipped contributions. */
  async getPullRequest(owner: string, repo: string, prNumber: number) {
    try {
      const octokit = await this.getOctokit()
      const { data } = await octokit.rest.pulls.get({ owner, repo, pull_number: prNumber })
      return {
        number: data.number,
        state: String(data.state || 'open'),
        merged: Boolean(data.merged),
        html_url: String(data.html_url || ''),
        review_comments: Number(data.review_comments ?? 0),
        comments: Number(data.comments ?? 0)
      }
    } catch (error: any) {
      throw this.normalizeGitHubError(error, 'Failed to load the pull request')
    }
  }

  /** Post a comment on an issue — used for the "comment to claim" etiquette flow. */
  async commentOnIssue(owner: string, repo: string, issueNumber: number, body: string) {
    try {
      const octokit = await this.getOctokit()
      const { data } = await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: issueNumber,
        body
      })
      return { id: data.id, html_url: data.html_url }
    } catch (error: any) {
      throw this.normalizeGitHubError(error, 'Failed to post the comment')
    }
  }

  /**
   * Sync the user's fork with its upstream (GitHub's merge-upstream API).
   * Used before starting a second issue on an already-cloned fork.
   */
  async syncForkWithUpstream(owner: string, repo: string, branch: string) {
    try {
      const octokit = await this.getOctokit()
      const { data } = await octokit.rest.repos.mergeUpstream({
        owner,
        repo,
        branch
      })
      return { merged: true, message: String((data as any)?.message || 'Fork synced with upstream.') }
    } catch (error: any) {
      // 409 = merge conflict with upstream; anything else is a plain failure.
      if (error?.status === 409) {
        return { merged: false, message: 'Fork has conflicts with upstream — resolve manually on GitHub.' }
      }
      throw this.normalizeGitHubError(error, 'Failed to sync fork with upstream')
    }
  }

  async createPullRequest(params: {
    owner: string
    repo: string
    head: string
    base: string
    title: string
    body?: string
  }) {
    try {
      const octokit = await this.getOctokit()
      const { data } = await octokit.rest.pulls.create({
        owner: params.owner,
        repo: params.repo,
        head: params.head,
        base: params.base,
        title: params.title,
        body: params.body
      })
      return data
    } catch (error: any) {
      throw this.normalizeGitHubError(error, 'Failed to create pull request')
    }
  }

  async listPullRequests(params: { owner: string; repo: string; state?: 'open' | 'closed' | 'all' }) {
    try {
      const octokit = await this.getOctokit()
      const { data } = await octokit.rest.pulls.list({
        owner: params.owner,
        repo: params.repo,
        state: params.state ?? 'open',
        per_page: 20
      })
      return data
    } catch (error: any) {
      throw this.normalizeGitHubError(error, 'Failed to list pull requests')
    }
  }

  async getOpenPullRequestCount(owner: string, repo: string): Promise<number> {
    try {
      const octokit = await this.getOctokit()
      const { data } = await octokit.rest.search.issuesAndPullRequests({
        q: `repo:${owner}/${repo} is:pr is:open`,
        per_page: 1
      })
      return Number(data?.total_count ?? 0)
    } catch (error: any) {
      throw this.normalizeGitHubError(error, 'Failed to count open pull requests')
    }
  }

  private normalizeGitHubError(error: any, fallbackMessage: string): Error {
    const status = error?.status ?? error?.response?.status
    const rateRemaining = error?.response?.headers?.['x-ratelimit-remaining']
    if (status === 401) {
      return new Error('GitHub authentication expired. Please sign in again.')
    }
    if (status === 403 && rateRemaining === '0') {
      return new Error('GitHub rate limit exceeded. Please wait a few minutes and retry.')
    }
    const rawMessage = error?.response?.data?.message ?? error?.message ?? fallbackMessage
    const message = typeof rawMessage === 'string' ? rawMessage : fallbackMessage
    return new Error(message)
  }
}

export const githubService = new GitHubService()
