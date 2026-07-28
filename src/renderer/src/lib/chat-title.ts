const MAX_TITLE_LENGTH = 52

export function deriveChatTitleFromText(text: string): string {
  const line = text.trim().split('\n')[0]?.replace(/\s+/g, ' ').trim() || ''
  if (!line) return 'New chat'
  if (line.length <= MAX_TITLE_LENGTH) return line
  return `${line.slice(0, MAX_TITLE_LENGTH).trim()}…`
}

export function sanitizeChatTitle(raw: string): string {
  const cleaned = raw
    .trim()
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!cleaned) return 'New chat'
  if (cleaned.length <= MAX_TITLE_LENGTH) return cleaned
  return `${cleaned.slice(0, MAX_TITLE_LENGTH).trim()}…`
}

export async function generateChatTitleWithAI(
  userMessage: string,
  assistantMessage: string,
  model: string
): Promise<string | null> {
  try {
    const response = await window.api.platform.aiChat({
      messages: [
        {
          role: 'user',
          content: [
            'Write a short conversation title (3–6 words, sentence case, no quotes).',
            `User: ${userMessage.slice(0, 400)}`,
            `Assistant: ${assistantMessage.slice(0, 400)}`
          ].join('\n')
        }
      ],
      context: 'You generate concise chat titles. Reply with only the title text.',
      model
    })
    if (response?.text?.trim()) {
      return sanitizeChatTitle(response.text)
    }
  } catch {
    // Fall back to derived title.
  }
  return null
}
