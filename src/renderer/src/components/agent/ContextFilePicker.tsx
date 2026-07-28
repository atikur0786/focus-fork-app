import { useEffect, useMemo, useState } from 'react'
import { Check, FileCode2, FolderOpen, Search, X } from 'lucide-react'
import { isLikelyTextFile } from '../../lib/chat-attachments'
import { prepareRepoFileIndex, toAbsoluteRepoPath } from '../../lib/repo-file-index'

interface ContextFilePickerProps {
  isOpen: boolean
  repoRootPath: string
  selectedPaths: string[]
  onClose: () => void
  onConfirm: (absolutePaths: string[]) => void
}

const MAX_VISIBLE = 500

function groupLabel(relativePath: string): string {
  const segment = relativePath.split('/')[0]
  if (!segment) return 'Repository'
  if (['src', 'app', 'components', 'lib', 'pages', 'features', 'renderer'].includes(segment)) {
    return segment
  }
  if (segment.startsWith('.')) return 'Config & metadata'
  return segment
}

export function ContextFilePicker({
  isOpen,
  repoRootPath,
  selectedPaths,
  onClose,
  onConfirm
}: ContextFilePickerProps): React.JSX.Element | null {
  const [query, setQuery] = useState('')
  const [indexedPaths, setIndexedPaths] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [picked, setPicked] = useState<string[]>(selectedPaths)

  useEffect(() => {
    if (!isOpen) return
    setPicked(selectedPaths)
    setQuery('')
    setLoadError(null)
  }, [isOpen, selectedPaths])

  useEffect(() => {
    if (!isOpen || !repoRootPath) return
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setLoadError(null)
      try {
        let absolutePaths: string[] = []
        try {
          absolutePaths = await window.api.git.listTrackedFiles(repoRootPath)
        } catch {
          absolutePaths = await window.fsAPI.listFiles(repoRootPath)
        }
        const relativePaths = prepareRepoFileIndex(repoRootPath, absolutePaths).filter((path) =>
          isLikelyTextFile(path)
        )
        if (!cancelled) {
          setIndexedPaths(relativePaths)
          if (relativePaths.length === 0) {
            setLoadError('No attachable source files found in this repository.')
          }
        }
      } catch {
        if (!cancelled) {
          setIndexedPaths([])
          setLoadError('Could not load repository files.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [isOpen, repoRootPath])

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    const candidates = normalized
      ? indexedPaths.filter((path) => path.toLowerCase().includes(normalized))
      : indexedPaths
    return candidates.slice(0, MAX_VISIBLE)
  }, [indexedPaths, query])

  const grouped = useMemo(() => {
    const groups = new Map<string, string[]>()
    for (const path of filtered) {
      const label = groupLabel(path)
      const bucket = groups.get(label) || []
      bucket.push(path)
      groups.set(label, bucket)
    }
    return [...groups.entries()]
  }, [filtered])

  if (!isOpen) return null

  const togglePath = (relativePath: string) => {
    const absolutePath = toAbsoluteRepoPath(repoRootPath, relativePath)
    setPicked((prev) =>
      prev.includes(absolutePath) ? prev.filter((item) => item !== absolutePath) : [...prev, absolutePath]
    )
  }

  const isSelected = (relativePath: string) => picked.includes(toAbsoluteRepoPath(repoRootPath, relativePath))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-4 backdrop-blur-[1px]" data-testid="context-file-picker">
      <div className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-lg">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <div className="text-sm font-semibold text-text-main">Add repository context</div>
            <div className="text-xs text-text-secondary">
              Source files from git (ignores build output like .next and node_modules)
            </div>
          </div>
          <button type="button" data-testid="context-file-picker-close" onClick={onClose} className="btn-ghost rounded-lg p-2">
            <X size={16} />
          </button>
        </div>

        <div className="border-b border-border px-4 py-3">
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              data-testid="context-file-picker-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search src, components, lib, pages…"
              className="input-field pl-9"
              autoFocus
            />
          </div>
          {!loading && indexedPaths.length > 0 && (
            <div className="mt-2 text-[11px] text-text-muted">
              {filtered.length} of {indexedPaths.length} source files
              {filtered.length >= MAX_VISIBLE ? ` · showing first ${MAX_VISIBLE}` : ''}
            </div>
          )}
        </div>

        <div className="min-h-[280px] flex-1 overflow-y-auto px-2 py-2">
          {loading && <div className="px-3 py-6 text-sm text-text-secondary">Loading source files from repository…</div>}
          {!loading && loadError && <div className="px-3 py-6 text-sm text-text-secondary">{loadError}</div>}
          {!loading &&
            grouped.map(([label, paths]) => (
              <div key={label} className="mb-3">
                <div className="sticky top-0 z-10 bg-surface/95 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-muted backdrop-blur-sm">
                  {label}
                </div>
                <div className="space-y-1">
                  {paths.map((relativePath) => {
                    const selected = isSelected(relativePath)
                    return (
                      <button
                        key={relativePath}
                        type="button"
                        data-testid="context-file-picker-item"
                        onClick={() => togglePath(relativePath)}
                        className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors ${
                          selected ? 'bg-primary/8 border border-primary/20' : 'hover:bg-surface-hover border border-transparent'
                        }`}
                      >
                        <FileCode2 size={14} className={selected ? 'text-primary' : 'text-text-muted'} />
                        <span className="min-w-0 flex-1 truncate font-mono text-xs text-text-main">{relativePath}</span>
                        {selected && <Check size={14} className="shrink-0 text-primary" />}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
        </div>

        <div className="flex items-center justify-between border-t border-border px-4 py-3">
          <div className="inline-flex items-center gap-1.5 text-xs text-text-secondary">
            <FolderOpen size={14} />
            {picked.length} selected
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="btn-secondary px-3 py-2 text-xs">
              Cancel
            </button>
            <button
              type="button"
              data-testid="context-file-picker-confirm"
              onClick={() => onConfirm(picked)}
              disabled={picked.length === 0}
              className="btn-primary px-3 py-2 text-xs disabled:opacity-60"
            >
              Add to message
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
