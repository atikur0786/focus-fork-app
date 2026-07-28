import { isDeveloperError } from './user-errors'

export type AiErrorCode =
  | 'QUOTA_EXCEEDED'
  | 'AUTH_FAILED'
  | 'MODEL_UNAVAILABLE'
  | 'RATE_LIMITED'
  | 'NETWORK_ERROR'
  | 'INVALID_REQUEST'
  | 'ACCOUNT_SUSPENDED'

export interface AiChatResult {
  text?: string
  model?: string
  fallbackUsed?: boolean
  errorCode?: AiErrorCode
  message?: string
  debugHint?: string
}

export interface AiErrorContext {
  modelId?: string
  modelLabel?: string
}

const TECHNICAL_MESSAGE_PATTERNS = [
  /http\s*\d{3}/i,
  /status code/i,
  /backend\s*http/i,
  /payloadchars/i,
  /messagecount/i,
  /timeoutms/i,
  /\/v1\//i,
  /openrouter_api/i,
  /request failed with status/i,
  /error invoking remote method/i,
  /axios/i,
  /econn/i
]

export function isTechnicalUserMessage(message: string): boolean {
  const trimmed = message.trim()
  if (!trimmed) return false
  if (isDeveloperError(trimmed)) return true
  return TECHNICAL_MESSAGE_PATTERNS.some((pattern) => pattern.test(trimmed))
}

export function isAiFailure(result: AiChatResult | null | undefined): result is AiChatResult & { errorCode: AiErrorCode } {
  return !!result?.errorCode || (!result?.text && !!result?.message)
}

function modelDisplayName(context?: AiErrorContext): string {
  if (context?.modelLabel?.trim()) return context.modelLabel.trim()
  if (context?.modelId?.trim()) {
    const id = context.modelId.trim()
    const short = id.split('/').pop()?.replace(':free', ' (Free)') || id
    return short.replace(/-/g, ' ')
  }
  return 'this model'
}

export function aiErrorTitle(code?: AiErrorCode): string {
  switch (code) {
    case 'QUOTA_EXCEEDED':
      return 'Monthly AI limit reached'
    case 'ACCOUNT_SUSPENDED':
      return 'Account paused'
    case 'RATE_LIMITED':
      return 'Slow down a moment'
    case 'MODEL_UNAVAILABLE':
      return 'Try a different model'
    case 'AUTH_FAILED':
      return 'Sign-in needed'
    case 'NETWORK_ERROR':
      return 'Connection issue'
    case 'INVALID_REQUEST':
      return 'Message too large or unclear'
    default:
      return 'Could not get a reply'
  }
}

export function aiErrorActionLabel(code?: AiErrorCode): string | null {
  switch (code) {
    case 'QUOTA_EXCEEDED':
      return 'View usage & upgrade'
    case 'ACCOUNT_SUSPENDED':
      return 'Resolve billing'
    case 'MODEL_UNAVAILABLE':
    case 'RATE_LIMITED':
      return 'Change model'
    case 'AUTH_FAILED':
      return 'Reconnect'
    default:
      return null
  }
}

export function aiErrorUserMessage(code?: AiErrorCode, context?: AiErrorContext): string {
  const modelName = modelDisplayName(context)

  switch (code) {
    case 'QUOTA_EXCEEDED':
      return 'You have used your monthly AI allowance on FocusFork. Upgrade your plan or buy credits in Usage & Billing, or wait until your quota resets.'
    case 'ACCOUNT_SUSPENDED':
      return 'Your account is paused until an billing issue is resolved. Open Usage & Billing to continue.'
    case 'AUTH_FAILED':
      return 'FocusFork lost its connection to the server. Click Reconnect below or sign in again from Settings, then retry your message.'
    case 'MODEL_UNAVAILABLE':
      return `“${modelName}” is not available on your plan or is busy on the AI provider. Open the model menu and pick another option with “Free · no API cost” (for example Llama 3.3 70B or DeepSeek R1).`
    case 'RATE_LIMITED':
      if (context?.modelId?.includes(':free')) {
        return 'Free AI models are under heavy load on OpenRouter. FocusFork tries several free models automatically when one is busy. Wait 1–2 minutes and tap Retry, or upgrade to Pro and pick a paid model for more reliable responses.'
      }
      return 'You are sending messages faster than FocusFork allows. Wait about a minute, then retry. Upgrading your plan raises this limit.'
    case 'INVALID_REQUEST':
      return 'The AI could not process that message. Try a shorter prompt, remove some attachments, or switch to a different model.'
    case 'NETWORK_ERROR':
      return 'FocusFork could not reach the AI service. Check your internet connection, confirm the backend is running, then retry.'
    default:
      return 'Something went wrong while getting a reply. Please try again in a moment.'
  }
}

export function aiErrorTips(code?: AiErrorCode, _context?: AiErrorContext): string[] {
  switch (code) {
    case 'RATE_LIMITED':
      return [
        'FocusFork already tries alternate free models in the background when one is busy.',
        'Wait 60–90 seconds, then tap Retry.',
        'On Pro or Max, choose a paid model (not labeled “Free · no API cost”) for higher limits.'
      ]
    case 'MODEL_UNAVAILABLE':
      return [
        'Use the model picker (top right of chat) and choose a model labeled “Free · no API cost”.',
        'Favorite models you use daily with the star icon.'
      ]
    case 'QUOTA_EXCEEDED':
      return ['Open Usage & Billing to see your usage and upgrade options.']
    case 'AUTH_FAILED':
      return ['Use Reconnect below, or sign out and sign in again from Settings.']
    default:
      return []
  }
}

export function isRetriableAiError(code?: AiErrorCode): boolean {
  return (
    code === 'NETWORK_ERROR' ||
    code === 'RATE_LIMITED' ||
    code === 'INVALID_REQUEST' ||
    code === 'AUTH_FAILED' ||
    code === 'MODEL_UNAVAILABLE' ||
    !code
  )
}

export function humanizeAiChatResult(
  result: AiChatResult,
  fallback = 'We could not get a reply. Please try again.',
  context?: AiErrorContext
): string {
  if (result.errorCode) {
    return aiErrorUserMessage(result.errorCode, context)
  }
  if (result.message && !isTechnicalUserMessage(result.message)) {
    return result.message
  }
  return fallback
}

export class AnalyzeIssueError extends Error {
  errorCode?: AiErrorCode

  constructor(message: string, errorCode?: AiErrorCode) {
    super(message)
    this.name = 'AnalyzeIssueError'
    this.errorCode = errorCode
  }
}
