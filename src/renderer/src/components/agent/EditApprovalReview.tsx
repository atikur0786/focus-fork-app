import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, ExternalLink, Eye, FileCode2, Laptop } from 'lucide-react'
import { resolveRepoFilePath, type ProposedFileEdit } from '../../lib/ai-code-edits'
import { githubBlobUrl, githubForkBlobUrl, githubRepoHomeUrl } from '../../lib/github-links'
import { buildLineDiff, countDiffStats } from '../../lib/line-diff'
import { DiffBlock, isLargeDiff } from './DiffBlock'

const LARGE_DIFF_THRESHOLD = 100
const INLINE_PREVIEW_ROWS = 24

interface EditPreview {
  relativePath: string
  before: string
  after: string
  loading: boolean
}

export function EditApprovalReview({
  edits,
  repoRootPath,
  upstreamRepoFullName,
  forkLogin,
  branchName,
  issueNumber,
  onPreviewFile,
  onOpenInIde,
  pushAfterApply,
  onPushAfterApplyChange
}: {
  edits: ProposedFileEdit[]
  repoRootPath: string | null
  upstreamRepoFullName?: string | null
  forkLogin?: string | null
  branchName?: string | null
  issueNumber?: number
  onPreviewFile?: (relativePath: string, proposedContent: string) => void
  onOpenInIde?: () => void
  pushAfterApply: boolean
  onPushAfterApplyChange: (value: boolean) => void
}): React.JSX.Element {
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

  const branch = branchName?.trim() || 'main'

  return (
    <div className="space-y-4" data-testid="edit-approval-review">
      <div className="rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-text-secondary leading-relaxed">
        <p>
          <span className="font-medium text-text-main">{edits.length}</span> file
          {edits.length === 1 ? '' : 's'} will be written to your local clone
          {totalStats.added + totalStats.removed > 0 && (
            <>
              {' '}
              (
              <span className="text-success">+{totalStats.added}</span>
              {' / '}
              <span className="text-danger">-{totalStats.removed}</span> lines)
            </>
          )}
          . Review each diff below before approving.
        </p>
      </div>

      <div className="max-h-[min(52vh,420px)] overflow-y-auto rounded-lg border border-border divide-y divide-border">
        {edits.map((edit) => {
          const preview = previews[edit.relativePath]
          const expanded = expandedPath === edit.relativePath
          const stats =
            preview && !preview.loading
              ? countDiffStats(buildLineDiff(preview.before, preview.after))
              : { added: 0, removed: 0 }
          const large =
            preview && !preview.loading ? isLargeDiff(preview.before, preview.after, LARGE_DIFF_THRESHOLD) : false

          return (
            <div key={edit.relativePath} className="bg-background px-3 py-3" data-testid="approval-edit-item">
              <div className="flex flex-wrap items-start gap-2">
                <button
                  type="button"
                  data-testid={`approval-edit-toggle-${edit.relativePath}`}
                  onClick={() => setExpandedPath(expanded ? null : edit.relativePath)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  {expanded ? (
                    <ChevronDown size={14} className="shrink-0 text-text-muted" />
                  ) : (
                    <ChevronRight size={14} className="shrink-0 text-text-muted" />
                  )}
                  <FileCode2 size={14} className="shrink-0 text-text-muted" />
                  <span className="truncate font-mono text-xs text-text-main">{edit.relativePath}</span>
                  {preview && !preview.loading && (
                    <span className="shrink-0 text-[10px] text-text-muted">
                      +{stats.added} -{stats.removed}
                      {large ? ' · large' : ''}
                    </span>
                  )}
                </button>

                <div className="flex shrink-0 items-center gap-1">
                  {onPreviewFile && (
                    <button
                      type="button"
                      data-testid={`approval-edit-preview-${edit.relativePath}`}
                      onClick={() => onPreviewFile(edit.relativePath, edit.content)}
                      className="btn-secondary px-2 py-1 text-[10px]"
                      title="Open in workspace preview panel"
                    >
                      <Eye size={12} />
                      Preview
                    </button>
                  )}
                  {upstreamRepoFullName && (
                    <button
                      type="button"
                      data-testid={`approval-edit-github-${edit.relativePath}`}
                      onClick={() =>
                        void window.api.openExternal(githubBlobUrl(upstreamRepoFullName, branch, edit.relativePath))
                      }
                      className="btn-secondary px-2 py-1 text-[10px]"
                      title="View upstream file on GitHub"
                    >
                      <ExternalLink size={12} />
                      Upstream
                    </button>
                  )}
                  {forkLogin && upstreamRepoFullName && (
                    <button
                      type="button"
                      data-testid={`approval-edit-fork-${edit.relativePath}`}
                      onClick={() =>
                        void window.api.openExternal(
                          githubForkBlobUrl(forkLogin, upstreamRepoFullName, branch, edit.relativePath)
                        )
                      }
                      className="btn-secondary px-2 py-1 text-[10px]"
                      title="View file on your fork (same path)"
                    >
                      Fork
                    </button>
                  )}
                </div>
              </div>

              {expanded && preview?.loading && (
                <p className="mt-3 text-xs text-text-secondary">Loading diff…</p>
              )}

              {expanded && preview && !preview.loading && (
                <div className="mt-3">
                  {large ? (
                    <div className="space-y-3">
                      <p className="text-xs text-active-text rounded-lg border border-active/30 bg-active-soft px-3 py-2 leading-relaxed">
                        This is a large change. Use <strong>Preview</strong> or <strong>Open in IDE</strong> for the
                        full diff before approving.
                      </p>
                      <DiffBlock before={preview.before} after={preview.after} maxRows={INLINE_PREVIEW_ROWS} compact />
                      {onOpenInIde && (
                        <button
                          type="button"
                          data-testid="approval-edit-open-ide"
                          onClick={onOpenInIde}
                          className="btn-secondary text-xs"
                        >
                          <Laptop size={14} />
                          Open in IDE
                        </button>
                      )}
                    </div>
                  ) : (
                    <DiffBlock before={preview.before} after={preview.after} maxRows={60} />
                  )}
                </div>
              )}

              {!expanded && preview && !preview.loading && stats.added + stats.removed > 0 && (
                <p className="mt-2 font-mono text-[10px] text-text-muted truncate">
                  {preview.before.split('\n').length === 0 && preview.after.split('\n').length > 0
                    ? 'New file'
                    : `Sample: ${preview.after.split('\n').find((line, i) => preview.before.split('\n')[i] !== line)?.slice(0, 60) || 'modified'}`}
                </p>
              )}
            </div>
          )
        })}
      </div>

      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-background px-3 py-3">
        <input
          type="checkbox"
          data-testid="approval-push-after-apply"
          checked={pushAfterApply}
          onChange={(event) => onPushAfterApplyChange(event.target.checked)}
          className="mt-0.5"
        />
        <span className="text-sm leading-relaxed text-text-secondary">
          <span className="font-medium text-text-main">Commit and push to my fork</span> after writing files
          {issueNumber ? ` (issue #${issueNumber})` : ''}. Uses branch{' '}
          <span className="font-mono text-xs">{branch}</span>.
        </span>
      </label>

      {upstreamRepoFullName && (
        <div className="flex flex-wrap gap-2 text-xs">
          <button
            type="button"
            data-testid="approval-github-upstream-repo"
            onClick={() => void window.api.openExternal(githubRepoHomeUrl(upstreamRepoFullName))}
            className="text-text-secondary underline-offset-2 hover:text-text-main hover:underline"
          >
            Upstream repo on GitHub
          </button>
        </div>
      )}
    </div>
  )
}
