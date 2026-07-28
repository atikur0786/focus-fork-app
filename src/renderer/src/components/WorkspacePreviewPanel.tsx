import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { ExternalLink, FileCode, GitCompare, Github, Save, SquareArrowOutUpRight, X } from 'lucide-react'
import clsx from 'clsx'

import { buildLineDiff } from '../lib/line-diff'
import { githubBlobUrl, githubIssueUrl, githubRepoHomeUrl } from '../lib/github-links'
import { CodeEditor } from './CodeEditor'
import { useUIStore } from '../store/useUIStore'

interface WorkspacePreviewPanelProps {
  repoPath: string | null
  filePath: string | null
  relativePath: string | null
  content: string
  imageSrc: string | null
  isImage: boolean
  isChanged: boolean
  preferredEditorId?: string | null
  upstreamRepoFullName?: string | null
  forkLogin?: string | null
  branchName?: string | null
  issueNumber?: number
  onOpenExternal: () => void
  onClose?: () => void
  onFileContentChanged?: (path: string, content: string) => void
}

export function WorkspacePreviewPanel({
  repoPath,
  filePath,
  relativePath,
  content,
  imageSrc,
  isImage,
  isChanged,
  preferredEditorId,
  upstreamRepoFullName,
  forkLogin,
  branchName,
  issueNumber,
  onOpenExternal,
  onClose,
  onFileContentChanged
}: WorkspacePreviewPanelProps): React.JSX.Element {
  const [view, setView] = useState<'editor' | 'diff'>('editor')
  const [headContent, setHeadContent] = useState<string | null>(null)
  const [headError, setHeadError] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const editorContentRef = useRef(content)
  const { theme } = useUIStore()

  const branch = branchName?.trim() || 'main'
  const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)

  useEffect(() => {
    // Always open files in the editor; the Changes toggle is one click away.
    setView('editor')
    setDirty(false)
  }, [filePath])

  useEffect(() => {
    if (!repoPath || !relativePath || !isChanged) {
      setHeadContent(null)
      setHeadError(null)
      return
    }

    let cancelled = false
    void window.api.git
      .readFileAtHead(repoPath, relativePath)
      .then((value) => {
        if (!cancelled) {
          setHeadContent(value)
          setHeadError(null)
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setHeadContent('')
          setHeadError(error instanceof Error ? error.message : 'Could not load committed version.')
        }
      })

    return () => {
      cancelled = true
    }
  }, [repoPath, relativePath, isChanged])

  const diffRows = useMemo(() => {
    if (!isChanged || headContent === null) return []
    return buildLineDiff(headContent, content)
  }, [content, headContent, isChanged])

  const handleSave = useCallback(async (newContent: string) => {
    if (!filePath) return
    setSaving(true)
    try {
      await window.api.fs.writeFile(filePath, newContent)
      setDirty(false)
      onFileContentChanged?.(filePath, newContent)
    } catch (err) {
      console.error('Failed to save file:', err)
    } finally {
      setSaving(false)
    }
  }, [filePath, onFileContentChanged])

  const handleChange = useCallback((newContent: string) => {
    editorContentRef.current = newContent
    if (newContent !== content) {
      setDirty(true)
    }
  }, [content])

  if (!repoPath) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="empty-state max-w-sm text-center">
          <FileCode className="mx-auto h-8 w-8 text-text-muted mb-3" />
          <p className="text-sm font-medium text-text-main">No repository selected</p>
          <p className="mt-1 text-xs text-text-secondary">Fork and clone an issue from Discover to start working.</p>
        </div>
      </div>
    )
  }

  if (!filePath) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="empty-state max-w-sm text-center">
          <FileCode className="mx-auto h-8 w-8 text-text-muted mb-3" />
          <p className="text-sm font-medium text-text-main">Select a file to edit</p>
          <p className="mt-1 text-xs text-text-secondary">
            Browse files on the left, or ask the assistant to implement changes in chat.
          </p>
          {upstreamRepoFullName && (
            <button
              type="button"
              data-testid="preview-github-repo-empty"
              onClick={() => void window.api.openExternal(githubRepoHomeUrl(upstreamRepoFullName))}
              className="mt-4 inline-flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-main underline-offset-2 hover:underline"
            >
              <Github size={14} />
              Open {upstreamRepoFullName} on GitHub
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <div className="shrink-0 border-b border-border px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1 flex items-center gap-2">
            <span className="truncate font-mono text-[12px] text-text-main">{relativePath || filePath}</span>
            {dirty && (
              <span className="shrink-0 text-[10px] font-semibold text-active px-1.5 py-0.5 rounded-full bg-active-soft">
                Modified
              </span>
            )}
            {saving && (
              <span className="shrink-0 text-[10px] text-text-muted">Saving…</span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {dirty && (
              <button
                type="button"
                onClick={() => void handleSave(editorContentRef.current)}
                className="btn-secondary px-2 py-1 text-[11px]"
                title="Save (⌘S)"
              >
                <Save size={12} />
                Save
              </button>
            )}
            <button
              type="button"
              data-testid="preview-open-external-btn"
              onClick={onOpenExternal}
              className="btn-secondary px-2 py-1 text-[11px]"
              title={preferredEditorId ? `Open in ${preferredEditorId}` : 'Open in external IDE'}
            >
              <SquareArrowOutUpRight size={12} />
              IDE
            </button>
            {upstreamRepoFullName && (
              <button
                type="button"
                data-testid="preview-github-repo-btn"
                onClick={() => void window.api.openExternal(githubRepoHomeUrl(upstreamRepoFullName))}
                className="btn-secondary px-2 py-1 text-[11px]"
                title="Open upstream repository on GitHub"
              >
                <ExternalLink size={12} />
              </button>
            )}
            {onClose && (
              <button
                type="button"
                data-testid="preview-close-file-btn"
                onClick={onClose}
                className="btn-secondary px-1.5 py-1 text-[11px]"
                title="Close file"
              >
                <X size={13} />
              </button>
            )}
          </div>
        </div>

        {/* GitHub links row */}
        {upstreamRepoFullName && (
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
            <button
              type="button"
              data-testid="preview-github-upstream-file"
              onClick={() =>
                void window.api.openExternal(
                  githubBlobUrl(upstreamRepoFullName, branch, relativePath || '')
                )
              }
              className="inline-flex items-center gap-1 text-[10px] text-text-muted hover:text-text-main underline-offset-2 hover:underline"
            >
              <Github size={10} />
              Upstream
            </button>
            {issueNumber != null && (
              <button
                type="button"
                data-testid="preview-github-issue"
                onClick={() => void window.api.openExternal(githubIssueUrl(upstreamRepoFullName, issueNumber))}
                className="inline-flex items-center gap-1 text-[10px] text-text-muted hover:text-text-main underline-offset-2 hover:underline"
              >
                Issue #{issueNumber}
              </button>
            )}
            {forkLogin && (
              <button
                type="button"
                data-testid="preview-github-fork-file"
                onClick={() =>
                  void window.api.openExternal(
                    `https://github.com/${forkLogin}/${upstreamRepoFullName.split('/')[1]}/blob/${encodeURIComponent(branch)}/${(relativePath || '').replace(/^\.\//, '').split('/').map(encodeURIComponent).join('/')}`
                  )
                }
                className="inline-flex items-center gap-1 text-[10px] text-text-muted hover:text-text-main underline-offset-2 hover:underline"
              >
                Fork
              </button>
            )}
          </div>
        )}

        {/* View toggle: Editor | Changes */}
        {isChanged && (
          <div className="mt-2 inline-flex rounded-lg border border-border bg-background p-0.5">
            <button
              type="button"
              data-testid="preview-tab-editor"
              onClick={() => setView('editor')}
              className={clsx(
                'rounded-md px-3 py-1 text-[11px] font-medium transition-colors',
                view === 'editor' ? 'bg-surface-hover text-text-main' : 'text-text-secondary hover:text-text-main'
              )}
            >
              Editor
            </button>
            <button
              type="button"
              data-testid="preview-tab-diff"
              onClick={() => setView('diff')}
              className={clsx(
                'rounded-md px-3 py-1 text-[11px] font-medium transition-colors inline-flex items-center gap-1',
                view === 'diff' ? 'bg-surface-hover text-text-main' : 'text-text-secondary hover:text-text-main'
              )}
            >
              <GitCompare size={11} />
              Changes
            </button>
          </div>
        )}
      </div>

      {/* Content area */}
      <div className="min-h-0 flex-1 overflow-hidden">
        {isImage && imageSrc ? (
          <div className="flex h-full items-center justify-center p-4">
            <img src={imageSrc} alt={relativePath || filePath} className="max-h-full max-w-full object-contain" />
          </div>
        ) : view === 'diff' && isChanged ? (
          <div className="h-full overflow-auto p-3">
            {headError && <div className="mb-3 text-xs text-active-text">{headError}</div>}
            <div className="overflow-hidden rounded-xl border border-border bg-surface font-mono text-xs leading-6">
              {diffRows.length === 0 ? (
                <div className="p-4 text-text-secondary">No line differences detected.</div>
              ) : (
                diffRows.map((row, index) => (
                  <div
                    key={`${row.kind}-${index}`}
                    className={clsx(
                      'whitespace-pre-wrap px-3 py-0.5',
                      row.kind === 'add' && 'bg-success/15 text-success',
                      row.kind === 'remove' && 'bg-danger/15 text-danger',
                      row.kind === 'context' && 'text-text-muted'
                    )}
                  >
                    {row.kind === 'add' ? '+ ' : row.kind === 'remove' ? '- ' : '  '}
                    {row.text || ' '}
                  </div>
                ))
              )}
            </div>
          </div>
        ) : (
          <CodeEditor
            filePath={filePath}
            content={content}
            isDark={isDark}
            onSave={handleSave}
            onChange={handleChange}
          />
        )}
      </div>
    </div>
  )
}
