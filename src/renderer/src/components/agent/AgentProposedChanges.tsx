import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Eye, FileCode2, Loader2 } from 'lucide-react'
import { resolveRepoFilePath, type ProposedFileEdit } from '../../lib/ai-code-edits'
import { buildLineDiff, countDiffStats } from '../../lib/line-diff'
import { DiffBlock } from './DiffBlock'

export type ApplyProgressState = 'pending' | 'writing' | 'done' | 'error'

interface AgentProposedChangesProps {
  edits: ProposedFileEdit[]
  repoRootPath: string | null
  editsApplied?: boolean
  applyProgress?: Record<string, ApplyProgressState>
  applyBusy?: boolean
  onApply: () => void
  onViewFile?: (relativePath: string, proposedContent: string) => void
}

interface EditPreview {
  relativePath: string
  before: string
  after: string
  loading: boolean
}

export function AgentProposedChanges({
  edits,
  repoRootPath,
  editsApplied = false,
  applyProgress = {},
  applyBusy = false,
  onApply,
  onViewFile
}: AgentProposedChangesProps): React.JSX.Element {
  const [expandedPath, setExpandedPath] = useState<string | null>(edits[0]?.relativePath ?? null)
  const [previews, setPreviews] = useState<Record<string, EditPreview>>({})

  useEffect(() => {
    setExpandedPath(edits[0]?.relativePath ?? null)
  }, [edits])

  useEffect(() => {
    if (!repoRootPath) return
    let cancelled = false

    const load = async () => {
      const next: Record<string, EditPreview> = {}
      for (const edit of edits) {
        next[edit.relativePath] = {
          relativePath: edit.relativePath,
          before: '',
          after: edit.content,
          loading: true
        }
      }
      setPreviews(next)

      for (const edit of edits) {
        const absolutePath = resolveRepoFilePath(repoRootPath, edit.relativePath)
        let before = ''
        try {
          before = await window.api.fs.readFile(absolutePath)
        } catch {
          try {
            before = await window.api.git.readFileAtHead(repoRootPath, edit.relativePath)
          } catch {
            before = ''
          }
        }
        if (cancelled) return
        setPreviews((prev) => ({
          ...prev,
          [edit.relativePath]: {
            relativePath: edit.relativePath,
            before,
            after: edit.content,
            loading: false
          }
        }))
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [edits, repoRootPath])

  const totalStats = useMemo(() => {
    return edits.reduce(
      (acc, edit) => {
        const preview = previews[edit.relativePath]
        if (!preview || preview.loading) return acc
        const stats = countDiffStats(buildLineDiff(preview.before, preview.after))
        acc.added += stats.added
        acc.removed += stats.removed
        return acc
      },
      { added: 0, removed: 0 }
    )
  }, [edits, previews])

  return (
    <div className="mt-3 rounded-xl border border-border bg-background" data-testid="agent-proposed-changes">
      <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2.5">
        <div>
          <div className="text-xs font-semibold text-text-main">
            {editsApplied ? 'Applied changes' : 'FocusFork proposed changes'}
          </div>
          <div className="mt-0.5 text-[11px] text-text-secondary">
            {edits.length} file{edits.length === 1 ? '' : 's'}
            {totalStats.added + totalStats.removed > 0 && (
              <>
                {' '}
                · <span className="text-success">+{totalStats.added}</span>{' '}
                <span className="text-danger">-{totalStats.removed}</span>
              </>
            )}
            {!editsApplied && <span> · expand a file to preview the diff</span>}
          </div>
        </div>
        {!editsApplied && (
          <button
            type="button"
            data-testid="ai-apply-edits-btn"
            onClick={onApply}
            disabled={!repoRootPath || applyBusy}
            className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-60"
          >
            {applyBusy ? 'Applying…' : 'Review & apply'}
          </button>
        )}
      </div>

      <div className="divide-y divide-border">
        {edits.map((edit) => {
          const preview = previews[edit.relativePath]
          const expanded = expandedPath === edit.relativePath
          const progress = applyProgress[edit.relativePath]
          const stats =
            preview && !preview.loading
              ? countDiffStats(buildLineDiff(preview.before, preview.after))
              : { added: 0, removed: 0 }

          return (
            <div key={edit.relativePath} className="px-3 py-2" data-testid="agent-proposed-change-item">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  data-testid={`agent-change-toggle-${edit.relativePath}`}
                  onClick={() => setExpandedPath(expanded ? null : edit.relativePath)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  {expanded ? <ChevronDown size={14} className="shrink-0 text-text-muted" /> : <ChevronRight size={14} className="shrink-0 text-text-muted" />}
                  <FileCode2 size={14} className="shrink-0 text-text-muted" />
                  <span className="truncate font-mono text-xs text-text-main">{edit.relativePath}</span>
                  {!preview?.loading && (
                    <span className="shrink-0 text-[10px] text-text-muted">
                      +{stats.added} -{stats.removed}
                    </span>
                  )}
                </button>

                {progress === 'writing' && <Loader2 size={14} className="animate-spin text-primary" />}
                {progress === 'done' && <span className="text-[10px] font-medium text-success">Saved</span>}
                {progress === 'error' && <span className="text-[10px] font-medium text-destructive">Failed</span>}

                {onViewFile && (
                  <button
                    type="button"
                    data-testid={`agent-change-view-${edit.relativePath}`}
                    onClick={() => onViewFile(edit.relativePath, edit.content)}
                    className="composer-tool-btn"
                    title="View diff in preview panel"
                  >
                    <Eye size={14} />
                  </button>
                )}
              </div>

              {expanded && preview && !preview.loading && (
                <div className="mt-2">
                  <DiffBlock before={preview.before} after={preview.after} maxRows={40} compact />
                </div>
              )}
              {expanded && preview?.loading && (
                <div className="mt-2 text-[11px] text-text-secondary">Loading diff…</div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
