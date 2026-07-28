export type WorkflowStep =
  | 'discover'
  | 'selected'
  | 'forked'
  | 'cloned'
  | 'branch_ready'
  | 'changes_ready'
  | 'committed'
  | 'pushed'
  | 'pr_created'

export interface AgentIssueContext {
  id?: number
  number?: number
  title?: string
  body?: string
  repoOwner?: string
  repoName?: string
  repoFullName?: string
}

export interface AgentRepoContext {
  rootPath: string | null
  activeFilePath: string | null
  branchName: string | null
}

export interface AgentAuthContext {
  isAuthenticated: boolean
  userLogin: string | null
  backendConnected: boolean
}

export interface AgentContext {
  selectedModelId: string
  currentStep: WorkflowStep
  issue: AgentIssueContext | null
  repo: AgentRepoContext
  auth: AgentAuthContext
  timeline: Array<{
    id: string
    at: string
    message: string
    level: 'info' | 'success' | 'error'
  }>
  metadata: Record<string, unknown>
}

export const defaultContext: AgentContext = {
  selectedModelId: 'meta-llama/llama-3.3-70b-instruct:free',
  currentStep: 'discover',
  issue: null,
  repo: {
    rootPath: null,
    activeFilePath: null,
    branchName: null
  },
  auth: {
    isAuthenticated: false,
    userLogin: null,
    backendConnected: false
  },
  timeline: [],
  metadata: {}
}
