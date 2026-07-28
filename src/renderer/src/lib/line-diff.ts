export type DiffRow = {
  kind: 'context' | 'add' | 'remove'
  text: string
}

export function buildLineDiff(before: string, after: string): DiffRow[] {
  const beforeLines = before.split('\n')
  const afterLines = after.split('\n')
  const rows: DiffRow[] = []
  const maxLen = Math.max(beforeLines.length, afterLines.length)

  for (let index = 0; index < maxLen; index += 1) {
    const left = beforeLines[index]
    const right = afterLines[index]
    if (left === right) {
      if (left !== undefined) rows.push({ kind: 'context', text: left })
      continue
    }
    if (left !== undefined) rows.push({ kind: 'remove', text: left })
    if (right !== undefined) rows.push({ kind: 'add', text: right })
  }

  return rows
}

export function countDiffStats(rows: DiffRow[]): { added: number; removed: number } {
  return rows.reduce(
    (stats, row) => {
      if (row.kind === 'add') stats.added += 1
      if (row.kind === 'remove') stats.removed += 1
      return stats
    },
    { added: 0, removed: 0 }
  )
}
