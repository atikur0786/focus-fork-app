import type { AgentContext, WorkflowStep } from './agent-context'

export interface StepValidationResult {
  ok: boolean
  errors: string[]
}

const validateDiscover = (ctx: AgentContext): StepValidationResult => ({
  ok: ctx.auth.isAuthenticated && ctx.auth.backendConnected,
  errors: [
    ctx.auth.isAuthenticated ? '' : 'User is not authenticated.',
    ctx.auth.backendConnected ? '' : 'Backend session is not connected.'
  ].filter(Boolean)
})

const validateSelected = (ctx: AgentContext): StepValidationResult => ({
  ok: Boolean(ctx.issue?.repoFullName && ctx.issue?.title && ctx.issue?.number),
  errors: [
    ctx.issue?.repoFullName ? '' : 'Selected issue is missing a repository.',
    ctx.issue?.title ? '' : 'Selected issue is missing a title.',
    ctx.issue?.number ? '' : 'Selected issue is missing an issue number.'
  ].filter(Boolean)
})

const validateCloned = (ctx: AgentContext): StepValidationResult => ({
  ok: Boolean(ctx.repo.rootPath && ctx.issue?.repoFullName),
  errors: [
    ctx.repo.rootPath ? '' : 'Repository is not cloned locally.',
    ctx.issue?.repoFullName ? '' : 'No issue repository is attached to this workspace.'
  ].filter(Boolean)
})

const validateBranch = (ctx: AgentContext): StepValidationResult => ({
  ok: Boolean(ctx.repo.rootPath && ctx.repo.branchName && !['main', 'master'].includes(ctx.repo.branchName)),
  errors: [
    ctx.repo.rootPath ? '' : 'Repository is not cloned locally.',
    ctx.repo.branchName ? '' : 'No working branch is active.',
    ctx.repo.branchName && ['main', 'master'].includes(ctx.repo.branchName)
      ? 'Create an issue branch before committing or pushing.'
      : ''
  ].filter(Boolean)
})

const validateChanges = (ctx: AgentContext): StepValidationResult => ({
  ok: Boolean(ctx.repo.rootPath && ctx.repo.branchName && ctx.repo.activeFilePath),
  errors: [
    ctx.repo.rootPath ? '' : 'Repository is not cloned locally.',
    ctx.repo.branchName ? '' : 'No working branch is active.',
    ctx.repo.activeFilePath ? '' : 'No active file context is available for changes.'
  ].filter(Boolean)
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
      return { ok: false, errors: [`No validator exists for step ${step}.`] }
    }
    return validator(ctx)
  }
}
