import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { appPersistStorage } from './app-persist-storage'

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

export const WORKFLOW_SEQUENCE: WorkflowStep[] = [
  'discover',
  'selected',
  'forked',
  'cloned',
  'branch_ready',
  'changes_ready',
  'committed',
  'pushed',
  'pr_created'
]

type WorkflowEvent = {
  id: string
  at: string
  step: WorkflowStep
  type: 'transition' | 'error'
  message: string
  metadata?: Record<string, unknown>
}

interface WorkflowEngineState {
  issueId: number | null
  repoFullName: string | null
  currentStep: WorkflowStep
  stepTimestamps: Partial<Record<WorkflowStep, string>>
  lastError: { step: WorkflowStep; message: string; at: string } | null
  events: WorkflowEvent[]
  bindIssue: (issueId: number, repoFullName: string) => void
  transition: (step: WorkflowStep, message: string, metadata?: Record<string, unknown>) => void
  failStep: (step: WorkflowStep, message: string, metadata?: Record<string, unknown>) => void
  reset: () => void
}

const stepIndex = (step: WorkflowStep): number => WORKFLOW_SEQUENCE.indexOf(step)

const createEvent = (
  step: WorkflowStep,
  type: 'transition' | 'error',
  message: string,
  metadata?: Record<string, unknown>
): WorkflowEvent => ({
  id: `${Date.now()}-${Math.random()}`,
  at: new Date().toISOString(),
  step,
  type,
  message,
  metadata
})

export const useWorkflowEngineStore = create<WorkflowEngineState>()(
  persist(
    (set, get) => ({
      issueId: null,
      repoFullName: null,
      currentStep: 'discover',
      stepTimestamps: {},
      lastError: null,
      events: [],
      bindIssue: (issueId, repoFullName) => {
        const sameIssue = get().issueId === issueId
        if (sameIssue) return
        set({
          issueId,
          repoFullName,
          currentStep: 'selected',
          stepTimestamps: {
            discover: new Date().toISOString(),
            selected: new Date().toISOString()
          },
          lastError: null,
          events: [createEvent('selected', 'transition', `Issue #${issueId} selected`, { repoFullName })]
        })
      },
      transition: (step, message, metadata) => {
        const state = get()
        const now = new Date().toISOString()
        const currentIdx = stepIndex(state.currentStep)
        const nextIdx = stepIndex(step)
        const isForward = nextIdx >= currentIdx
        if (!isForward && state.currentStep !== step) return

        set({
          currentStep: nextIdx > currentIdx ? step : state.currentStep,
          stepTimestamps: {
            ...state.stepTimestamps,
            [step]: state.stepTimestamps[step] ?? now
          },
          lastError: null,
          events: [createEvent(step, 'transition', message, metadata), ...state.events].slice(0, 100)
        })
      },
      failStep: (step, message, metadata) => {
        const now = new Date().toISOString()
        const state = get()
        set({
          lastError: { step, message, at: now },
          events: [createEvent(step, 'error', message, metadata), ...state.events].slice(0, 100)
        })
      },
      reset: () =>
        set({
          issueId: null,
          repoFullName: null,
          currentStep: 'discover',
          stepTimestamps: {},
          lastError: null,
          events: []
        })
    }),
    {
      name: 'workflow-engine-storage',
      storage: appPersistStorage,
      version: 1
    }
  )
)
