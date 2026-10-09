import type { AgentContext, WorkflowStep } from './agent-context'
import { describeAgentAIReadiness, isAgentAIReady } from './agent-context'

export interface StepValidationResult {
  ok: boolean
  errors: string[]
  recovery: string[]
  approvalsRequired: string[]
}

const approvalMap: Record<WorkflowStep, string[]> = {
  discover: [],
  selected: [],
  forked: ['fork'],
  cloned: ['fork', 'clone'],
  branch_ready: [],
  changes_ready: ['filesystem-write'],
  committed: ['filesystem-write', 'commit'],
  pushed: ['filesystem-write', 'commit', 'push'],
  pr_created: ['filesystem-write', 'commit', 'push', 'pull-request']
}

const recoveryFor = (error: string): string => {
  if (error.includes('not authenticated')) return 'Sign in with GitHub, then retry the step.'
  if (error.includes('BYOK')) return 'Open Settings, choose an AI provider, save that provider API key, then retry.'
  if (error.includes('Subscription router')) return 'Reconnect the FocusFork backend session or switch to BYOK in Settings.'
  if (error.includes('repository')) return 'Select an issue from Discover so the workspace has repository context.'
  if (error.includes('issue number')) return 'Select a real GitHub issue before continuing.'
  if (error.includes('not cloned')) return 'Approve fork/clone or select an existing local clone in Settings.'
  if (error.includes('working branch') || error.includes('issue branch')) return 'Create or switch to an issue branch before committing, pushing, or opening a PR.'
  if (error.includes('active file')) return 'Open or preview a changed file so the agent has concrete file context.'
  return 'Review the step context, fix the missing prerequisite, then retry.'
}

const result = (
  step: WorkflowStep,
  errors: string[]
): StepValidationResult => ({
  ok: errors.length === 0,
  errors,
  recovery: errors.map(recoveryFor),
  approvalsRequired: approvalMap[step]
})

const validateDiscover = (ctx: AgentContext): StepValidationResult => ({
  ...result('discover', [
    ctx.auth.isAuthenticated ? '' : 'User is not authenticated.',
    isAgentAIReady(ctx) ? '' : describeAgentAIReadiness(ctx)
  ].filter(Boolean))
})

const validateSelected = (ctx: AgentContext): StepValidationResult => ({
  ...result('selected', [
    ctx.issue?.repoFullName ? '' : 'Selected issue is missing a repository.',
    ctx.issue?.title ? '' : 'Selected issue is missing a title.',
    ctx.issue?.number ? '' : 'Selected issue is missing an issue number.'
  ].filter(Boolean))
})

const validateCloned = (ctx: AgentContext): StepValidationResult => ({
  ...result('cloned', [
    ctx.repo.rootPath ? '' : 'Repository is not cloned locally.',
    ctx.issue?.repoFullName ? '' : 'No issue repository is attached to this workspace.'
  ].filter(Boolean))
})

const validateBranch = (ctx: AgentContext): StepValidationResult => ({
  ...result('pushed', [
    ctx.repo.rootPath ? '' : 'Repository is not cloned locally.',
    ctx.repo.branchName ? '' : 'No working branch is active.',
    ctx.repo.branchName && ['main', 'master'].includes(ctx.repo.branchName)
      ? 'Create an issue branch before committing or pushing.'
      : ''
  ].filter(Boolean))
})

const validateChanges = (ctx: AgentContext): StepValidationResult => ({
  ...result('changes_ready', [
    ctx.repo.rootPath ? '' : 'Repository is not cloned locally.',
    ctx.repo.branchName ? '' : 'No working branch is active.',
    ctx.repo.activeFilePath ? '' : 'No active file context is available for changes.'
  ].filter(Boolean))
})

const validators: Record<WorkflowStep, (ctx: AgentContext) => StepValidationResult> = {
  discover: validateDiscover,
  selected: validateSelected,
  forked: validateSelected,
  cloned: validateCloned,
  branch_ready: validateBranch,
  changes_ready: validateChanges,
  committed: validateBranch,
  pushed: validateBranch,
  pr_created: validateSelected
}

export const reviewerAgent = {
  validateStep(step: WorkflowStep, ctx: AgentContext): StepValidationResult {
    const validator = validators[step]
    if (!validator) {
      return result(step, [`No validator exists for step ${step}.`])
    }
    const validation = validator(ctx)
    return {
      ...validation,
      approvalsRequired: approvalMap[step]
    }
  },

  summarizeNextAction(step: WorkflowStep, ctx: AgentContext): string {
    const validation = this.validateStep(step, ctx)
    if (validation.ok) {
      const approvals = validation.approvalsRequired.length
        ? ` Approval gates required before: ${validation.approvalsRequired.join(', ')}.`
        : ''
      return `Step "${step}" is ready.${approvals}`
    }
    return `Step "${step}" is blocked: ${validation.errors.join(' ')} Recovery: ${validation.recovery.join(' ')}`
  }
}
