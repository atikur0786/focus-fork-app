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

export const AGENT_DEFAULT_MODEL_ID = 'meta-llama/llama-3.3-70b-instruct:free'

export const defaultContext: AgentContext = {
  selectedModelId: AGENT_DEFAULT_MODEL_ID,
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

export const buildAgentMissionPacket = (ctx: AgentContext): string => {
  const issue = ctx.issue
    ? [
        `Issue: ${ctx.issue.title || 'untitled'}`,
        `Issue number: ${ctx.issue.number || 'unknown'}`,
        `Repository: ${ctx.issue.repoFullName || 'unknown'}`,
        ctx.issue.body ? `Issue body: ${ctx.issue.body.slice(0, 2500)}` : ''
      ].filter(Boolean).join('\n')
    : 'Issue: none selected'

  const repo = [
    `Local repo: ${ctx.repo.rootPath || 'not cloned yet'}`,
    `Active file: ${ctx.repo.activeFilePath || 'none'}`,
    `Branch: ${ctx.repo.branchName || 'not ready'}`
  ].join('\n')

  const auth = [
    `GitHub authenticated: ${ctx.auth.isAuthenticated ? 'yes' : 'no'}`,
    `GitHub user: ${ctx.auth.userLogin || 'unknown'}`,
    `Backend connected: ${ctx.auth.backendConnected ? 'yes' : 'no'}`
  ].join('\n')

  const timeline = ctx.timeline.length
    ? ctx.timeline
        .slice(-8)
        .map((item) => `- [${item.level}] ${item.message}`)
        .join('\n')
    : '- No completed workflow events yet.'

  return [
    'FocusFork mission packet',
    `Current step: ${ctx.currentStep}`,
    `Selected model: ${ctx.selectedModelId}`,
    '',
    issue,
    '',
    repo,
    '',
    auth,
    '',
    'Recent workflow timeline:',
    timeline
  ].join('\n')
}
