export function parseRepoFullName(fullName: string | null | undefined): { owner: string; repo: string } | null {
  if (!fullName?.includes('/')) return null
  const [owner, repo] = fullName.split('/')
  if (!owner || !repo) return null
  return { owner, repo }
}

export function githubRepoHomeUrl(fullName: string): string {
  const parsed = parseRepoFullName(fullName)
  if (!parsed) return 'https://github.com'
  return `https://github.com/${parsed.owner}/${parsed.repo}`
}

export function githubBlobUrl(fullName: string, branch: string, filePath: string): string {
  const parsed = parseRepoFullName(fullName)
  if (!parsed) return githubRepoHomeUrl(fullName)
  const normalizedBranch = branch?.trim() || 'main'
  const normalizedPath = filePath.replace(/^\.\//, '').split('/').map(encodeURIComponent).join('/')
  return `https://github.com/${parsed.owner}/${parsed.repo}/blob/${encodeURIComponent(normalizedBranch)}/${normalizedPath}`
}

export function githubIssueUrl(fullName: string, issueNumber: number): string {
  const parsed = parseRepoFullName(fullName)
  if (!parsed) return githubRepoHomeUrl(fullName)
  return `https://github.com/${parsed.owner}/${parsed.repo}/issues/${issueNumber}`
}

export function githubForkBlobUrl(
  login: string,
  upstreamFullName: string,
  branch: string,
  filePath: string
): string {
  const parsed = parseRepoFullName(upstreamFullName)
  if (!parsed) return `https://github.com/${login}`
  return githubBlobUrl(`${login}/${parsed.repo}`, branch, filePath)
}
