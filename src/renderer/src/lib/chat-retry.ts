export interface RetryableChatMessage {
  role: 'user' | 'model'
  content: string
  isError?: boolean
  retryUserMessageIndex?: number
}

export function isPersistedAiErrorMessage(message: {
  role: 'user' | 'model'
  content: string
  isError?: boolean
}): boolean {
  return Boolean(
    message.isError ||
      (message.role === 'model' &&
        /lost connection|timed out|could not reach|too many ai requests|network/i.test(message.content))
  )
}

export function resolveRetryUserMessageIndex<T extends RetryableChatMessage>(
  messages: T[],
  errorIndex: number
): number | null {
  const message = messages[errorIndex]
  if (!isPersistedAiErrorMessage(message)) return null

  const storedIndex = message.retryUserMessageIndex
  if (storedIndex !== undefined) {
    if (storedIndex >= 0 && storedIndex < messages.length && messages[storedIndex]?.role === 'user') {
      return storedIndex
    }
  }

  for (let cursor = errorIndex - 1; cursor >= 0; cursor -= 1) {
    if (messages[cursor]?.role === 'user') return cursor
  }
  return null
}

export function isAuthFailedErrorMessage(message: {
  role: 'user' | 'model'
  content: string
  isError?: boolean
  errorCode?: string
}): boolean {
  if (message.role !== 'model') return false
  if (message.errorCode === 'AUTH_FAILED') return true
  return Boolean(
    message.isError &&
      /backend session|sign in to focusfork|reconnect backend|auth_failed/i.test(message.content)
  )
}

export function stripAuthFailedErrors<T extends RetryableChatMessage>(messages: T[]): T[] {
  return messages.filter((message) => !isAuthFailedErrorMessage(message))
}

export function buildRetryConversation<T extends RetryableChatMessage>(
  messages: T[],
  userMessageIndex: number
): T[] | null {
  const userMessage = messages[userMessageIndex]
  if (!userMessage || userMessage.role !== 'user') return null

  let conversation = messages.slice(0, userMessageIndex + 1)
  while (conversation.length > 0 && isPersistedAiErrorMessage(conversation[conversation.length - 1]!)) {
    conversation = conversation.slice(0, -1)
  }

  if (conversation.length === 0 || conversation[conversation.length - 1]?.role !== 'user') {
    return null
  }

  return conversation
}
