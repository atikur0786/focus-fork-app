export type StepStatus = 'pending' | 'loading' | 'success' | 'error'
export type ContributionStep = 'fork' | 'clone' | 'install' | 'branch' | 'code' | 'test' | 'commit' | 'pr'

export const WORKFLOW_ORDER: ContributionStep[] = ['fork', 'clone', 'install', 'branch', 'code', 'test', 'commit', 'pr']

export const WORKFLOW_LABELS: Record<ContributionStep, string> = {
  fork: 'Fork repository',
  clone: 'Clone repository',
  install: 'Install and run locally',
  branch: 'Create branch',
  code: 'Implement code changes',
  test: 'Run tests',
  commit: 'Commit and push',
  pr: 'Create pull request'
}

export const WORKFLOW_GUIDE: Record<ContributionStep, string> = {
  fork: 'Select an issue and click Fork & Clone.',
  clone: 'Wait for clone to finish and open the repo in IDE.',
  install: 'Open system terminal for this repo and run install/dev command.',
  branch: 'Create or switch to the issue branch in Source Control.',
  code: 'Edit files for the issue and save changes.',
  test: 'Run test command and confirm it passes.',
  commit: 'Stage all changes, commit with a message, then push.',
  pr: 'Fill PR title/description and create the pull request.'
}

export const initialWorkflowSteps = (): Record<ContributionStep, StepStatus> => ({
  fork: 'pending',
  clone: 'pending',
  install: 'pending',
  branch: 'pending',
  code: 'pending',
  test: 'pending',
  commit: 'pending',
  pr: 'pending'
})

export const getNextPendingStep = (steps: Record<ContributionStep, StepStatus>): ContributionStep | null => {
  return WORKFLOW_ORDER.find((step) => steps[step] !== 'success') ?? null
}

export const getNextStepGuidance = (steps: Record<ContributionStep, StepStatus>): string => {
  const next = getNextPendingStep(steps)
  if (!next) return 'All workflow steps completed. You can now monitor PR status.'
  return WORKFLOW_GUIDE[next]
}
