export interface AiChatMessageInput {
  role: string
  content: string
}

export const AI_CHAT_MAX_MESSAGES = 14
const MAX_MESSAGES = AI_CHAT_MAX_MESSAGES
const MAX_MESSAGE_CHARS = 6000
const MAX_CONTEXT_CHARS = 72000

/** Merge consecutive same-role turns so providers (e.g. Gemini) accept the payload. */
export function normalizeChatRoles(messages: AiChatMessageInput[]): AiChatMessageInput[] {
  const normalized: AiChatMessageInput[] = []

  for (const message of messages) {
    const role = message.role === 'model' ? 'assistant' : message.role
    const content = message.content.trim()
    if (!content) continue

    const previous = normalized[normalized.length - 1]
    if (previous && previous.role === role) {
      previous.content = `${previous.content}\n\n${content}`
      continue
    }

    normalized.push({ role, content })
  }

  return normalized
}

export function prepareAiChatPayload(
  messages: AiChatMessageInput[],
  context: string
): { messages: AiChatMessageInput[]; context: string; stats: { messageCount: number; contextChars: number; totalChars: number } } {
  const trimmedMessages = normalizeChatRoles(
    messages.slice(-MAX_MESSAGES).map((message) => ({
      role: message.role,
      content:
        message.content.length > MAX_MESSAGE_CHARS
          ? `${message.content.slice(0, MAX_MESSAGE_CHARS)}\n\n...[message truncated for AI request]`
          : message.content
    }))
  )

  const trimmedContext =
    context.length > MAX_CONTEXT_CHARS
      ? `${context.slice(0, MAX_CONTEXT_CHARS)}\n\n...[context truncated for AI request]`
      : context

  const totalChars =
    trimmedContext.length + trimmedMessages.reduce((sum, message) => sum + message.content.length, 0)

  return {
    messages: trimmedMessages,
    context: trimmedContext,
    stats: {
      messageCount: trimmedMessages.length,
      contextChars: trimmedContext.length,
      totalChars
    }
  }
}
