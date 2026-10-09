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

export interface AgentAIContext {
  mode: 'byok' | 'subscription'
  provider: string | null
  hasKey: boolean
  model: string | null
}

export interface AgentContext {
  selectedModelId: string
  currentStep: WorkflowStep
  issue: AgentIssueContext | null
  repo: AgentRepoContext
  auth: AgentAuthContext
  ai: AgentAIContext
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
  ai: {
    mode: 'byok',
    provider: 'openrouter',
    hasKey: false,
    model: AGENT_DEFAULT_MODEL_ID
  },
  timeline: [],
  metadata: {}
}

export const isAgentAIReady = (ctx: AgentContext): boolean => {
  if (ctx.ai.mode === 'subscription') return ctx.auth.backendConnected
  return Boolean(ctx.ai.hasKey && ctx.ai.provider)
}

export const describeAgentAIReadiness = (ctx: AgentContext): string => {
  if (ctx.ai.mode === 'subscription') {
    return ctx.auth.backendConnected
      ? `Subscription router ready (${ctx.selectedModelId}).`
      : 'Subscription router is not connected.'
  }

  if (ctx.ai.hasKey && ctx.ai.provider) {
    return `BYOK ready via ${ctx.ai.provider}${ctx.ai.model ? ` (${ctx.ai.model})` : ''}.`
  }

  return 'BYOK is selected but no provider key is saved yet.'
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

  const ai = [
    `AI mode: ${ctx.ai.mode}`,
    `AI provider: ${ctx.ai.provider || 'unknown'}`,
    `AI model: ${ctx.ai.model || ctx.selectedModelId}`,
    `Provider key saved: ${ctx.ai.hasKey ? 'yes' : 'no'}`,
    `AI readiness: ${describeAgentAIReadiness(ctx)}`
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
    ai,
    '',
    'Recent workflow timeline:',
    timeline
  ].join('\n')
}
