export function buildWorkspaceSessionKey(input: {
  issueNumber?: number | null
  repoFullName?: string | null
  repoPath?: string | null
}): string {
  const repo = (input.repoFullName || input.repoPath || 'workspace').trim()
  if (input.issueNumber && Number.isFinite(input.issueNumber)) {
    return `${repo}#issue-${input.issueNumber}`
  }
  return repo
}

/** True when a persisted chat key belongs to the active workspace repo/issue. */
export function sessionMatchesWorkspace(
  sessionKey: string,
  input: {
    issueNumber?: number | null
    repoFullName?: string | null
    repoPath?: string | null
  }
): boolean {
  const key = sessionKey.trim()
  if (!key) return false

  const repoFullName = input.repoFullName?.trim()
  const repoPath = input.repoPath?.trim().replace(/\\/g, '/')
  const repoBase = repoFullName || repoPath
  if (!repoBase) return false

  const pathBasename = repoPath?.split('/').filter(Boolean).pop()
  const candidates = new Set<string>([repoBase])
  if (repoFullName) candidates.add(repoFullName)
  if (repoPath) candidates.add(repoPath)
  if (pathBasename) candidates.add(pathBasename)

  for (const candidate of candidates) {
    if (key === candidate || key.startsWith(`${candidate}#`)) return true
  }

  if (input.issueNumber && Number.isFinite(input.issueNumber) && repoFullName) {
    const issueKey = `${repoFullName}#issue-${input.issueNumber}`
    if (key === issueKey) return true
  }

  return false
}

export function buildWorkspaceSessionLabel(input: {
  issueNumber?: number | null
  issueTitle?: string | null
  repoFullName?: string | null
  repoPath?: string | null
}): string {
  if (input.issueNumber) {
    const title = input.issueTitle?.trim()
    return title ? `#${input.issueNumber} ${title}` : `Issue #${input.issueNumber}`
  }
  const repo = input.repoFullName || input.repoPath
  return repo ? repo.split('/').pop() || repo : 'Workspace'
}

export const FOCUSFORK_THINKING_LABEL = 'FocusFork is thinking…'

export const GLOBAL_CHAT_PREFIX = 'global-chat:'

export function buildGlobalChatSessionKey(id?: string): string {
  const suffix = id?.trim() || crypto.randomUUID()
  return `${GLOBAL_CHAT_PREFIX}${suffix}`
}

export function isGlobalChatSessionKey(sessionKey: string): boolean {
  return sessionKey.trim().startsWith(GLOBAL_CHAT_PREFIX)
}

export function listGlobalChatSessionKeys(keys: string[]): string[] {
  return keys.filter(isGlobalChatSessionKey)
}
