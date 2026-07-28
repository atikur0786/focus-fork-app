import type { AiErrorCode } from './ai-errors'
import { AI_CHAT_MAX_MESSAGES } from './ai-chat-request'
import { isPersistedAiErrorMessage } from './chat-retry'

export interface ChatLimitMessage {
  role: 'user' | 'model'
  content: string
  isError?: boolean
  errorCode?: AiErrorCode | string
}

export type ComposerNoticeTone = 'info' | 'warning' | 'error'

export interface ComposerNotice {
  tone: ComposerNoticeTone
  message: string
  actionLabel?: string
  action?: 'billing' | 'model' | 'reconnect'
}

export interface ComposerLimitState {
  inputBlocked: boolean
  inputBlockedReason?: string
  notice?: ComposerNotice
}

function latestErrorMessage(messages: ChatLimitMessage[]): ChatLimitMessage | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (isPersistedAiErrorMessage(message)) return message
    if (message.role === 'model') return null
  }
  return null
}

function asAiErrorCode(message: ChatLimitMessage | null): AiErrorCode | undefined {
  if (!message?.errorCode) return undefined
  return message.errorCode as AiErrorCode
}

export interface ComposerLimitOptions {
  /** When true, stale auth errors in chat history do not block the composer. */
  backendConnected?: boolean
}

export function getComposerLimitState(
  messages: ChatLimitMessage[],
  options?: ComposerLimitOptions
): ComposerLimitState {
  const latestError = latestErrorMessage(messages)
  const errorCode = asAiErrorCode(latestError)
  const visibleCount = messages.length
  const payloadCount = Math.min(visibleCount, AI_CHAT_MAX_MESSAGES)

  if (errorCode === 'INVALID_REQUEST') {
    return {
      inputBlocked: false,
      notice: {
        tone: 'warning',
        message:
          'The AI provider rejected this request. Switch to another model (e.g. GPT-4o Mini), shorten the prompt, or retry with fewer attached files.',
        actionLabel: 'Change model above',
        action: 'model'
      }
    }
  }

  if (errorCode === 'AUTH_FAILED' && !options?.backendConnected) {
    return {
      inputBlocked: true,
      inputBlockedReason: 'Backend session expired. Reconnect to continue chatting.',
      notice: {
        tone: 'error',
        message:
          'You are signed into GitHub, but FocusFork lost its backend session. Reconnect to restore AI chat, models, and billing.',
        actionLabel: 'Reconnect backend',
        action: 'reconnect'
      }
    }
  }

  if (errorCode === 'QUOTA_EXCEEDED') {
    return {
      inputBlocked: true,
      inputBlockedReason: 'Monthly AI quota reached. Resolve billing to send more messages.',
      notice: {
        tone: 'error',
        message: 'Your monthly AI quota is used up. Upgrade or buy credits in Usage & Billing.',
        actionLabel: 'Open Usage & Billing',
        action: 'billing'
      }
    }
  }

  if (errorCode === 'ACCOUNT_SUSPENDED') {
    return {
      inputBlocked: true,
      inputBlockedReason: 'Account billing issue. Resolve billing to continue chatting.',
      notice: {
        tone: 'error',
        message: 'Your account is paused until billing is resolved.',
        actionLabel: 'Open Usage & Billing',
        action: 'billing'
      }
    }
  }

  if (errorCode === 'MODEL_UNAVAILABLE') {
    return {
      inputBlocked: false,
      notice: {
        tone: 'warning',
        message:
          'The last request failed for the model that was selected then. Pick Llama 3.3 70B (Free) or another Free · no API cost model above, then retry your message.',
        actionLabel: 'Change model above',
        action: 'model'
      }
    }
  }

  if (errorCode === 'RATE_LIMITED') {
    return {
      inputBlocked: false,
      notice: {
        tone: 'warning',
        message: 'That model is busy or you are sending messages too quickly. Wait a minute, try another free model, then retry.',
        actionLabel: 'Change model',
        action: 'model'
      }
    }
  }

  if (errorCode === 'NETWORK_ERROR') {
    return {
      inputBlocked: false,
      notice: {
        tone: 'warning',
        message:
          visibleCount > AI_CHAT_MAX_MESSAGES
            ? `Connection timed out. FocusFork only sends the latest ${AI_CHAT_MAX_MESSAGES} messages (${payloadCount} sent). Try a smaller model or retry after removing attachments.`
            : 'Connection timed out. Try a smaller/faster model from the selector above, then retry.',
        actionLabel: 'Change model above',
        action: 'model'
      }
    }
  }

  if (visibleCount > AI_CHAT_MAX_MESSAGES) {
    return {
      inputBlocked: false,
      notice: {
        tone: 'info',
        message: `${visibleCount} messages in this session. FocusFork sends only the latest ${AI_CHAT_MAX_MESSAGES} to the AI.`
      }
    }
  }

  return { inputBlocked: false }
}
