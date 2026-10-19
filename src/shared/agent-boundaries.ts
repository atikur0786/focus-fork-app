export interface GitHubRequestWarning {
  kind: 'rate-limit' | 'forbidden'
  status: 403 | 429
  retryAt: number | null
  message: string
}

export function githubWarningFromError(error: unknown, now = Date.now()): GitHubRequestWarning | null {
  const value = error as { status?: number; message?: string; response?: { status?: number; headers?: Record<string, unknown>; data?: { message?: string } } } | null
  const status = value?.status ?? value?.response?.status
  if (status !== 403 && status !== 429) return null
  const headers = Object.fromEntries(Object.entries(value?.response?.headers || {}).map(([key, item]) => [key.toLowerCase(), String(item)]))
  const rateLimited = status === 429 || headers['x-ratelimit-remaining'] === '0' ||
    Boolean(headers['retry-after']) || /rate limit|secondary rate|abuse detection/i.test(value?.response?.data?.message || value?.message || '')
  if (!rateLimited) {
    return { kind: 'forbidden', status, retryAt: null, message: 'GitHub denied this request. Check your token scopes and repository permissions, then retry.' }
  }
  const reset = Number(headers['x-ratelimit-reset']) * 1000
  const retry = headers['retry-after']
  const retryTime = retry ? (/^\d+(?:\.\d+)?$/.test(retry) ? now + Number(retry) * 1000 : Date.parse(retry)) : NaN
  const candidates = [reset, retryTime].filter((time) => Number.isFinite(time) && time > now)
  const retryAt = candidates.length ? Math.max(...candidates) : null
  return {
    kind: 'rate-limit', status, retryAt,
    message: retryAt
      ? `GitHub rate limit reached. Retry in ${Math.ceil((retryAt - now) / 1000)} seconds. Your local work is saved.`
      : 'GitHub rate limit reached. GitHub did not provide a reset time. Wait before retrying; your local work is saved.'
  }
}

export interface BoundedChatMessage { role: string; content: string }
export const AI_INPUT_MAX_CHARS = 64000

/** Roughly four characters/token, with framing overhead. Not a model tokenizer. */
export function boundAIInput(messages: unknown, context: unknown, maxChars = AI_INPUT_MAX_CHARS) {
  const safeContext = typeof context === 'string' ? context : ''
  const valid: BoundedChatMessage[] = Array.isArray(messages)
    ? messages.filter((item): item is BoundedChatMessage => Boolean(item && typeof item.role === 'string' && typeof item.content === 'string' && item.content.trim()))
        .map(({ role, content }) => ({ role, content }))
    : []
  if (!valid.length) throw new Error('AI request has no valid messages. Enter a message and retry.')
  const size = () => safeContext.length + valid.reduce((sum, item) => sum + item.content.length + 64, 0)
  let droppedMessages = 0
  // Historical conversation/comments are expendable; issue text, the active
  // file tree, and the latest request are not. Never silently slice context.
  while (size() > maxChars && valid.length > 1) {
    valid.shift()
    droppedMessages += 1
  }
  if (size() > maxChars) {
    throw new Error('AI context is too large even after removing historical messages. The issue description, file tree and latest request were preserved. Reduce attached files or open tabs and retry.')
  }
  return { messages: valid, context: safeContext, droppedMessages, estimatedTokens: Math.ceil(size() / 4) }
}
