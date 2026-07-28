import { Check } from 'lucide-react'
import clsx from 'clsx'
import { useIssueStore } from '../../store/useIssueStore'
import {
  getNextPendingStep,
  useContributionStore,
  WORKFLOW_GUIDE,
  WORKFLOW_LABELS,
  WORKFLOW_ORDER
} from '../../store/useContributionStore'

export const WorkflowPanel = () => {
  const { selectedIssue } = useIssueStore()
  const { steps, activityTimeline } = useContributionStore()
  const workflowNext = getNextPendingStep(steps)

  return (
    <div className="p-4 flex flex-col gap-4 overflow-auto">
      <div className="rounded-lg border border-border bg-background p-3">
        <div className="text-xs uppercase tracking-wide text-text-muted">Current issue</div>
        <div className="mt-2 text-sm text-text-main">
          {selectedIssue ? `#${selectedIssue.number} ${selectedIssue.title}` : 'No issue selected'}
        </div>
        <div className="mt-1 text-xs text-text-secondary">
          {selectedIssue?.repository.full_name || 'Choose an issue from Discover Issues.'}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-background p-3">
        <div className="text-xs uppercase tracking-wide text-text-muted">Checklist</div>
        <div className="mt-3 space-y-2">
          {WORKFLOW_ORDER.map((step) => {
            const status = steps[step]
            const isDone = status === 'success'
            return (
              <div key={step} className="rounded-md border border-border px-3 py-2">
                <div className="flex items-center gap-2 text-sm">
                  {isDone ? (
                    <Check size={14} className="text-green-500" />
                  ) : (
                    <div className="h-3.5 w-3.5 rounded-full border border-border" />
                  )}
                  <span className={clsx(isDone ? 'text-green-500' : 'text-text-main')}>
                    {WORKFLOW_LABELS[step]}
                  </span>
                </div>
                <div className="mt-1 text-xs text-text-secondary">{WORKFLOW_GUIDE[step]}</div>
              </div>
            )
          })}
        </div>
        <div className="mt-3 text-xs text-text-secondary">
          Next: {workflowNext ? WORKFLOW_GUIDE[workflowNext] : 'Workflow complete.'}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-background p-3">
        <div className="text-xs uppercase tracking-wide text-text-muted">Activity</div>
        <div className="mt-3 space-y-2">
          {activityTimeline.length === 0 && (
            <div className="text-sm text-text-secondary">No activity yet.</div>
          )}
          {activityTimeline.slice(0, 12).map((item) => (
            <div key={item.id} className="rounded-md border border-border px-3 py-2">
              <div className="text-sm text-text-main">{item.message}</div>
              <div className="mt-1 text-[11px] text-text-muted">
                {new Date(item.timestamp).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
