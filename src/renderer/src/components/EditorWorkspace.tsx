import { Code2, SquareArrowOutUpRight } from 'lucide-react'
import type { ReactNode } from 'react'

interface EditorWorkspaceProps {
  repoPath: string | null
  selectedFilePath?: string | null
  preferredEditorId?: string | null
  title?: string
  subtitle?: string
  children?: ReactNode
}

export function EditorWorkspace({
  repoPath,
  selectedFilePath,
  preferredEditorId,
  title = 'Companion IDE Workspace',
  subtitle = 'FocusFork can apply AI-proposed edits here with your approval. You can also open files in your local IDE for manual editing, then return for commit, push, and PR workflow.',
  children
}: EditorWorkspaceProps): React.JSX.Element {
  const targetPath = selectedFilePath || repoPath

  const handleOpen = async () => {
    if (!targetPath) return
    await window.vscodeAPI.open(targetPath, preferredEditorId || undefined)
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-border bg-surface/80 px-5 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="section-kicker">External editor</div>
            <div className="mt-2 text-xl font-semibold tracking-tight text-text-main">{title}</div>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-text-secondary">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={() => void handleOpen()}
            disabled={!targetPath}
            className="btn-primary shrink-0 disabled:opacity-60"
          >
            <SquareArrowOutUpRight size={15} />
            Open in IDE
          </button>
        </div>
        <div className="mt-4 inline-flex max-w-full items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-xs text-text-secondary">
          <Code2 className="h-3.5 w-3.5 shrink-0 text-text-muted" />
          <span className="truncate font-mono">{targetPath || 'Select a repo or file first'}</span>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-5 page-enter">{children}</div>
    </div>
  )
}
