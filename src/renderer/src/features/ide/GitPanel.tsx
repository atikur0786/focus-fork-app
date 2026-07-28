import { GitBranch } from 'lucide-react'
import { ReviewPanel } from './ReviewPanel'
import { useIssueStore } from '../../store/useIssueStore'
import { useReviewStore, selectCanCommit } from '../../store/useReviewStore'
import type { AgentContext } from '../../agents/agent-context'

interface GitPanelProps {
  branchName: string
  newBranchName: string
  onNewBranchNameChange: (value: string) => void
  onCreateBranch: () => void
  gitBusy: boolean
  changedFiles: string[]
  onFileClick: (file: string) => void
  onRefreshGitStatus: () => void
  commitMessage: string
  onCommitMessageChange: (value: string) => void
  onCommit: () => void
  onGenerateCommitMessage: () => void
  commitSuggesting: boolean
  onPush: () => void
  prTitle: string
  onPrTitleChange: (value: string) => void
  prBody: string
  onPrBodyChange: (value: string) => void
  prBaseBranch: string
  onPrBaseBranchChange: (value: string) => void
  prBusy: boolean
  onCreatePR: () => void
  onRefreshPRs: () => void
  pullRequests: any[]
  prStatusMessage: string
  repoPath: string | null
  agentContext: AgentContext
}

