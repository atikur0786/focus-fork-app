import type { AgentContext, WorkflowStep } from './agent-context'

export interface StepValidationResult {
  ok: boolean
  errors: string[]
}

const validateDiscover = (ctx: AgentContext): StepValidationResult => ({
  ok: true,
  errors: ctx.auth.isAuthenticated ? [] : ['User is not authenticated.']
})

const validateSelected = (ctx: AgentContext): StepValidationResult => ({
  ok: Boolean(ctx.issue?.repoFullName && ctx.issue?.title),
  errors: ctx.issue?.repoFullName && ctx.issue?.title ? [] : ['No issue is selected.']
})

const validateCloned = (ctx: AgentContext): StepValidationResult => ({
  ok: Boolean(ctx.repo.rootPath),
  errors: ctx.repo.rootPath ? [] : ['Repository is not cloned locally.']
})

const validateBranch = (ctx: AgentContext): StepValidationResult => ({
  ok: Boolean(ctx.repo.branchName),
  errors: ctx.repo.branchName ? [] : ['No working branch is active.']
})

const validateChanges = (ctx: AgentContext): StepValidationResult => ({
  ok: Boolean(ctx.repo.activeFilePath),
  errors: ctx.repo.activeFilePath ? [] : ['No active file context is available for changes.']
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
