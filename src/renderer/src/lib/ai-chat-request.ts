import { boundAIInput } from '../../../shared/agent-boundaries'

export interface AiChatMessageInput {
  role: string
  content: string
}

export const AI_CHAT_MAX_MESSAGES = 14

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
  const bounded = boundAIInput(messages.slice(-AI_CHAT_MAX_MESSAGES), context)
  const trimmedMessages = normalizeChatRoles(bounded.messages)
  const trimmedContext = bounded.context

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
