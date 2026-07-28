import { useMemo } from 'react'
import clsx from 'clsx'
import { buildLineDiff, countDiffStats } from '../../lib/line-diff'

export function DiffBlock({
  before,
  after,
  maxRows = 80,
  compact = false
}: {
  before: string
  after: string
  maxRows?: number
  compact?: boolean
}): React.JSX.Element {
  const rows = useMemo(() => buildLineDiff(before, after), [before, after])
  const stats = useMemo(() => countDiffStats(rows), [rows])
  const previewRows = rows.slice(0, maxRows)
  const isLarge = rows.length > maxRows

  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-[10px] text-text-muted">
        <span className="text-success">+{stats.added}</span>
        <span className="text-danger">-{stats.removed}</span>
        {isLarge && <span>· showing first {maxRows} diff lines</span>}
      </div>
      <div
        className={clsx(
          'overflow-hidden rounded-lg border border-border bg-[#0d0d10] font-mono leading-5',
          compact ? 'text-[10px]' : 'text-[11px]'
        )}
      >
        {previewRows.map((row, index) => (
          <div
            key={`${row.kind}-${index}`}
            className={clsx(
              'whitespace-pre-wrap px-2 py-0.5',
              row.kind === 'add' && 'bg-success/15 text-success',
              row.kind === 'remove' && 'bg-danger/15 text-danger',
              row.kind === 'context' && 'text-zinc-500'
            )}
          >
            {row.kind === 'add' ? '+ ' : row.kind === 'remove' ? '- ' : '  '}
            {row.text || ' '}
          </div>
        ))}
        {rows.length === 0 && <div className="px-2 py-2 text-zinc-500">No line differences (new or empty file).</div>}
      </div>
    </div>
  )
}

export function isLargeDiff(before: string, after: string, threshold = 100): boolean {
  return countDiffStats(buildLineDiff(before, after)).added + countDiffStats(buildLineDiff(before, after)).removed > threshold
}
