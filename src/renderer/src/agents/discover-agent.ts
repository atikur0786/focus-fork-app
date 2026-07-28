import type { AgentContext } from './agent-context'
import { DEFAULT_DISCOVER_QUERY, type IssueSearchRequest } from '../../../shared/issue-search-types'

export interface DiscoverSearchFilters extends IssueSearchRequest {}

export interface DiscoverForkInput {
  owner: string
  repo: string
}

export interface DiscoverCloneInput {
  url: string
  parentDir: string
  dirName: string
}

export const discoverAgent = {
  async searchIssues(filters: DiscoverSearchFilters) {
    const query = typeof filters.query === 'string' && filters.query.trim() ? filters.query.trim() : DEFAULT_DISCOVER_QUERY
    return window.api.github.search({ ...filters, query })
  },

  async forkRepo(_ctx: AgentContext, input: DiscoverForkInput) {
    return window.api.github.fork(input.owner, input.repo)
  },

  async cloneRepo(_ctx: AgentContext, input: DiscoverCloneInput) {
    return window.gitAPI.clone(input.url, input.parentDir, input.dirName)
  }
}
