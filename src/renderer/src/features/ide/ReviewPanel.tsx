import { useMemo } from 'react'
import { AlertTriangle, CheckCircle2, Info, Loader2, Shield, X } from 'lucide-react'
import clsx from 'clsx'
import type { AgentContext } from '../../agents/agent-context'
import type { ReviewFinding, ReviewSeverity } from '../../agents/code-review-agent'
import {
  useReviewStore,
  selectCanCommit,
  selectBlockingCount,
  selectAcknowledgedCount,
  selectFindingsBySeverity
} from '../../store/useReviewStore'

const SEVERITY_CONFIG: Record<
  ReviewSeverity,
  { label: string; icon: typeof AlertTriangle; cardClass: string; badgeClass: string }
> = {
  critical: {
    label: 'Critical',
    icon: AlertTriangle,
    cardClass: 'review-finding-critical',
    badgeClass: 'bg-[var(--color-severity-critical)] text-white'
  },
  warning: {
    label: 'Warning',
    icon: Shield,
    cardClass: 'review-finding-warning',
    badgeClass: 'bg-[var(--color-severity-warning)] text-white'
  },
  suggestion: {
    label: 'Suggestion',
    icon: Info,
    cardClass: 'review-finding-suggestion',
    badgeClass: 'bg-[var(--color-severity-suggestion)] text-white'
  }
}

