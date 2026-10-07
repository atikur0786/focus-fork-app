import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { appPersistStorage } from './app-persist-storage'
import {
  ContributionStep,
  StepStatus,
  WORKFLOW_ORDER,
  WORKFLOW_LABELS,
  WORKFLOW_GUIDE,
  getNextPendingStep,
  getNextStepGuidance,
  initialWorkflowSteps
} from './workflow'

export type { StepStatus, ContributionStep }
export { WORKFLOW_ORDER, WORKFLOW_LABELS, WORKFLOW_GUIDE, getNextPendingStep, getNextStepGuidance }

export interface ActivityItem {
  id: string
  timestamp: string
  message: string
  level: 'info' | 'success' | 'error'
}

interface IssueWorkflowSnapshot {
  steps: Record<ContributionStep, StepStatus>
  activityTimeline: ActivityItem[]
}

export interface ContributionState {
  steps: Record<ContributionStep, StepStatus>
  activeIssueId: number | null
  activityTimeline: ActivityItem[]
  issueWorkflows: Record<string, IssueWorkflowSnapshot>
  updateStep: (step: ContributionStep, status: StepStatus) => void
  initializeForIssue: (issueId: number) => void
  addActivity: (message: string, level?: ActivityItem['level']) => void
  getIssueActivity: (issueId: number) => ActivityItem[]
  reset: () => void
}

const issueKey = (issueId: number) => String(issueId)

const prependActivity = (timeline: ActivityItem[], item: ActivityItem): ActivityItem[] =>
  [item, ...timeline].slice(0, 100)

const createStartedTimeline = (issueId: number): ActivityItem[] => [
  {
    id: `${Date.now()}-issue`,
    timestamp: new Date().toISOString(),
    message: `Started contribution session for issue #${issueId}.`,
    level: 'info'
  }
]

const syncActiveView = (
  issueWorkflows: Record<string, IssueWorkflowSnapshot>,
  activeIssueId: number | null
): Pick<ContributionState, 'steps' | 'activityTimeline'> => {
  if (!activeIssueId) {
    return { steps: initialWorkflowSteps(), activityTimeline: [] }
  }
  const snapshot = issueWorkflows[issueKey(activeIssueId)]
  return {
    steps: snapshot?.steps || initialWorkflowSteps(),
    activityTimeline: snapshot?.activityTimeline || []
  }
}

export const useContributionStore = create<ContributionState>()(
  persist(
    (set, get) => ({
      steps: initialWorkflowSteps(),
      activeIssueId: null,
      activityTimeline: [],
      issueWorkflows: {},
      addActivity: (message, level = 'info') => {
        const activeIssueId = get().activeIssueId
        if (!activeIssueId) return

        const key = issueKey(activeIssueId)
        const snapshot = get().issueWorkflows[key] || {
          steps: get().steps,
          activityTimeline: get().activityTimeline
        }
        const activityTimeline = prependActivity(snapshot.activityTimeline, {
          id: `${Date.now()}-${Math.random()}`,
          timestamp: new Date().toISOString(),
          message,
          level
        })

        const issueWorkflows = {
          ...get().issueWorkflows,
          [key]: {
            ...snapshot,
            activityTimeline
          }
        }

        set({
          issueWorkflows,
          activityTimeline
        })
      },
      updateStep: (step, status) => {
        const activeIssueId = get().activeIssueId
        if (!activeIssueId) return

        const key = issueKey(activeIssueId)
        const snapshot = get().issueWorkflows[key] || {
          steps: get().steps,
          activityTimeline: get().activityTimeline
        }
        const previous = snapshot.steps[step]
        if (previous === status) return

        const steps = { ...snapshot.steps, [step]: status }
        let activityTimeline = snapshot.activityTimeline
        const notify = window.api?.notification?.show

        if (status === 'success') {
          const next = getNextPendingStep(steps)
          const nextHint = next ? ` Next: ${WORKFLOW_GUIDE[next]}` : ' All steps complete.'
          activityTimeline = prependActivity(activityTimeline, {
            id: `${Date.now()}-${step}-success`,
            timestamp: new Date().toISOString(),
            message: `${WORKFLOW_LABELS[step]} completed.${nextHint}`,
            level: 'success'
          })
          if (notify) void notify('Workflow Step Completed', `${WORKFLOW_LABELS[step]} completed.${nextHint}`)
        } else if (status === 'error') {
          const message = `${WORKFLOW_LABELS[step]} failed. ${WORKFLOW_GUIDE[step]}`
          activityTimeline = prependActivity(activityTimeline, {
            id: `${Date.now()}-${step}-error`,
            timestamp: new Date().toISOString(),
            message,
            level: 'error'
          })
          if (notify) void notify('Workflow Step Failed', message)
        } else if (status === 'loading') {
          activityTimeline = prependActivity(activityTimeline, {
            id: `${Date.now()}-${step}-loading`,
            timestamp: new Date().toISOString(),
            message: `${WORKFLOW_LABELS[step]} in progress.`,
            level: 'info'
          })
        }

        const issueWorkflows = {
          ...get().issueWorkflows,
          [key]: { steps, activityTimeline }
        }

        set({
          issueWorkflows,
          steps,
          activityTimeline
        })
      },
      initializeForIssue: (issueId) =>
        set((state) => {
          const key = issueKey(issueId)
          const existing = state.issueWorkflows[key]
          const snapshot =
            existing ||
            ({
              steps: initialWorkflowSteps(),
              activityTimeline: createStartedTimeline(issueId)
            } satisfies IssueWorkflowSnapshot)

          return {
            activeIssueId: issueId,
            issueWorkflows: {
              ...state.issueWorkflows,
              [key]: snapshot
            },
            steps: snapshot.steps,
            activityTimeline: snapshot.activityTimeline
          }
        }),
      getIssueActivity: (issueId) => get().issueWorkflows[issueKey(issueId)]?.activityTimeline || [],
      reset: () =>
        set({
          activeIssueId: null,
          issueWorkflows: {},
          steps: initialWorkflowSteps(),
          activityTimeline: []
        })
    }),
    {
      name: 'contribution-workflow-storage',
      storage: appPersistStorage,
      version: 2,
      migrate: (persisted) => {
        const state = persisted as Partial<ContributionState> & {
          activityTimeline?: ActivityItem[]
          steps?: Record<ContributionStep, StepStatus>
          activeIssueId?: number | null
        }
        const activeIssueId = state.activeIssueId ?? null
        const issueWorkflows: Record<string, IssueWorkflowSnapshot> = state.issueWorkflows || {}
        if (activeIssueId && !issueWorkflows[issueKey(activeIssueId)]) {
          issueWorkflows[issueKey(activeIssueId)] = {
            steps: state.steps || initialWorkflowSteps(),
            activityTimeline: state.activityTimeline || createStartedTimeline(activeIssueId)
          }
        }
        return {
          activeIssueId,
          issueWorkflows,
          ...syncActiveView(issueWorkflows, activeIssueId)
        }
      }
    }
  )
)