export const GitPanel = ({
  branchName,
  newBranchName,
  onNewBranchNameChange,
  onCreateBranch,
  gitBusy,
  changedFiles,
  onFileClick,
  onRefreshGitStatus,
  commitMessage,
  onCommitMessageChange,
  onCommit,
  onGenerateCommitMessage,
  commitSuggesting,
  onPush,
  prTitle,
  onPrTitleChange,
  prBody,
  onPrBodyChange,
  prBaseBranch,
  onPrBaseBranchChange,
  prBusy,
  onCreatePR,
  onRefreshPRs,
  pullRequests,
  prStatusMessage,
  repoPath,
  agentContext
}: GitPanelProps) => {
  const { selectedIssue } = useIssueStore()
  const canCommit = useReviewStore(selectCanCommit)
  const reviewStatus = useReviewStore((s) => s.reviewStatus)

  return (
    <div className="p-4 flex flex-col gap-4 overflow-auto">
      <div className="rounded-lg border border-border bg-background p-3">
        <div className="text-xs uppercase tracking-wide text-text-muted">Branch</div>
        <div className="mt-2 flex items-center gap-2 text-sm text-text-main">
          <GitBranch size={14} />
          <span>{branchName}</span>
        </div>
        <div className="mt-3 space-y-2">
          <input
            data-testid="branch-name-input"
            value={newBranchName}
            onChange={(event) => onNewBranchNameChange(event.target.value)}
            placeholder="issue-123-short-description"
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
          />
          <button
            data-testid="branch-create-btn"
            type="button"
            onClick={onCreateBranch}
            disabled={gitBusy || !newBranchName.trim()}
            className="rounded-md border border-border px-3 py-2 text-xs text-text-secondary hover:text-text-main disabled:opacity-60 cursor-pointer"
          >
            {gitBusy ? 'Working...' : 'Create & switch branch'}
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-background p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs uppercase tracking-wide text-text-muted">Changes</div>
          <button
            data-testid="ide-git-refresh-btn"
            onClick={onRefreshGitStatus}
            className="rounded-md border border-border px-2 py-1 text-xs text-text-secondary hover:text-text-main cursor-pointer"
          >
            Refresh
          </button>
        </div>
        <div className="mt-3 space-y-2">
          {changedFiles.length === 0 && (
            <div className="text-sm text-text-secondary">No local changes detected.</div>
          )}
          {changedFiles.map((file) => (
            <button
              key={file}
              data-testid="ide-git-file"
              onClick={() => onFileClick(file)}
              className="w-full text-left rounded-md border border-border px-3 py-2 text-sm text-text-main hover:bg-surface-hover cursor-pointer"
            >
              {file}
            </button>
          ))}
        </div>
      </div>

      <ReviewPanel
        repoPath={repoPath}
        agentContext={agentContext}
        changedFileCount={changedFiles.length}
      />

      <div className="rounded-lg border border-border bg-background p-3">
        <label
          className="text-xs uppercase tracking-wide text-text-muted"
          htmlFor="commit-message-input"
        >
          Commit message
        </label>
        <textarea
          id="commit-message-input"
          data-testid="commit-msg-input"
          value={commitMessage}
          onChange={(event) => onCommitMessageChange(event.target.value)}
          className="mt-2 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
          rows={3}
          placeholder="feat: describe your contribution"
        />
        <div className="mt-3 flex items-center gap-2">
          <button
            data-testid="ide-commit-btn"
            onClick={onCommit}
            disabled={gitBusy || !commitMessage.trim() || (reviewStatus !== 'idle' && !canCommit)}
            className="rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-60 cursor-pointer"
            title={reviewStatus !== 'idle' && !canCommit ? 'Acknowledge review findings before committing' : undefined}
          >
            {gitBusy ? 'Working...' : 'Commit'}
          </button>
          <button
            data-testid="ide-generate-commit-msg-btn"
            type="button"
            onClick={onGenerateCommitMessage}
            disabled={gitBusy || commitSuggesting || changedFiles.length === 0}
            className="rounded-md border border-border px-3 py-2 text-xs text-text-secondary hover:text-text-main disabled:opacity-60 cursor-pointer"
          >
            {commitSuggesting ? 'Generating...' : 'Suggest message'}
          </button>
          <button
            data-testid="push-btn"
            onClick={onPush}
            disabled={gitBusy}
            className="rounded-md border border-border px-3 py-2 text-xs text-text-secondary hover:text-text-main disabled:opacity-60 cursor-pointer"
          >
            Push
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-background p-3">
        <div className="text-xs uppercase tracking-wide text-text-muted">Pull Request</div>
        <input
          data-testid="pr-title-input"
          value={prTitle}
          onChange={(event) => onPrTitleChange(event.target.value)}
          placeholder={
            selectedIssue
              ? `Fix #${selectedIssue.number}: summarize the change`
              : 'PR title'
          }
          className="mt-2 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
        />
        <input
          data-testid="pr-base-input"
          value={prBaseBranch}
          onChange={(event) => onPrBaseBranchChange(event.target.value)}
          placeholder="Base branch (e.g. main)"
          className="mt-2 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
        />
        <textarea
          data-testid="pr-body-input"
          value={prBody}
          onChange={(event) => onPrBodyChange(event.target.value)}
          rows={4}
          placeholder="Describe the issue, what changed, and how you verified it."
          className="mt-2 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
        />
        <div className="mt-3 flex items-center gap-2">
          <button
            data-testid="pr-create-btn"
            onClick={onCreatePR}
            disabled={prBusy || !prTitle.trim()}
            className="rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-60 cursor-pointer"
          >
            {prBusy ? 'Creating...' : 'Create PR'}
          </button>
          <button
            data-testid="pr-refresh-btn"
            type="button"
            onClick={onRefreshPRs}
            disabled={prBusy || !selectedIssue}
            className="rounded-md border border-border px-3 py-2 text-xs text-text-secondary hover:text-text-main disabled:opacity-60 cursor-pointer"
          >
            Refresh PRs
          </button>
        </div>
        <div className="mt-3 text-xs text-text-secondary">{prStatusMessage}</div>
        {pullRequests.length > 0 && (
          <div data-testid="pr-list" className="mt-3 space-y-2">
            {pullRequests.slice(0, 5).map((pr) => (
              <button
                key={pr.id || pr.number || pr.html_url}
                type="button"
                onClick={() => void window.api.openExternal(pr.html_url)}
                className="w-full rounded-md border border-border px-3 py-2 text-left text-sm text-text-main hover:bg-surface-hover cursor-pointer"
              >
                <div className="font-medium">{pr.title || `PR #${pr.number}`}</div>
                <div className="mt-1 text-xs text-text-secondary">{pr.html_url}</div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