const FindingCard = ({
  finding,
  onAcknowledge,
  onDismiss
}: {
  finding: ReviewFinding
  onAcknowledge: (id: string) => void
  onDismiss: (id: string) => void
}) => {
  const config = SEVERITY_CONFIG[finding.severity]
  const Icon = config.icon

  return (
    <div
      className={clsx(
        'rounded-lg p-3 transition-opacity',
        config.cardClass,
        finding.acknowledged && 'opacity-60'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0">
          <Icon size={14} className="shrink-0 mt-0.5" />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={clsx(
                  'inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase',
                  config.badgeClass
                )}
              >
                {config.label}
              </span>
              {finding.file && (
                <span className="text-[11px] font-mono text-text-secondary truncate">
                  {finding.file}
                  {finding.line ? `:${finding.line}` : ''}
                </span>
              )}
            </div>
            <p className="mt-1.5 text-sm text-text-main leading-snug">{finding.description}</p>
            {finding.suggestion && (
              <p className="mt-1.5 text-xs text-text-secondary leading-snug italic">
                {finding.suggestion}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {!finding.acknowledged && (
            <button
              onClick={() => onAcknowledge(finding.id)}
              className="rounded-md px-2 py-1 text-[11px] font-medium text-text-secondary hover:bg-surface-hover hover:text-text-main transition-colors"
              title="Acknowledge this finding"
            >
              Ack
            </button>
          )}
          <button
            onClick={() => onDismiss(finding.id)}
            className="rounded-md p-1 text-text-muted hover:bg-surface-hover hover:text-text-main transition-colors"
            title="Dismiss"
          >
            <X size={12} />
          </button>
        </div>
      </div>
      {finding.acknowledged && (
        <div className="mt-2 flex items-center gap-1 text-[11px] text-text-muted">
          <CheckCircle2 size={11} />
          Acknowledged
        </div>
      )}
    </div>
  )
}

const FindingGroup = ({
  severity,
  findings,
  onAcknowledge,
  onDismiss
}: {
  severity: ReviewSeverity
  findings: ReviewFinding[]
  onAcknowledge: (id: string) => void
  onDismiss: (id: string) => void
}) => {
  if (findings.length === 0) return null
  const config = SEVERITY_CONFIG[severity]

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
          {config.label}
        </span>
        <span className="text-[11px] text-text-muted">({findings.length})</span>
      </div>
      <div className="space-y-2">
        {findings.map((finding) => (
          <FindingCard
            key={finding.id}
            finding={finding}
            onAcknowledge={onAcknowledge}
            onDismiss={onDismiss}
          />
        ))}
      </div>
    </div>
  )
}

interface ReviewPanelProps {
  repoPath: string | null
  agentContext: AgentContext
  changedFileCount: number
}

export const ReviewPanel = ({ repoPath, agentContext, changedFileCount }: ReviewPanelProps) => {
  const {
    reviewStatus,
    reviewError,
    reviewSummary,
    runReview,
    acknowledgeFinding,
    acknowledgeAll,
    dismissFinding,
    clearReview
  } = useReviewStore()

  const canCommit = useReviewStore(selectCanCommit)
  const blockingCount = useReviewStore(selectBlockingCount)
  const acknowledgedCount = useReviewStore(selectAcknowledgedCount)
  // Subscribe to the findings array (stable reference between updates) and
  // derive groups with useMemo — selecting a freshly-built object from the
  // store re-renders forever (uncached getSnapshot).
  const findings = useReviewStore((state) => state.findings)
  const { critical, warning, suggestion } = useMemo(
    () => selectFindingsBySeverity({ findings } as Parameters<typeof selectFindingsBySeverity>[0]),
    [findings]
  )
  const totalFindings = critical.length + warning.length + suggestion.length

  const handleRunReview = async () => {
    if (!repoPath) return
    try {
      await runReview(repoPath, agentContext)
    } catch {
      // error is set in the store
    }
  }

  if (reviewStatus === 'idle' && changedFileCount === 0) {
    return null
  }

  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs uppercase tracking-wide text-text-muted">Code Review</div>
        {reviewStatus === 'done' && (
          <button
            onClick={clearReview}
            className="text-[11px] text-text-muted hover:text-text-main transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {reviewStatus === 'idle' && changedFileCount > 0 && (
        <div className="mt-3">
          <button
            onClick={() => void handleRunReview()}
            disabled={!repoPath}
            className="w-full rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-60 cursor-pointer flex items-center justify-center gap-2"
          >
            <Shield size={14} />
            Review {changedFileCount} changed file{changedFileCount !== 1 ? 's' : ''}
          </button>
          <p className="mt-2 text-[11px] text-text-muted text-center">
            Review changes before committing to catch issues early.
          </p>
        </div>
      )}

      {reviewStatus === 'reviewing' && (
        <div className="mt-3 flex flex-col items-center gap-2 py-4">
          <Loader2 size={20} className="animate-spin text-text-muted" />
          <p className="text-xs text-text-secondary">Reviewing your changes...</p>
        </div>
      )}

      {reviewStatus === 'error' && (
        <div className="mt-3">
          <div className="rounded-[10px] border border-danger/30 bg-danger-bg p-3">
            <p className="text-xs text-danger">{reviewError}</p>
          </div>
          <button
            onClick={() => void handleRunReview()}
            disabled={!repoPath}
            className="mt-2 w-full rounded-md border border-border px-3 py-2 text-xs text-text-secondary hover:text-text-main cursor-pointer"
          >
            Retry review
          </button>
        </div>
      )}

      {reviewStatus === 'done' && (
        <div className="mt-3 space-y-3">
          {reviewSummary && (
            <p className="text-xs text-text-secondary leading-relaxed">{reviewSummary}</p>
          )}

          {totalFindings === 0 && (
            <div className="flex items-center gap-2 rounded-[10px] border border-success/30 bg-success-bg p-3">
              <CheckCircle2 size={14} className="text-success shrink-0" />
              <p className="text-xs text-success">
                No issues found. Ready to commit.
              </p>
            </div>
          )}

          {totalFindings > 0 && (
            <>
              {blockingCount > 0 && (
                <div className="rounded-[10px] border border-danger/30 bg-danger-bg p-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle size={14} className="text-danger shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-medium text-danger">
                        {blockingCount} issue{blockingCount !== 1 ? 's' : ''} blocking commit
                      </p>
                      <p className="mt-1 text-[11px] text-danger/80">
                        Review and acknowledge all critical/warning findings before committing.
                        Unreviewed PRs are more likely to be rejected.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {canCommit && acknowledgedCount > 0 && (
                <div className="rounded-[10px] border border-active/30 bg-active-soft p-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle size={14} className="text-active-text shrink-0 mt-0.5" />
                    <p className="text-xs text-active-text">
                      You acknowledged {acknowledgedCount} review finding{acknowledgedCount !== 1 ? 's' : ''}.
                      Your PR might get rejected if these aren't addressed.
                    </p>
                  </div>
                </div>
              )}

              {blockingCount > 0 && (
                <button
                  onClick={acknowledgeAll}
                  className="w-full rounded-md border border-border px-3 py-2 text-[11px] text-text-secondary hover:text-text-main transition-colors cursor-pointer"
                >
                  Acknowledge all ({blockingCount} remaining)
                </button>
              )}

              <FindingGroup
                severity="critical"
                findings={critical}
                onAcknowledge={acknowledgeFinding}
                onDismiss={dismissFinding}
              />
              <FindingGroup
                severity="warning"
                findings={warning}
                onAcknowledge={acknowledgeFinding}
                onDismiss={dismissFinding}
              />
              <FindingGroup
                severity="suggestion"
                findings={suggestion}
                onAcknowledge={acknowledgeFinding}
                onDismiss={dismissFinding}
              />
            </>
          )}

          <button
            onClick={() => void handleRunReview()}
            disabled={!repoPath}
            className="w-full rounded-md border border-border px-3 py-2 text-[11px] text-text-secondary hover:text-text-main cursor-pointer"
          >
            Re-run review
          </button>
        </div>
      )}
    </div>
  )
}
