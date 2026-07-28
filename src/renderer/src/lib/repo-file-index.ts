const IGNORED_PATH_SEGMENTS = new Set([
  'node_modules',
  '.git',
  '.next',
  '.nuxt',
  '.turbo',
  '.cache',
  '.vercel',
  '.output',
  '.agent',
  'dist',
  'build',
  'out',
  'coverage',
  '.pnpm-store',
  '__pycache__',
  '.venv',
  'venv',
  '.idea',
  '.vscode'
])

const SOURCE_PATH_PATTERNS: RegExp[] = [
  /^src\//,
  /^app\//,
  /^components\//,
  /^renderer\//,
  /^features\//,
  /^lib\//,
  /^pages\//,
  /^hooks\//,
  /^services\//,
  /^utils\//,
  /^types\//,
  /^agents\//,
  /^store\//,
  /^api\//,
  /^routes\//,
  /^views\//,
  /^modules\//,
  /^packages\/[^/]+\/src\//,
  /^sdk\//
]

const MAX_INDEX_PATHS = 400
const MAX_CONTEXT_PATHS = 120

export function shouldIgnoreRepoPath(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, '/').replace(/^\.\//, '')
  const segments = normalized.split('/')
  return segments.some((segment) => IGNORED_PATH_SEGMENTS.has(segment))
}

export function rankRepoFile(relativePath: string): number {
  const normalized = relativePath.replace(/\\/g, '/').replace(/^\.\//, '')
  if (shouldIgnoreRepoPath(normalized)) return 10_000

  for (let index = 0; index < SOURCE_PATH_PATTERNS.length; index += 1) {
    if (SOURCE_PATH_PATTERNS[index].test(normalized)) return index
  }

  const firstSegment = normalized.split('/')[0] || ''
  if (firstSegment.startsWith('.')) return 5000
  if (firstSegment === 'public' || firstSegment === 'assets' || firstSegment === 'static') return 4000
  if (firstSegment === 'docs' || firstSegment === 'test' || firstSegment === 'tests') return 3000

  return 2000
}

export function sortRepoFiles(relativePaths: string[]): string[] {
  return [...relativePaths].sort((left, right) => {
    const rankDiff = rankRepoFile(left) - rankRepoFile(right)
    if (rankDiff !== 0) return rankDiff
    return left.localeCompare(right)
  })
}

export function toAbsoluteRepoPath(repoRootPath: string, relativePath: string): string {
  const root = repoRootPath.replace(/\/$/, '')
  const rel = relativePath.replace(/\\/g, '/').replace(/^\.\//, '')
  return `${root}/${rel}`
}

export function toRelativeRepoPath(repoRootPath: string, absolutePath: string): string {
  const root = repoRootPath.replace(/\/$/, '')
  if (absolutePath === root) return '.'
  if (absolutePath.startsWith(`${root}/`)) return absolutePath.slice(root.length + 1)
  return absolutePath.replace(/\\/g, '/')
}

export function prepareRepoFileIndex(repoRootPath: string, absolutePaths: string[]): string[] {
  const relativePaths = absolutePaths
    .map((path) => toRelativeRepoPath(repoRootPath, path))
    .filter((path) => path !== '.' && !shouldIgnoreRepoPath(path))

  return sortRepoFiles([...new Set(relativePaths)])
}

export async function loadRepoRelativePaths(repoRootPath: string): Promise<string[]> {
  try {
    const absolutePaths = await window.api.git.listTrackedFiles(repoRootPath)
    return prepareRepoFileIndex(repoRootPath, absolutePaths).slice(0, MAX_INDEX_PATHS)
  } catch {
    try {
      const absolutePaths = await window.fsAPI.listFiles(repoRootPath)
      return prepareRepoFileIndex(repoRootPath, absolutePaths).slice(0, MAX_INDEX_PATHS)
    } catch {
      return []
    }
  }
}

export function formatRepoPathContext(paths: string[]): string {
  if (paths.length === 0) {
    return 'Repository file index: (unavailable — ask the user to attach the correct file with / or the paperclip).'
  }
  const listed = paths.slice(0, MAX_CONTEXT_PATHS)
  const omitted = paths.length - listed.length
  const lines = listed.map((path) => `- ${path}`).join('\n')
  const suffix = omitted > 0 ? `\n… and ${omitted} more paths (use exact paths from this list).` : ''
  return `Repository file index (paths relative to repo root — use ONLY these exact paths in focusfork-edit blocks):\n${lines}${suffix}`
}

function basename(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/')
  return parts[parts.length - 1] || path
}

/** Resolve a model-guessed path to an existing repo file when possible. */
export function resolveEditPathAgainstIndex(relativePath: string, index: string[]): string {
  const normalized = relativePath.trim().replace(/^\.\//, '').replace(/\\/g, '/')
  if (!normalized) return relativePath
  if (index.includes(normalized)) return normalized

  const lower = normalized.toLowerCase()
  const exactIgnoreCase = index.find((path) => path.toLowerCase() === lower)
  if (exactIgnoreCase) return exactIgnoreCase

  const fileName = basename(normalized)
  const suffixMatches = index.filter((path) => path.toLowerCase().endsWith(`/${lower}`) || path.toLowerCase() === lower)
  if (suffixMatches.length === 1) return suffixMatches[0]

  const baseMatches = index.filter((path) => basename(path).toLowerCase() === fileName.toLowerCase())
  if (baseMatches.length === 1) return baseMatches[0]

  const partialMatches = index.filter(
    (path) =>
      path.toLowerCase().includes(lower) ||
      lower.includes(path.toLowerCase()) ||
      path.toLowerCase().endsWith(`/${fileName.toLowerCase()}`)
  )
  if (partialMatches.length === 1) return partialMatches[0]

  return normalized
}

export function resolveProposedEditsPaths(
  edits: Array<{ relativePath: string; content: string }>,
  index: string[]
): Array<{ relativePath: string; content: string }> {
  return edits.map((edit) => ({
    ...edit,
    relativePath: resolveEditPathAgainstIndex(edit.relativePath, index)
  }))
}
