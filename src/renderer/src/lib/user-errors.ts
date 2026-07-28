const DEV_ERROR_PATTERNS = [
  /error invoking remote method/i,
  /socket hang up/i,
  /econnreset/i,
  /econnrefused/i,
  /enotfound/i,
  /econnaborted/i,
  /etimedout/i,
  /^network error$/i,
  /axios/i,
  /unexpected token/i,
  /cannot read propert/i,
  /undefined is not/i
]

export function isDeveloperError(message: string): boolean {
  const trimmed = message.trim()
  if (!trimmed) return false
  return DEV_ERROR_PATTERNS.some((pattern) => pattern.test(trimmed))
}

export function humanizeError(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  const message =
    error instanceof Error ? error.message : typeof error === 'string' ? error : ''
  const lower = message.toLowerCase()

  if (!message.trim()) return fallback

  if (lower.includes('authentication expired') || lower.includes('not authenticated')) {
    return 'Your session expired. Please sign in again.'
  }
  if (lower.includes('backend session expired')) {
    return 'Your FocusFork session expired. Open Settings and sign in again.'
  }
  if (lower.includes('quota exhausted') || lower.includes('quota_exceeded')) {
    return 'Your monthly AI quota is used up. Open Usage & Billing to upgrade or buy credits.'
  }
  if (lower.includes('account suspended') || lower.includes('past_due') || lower.includes('unpaid')) {
    return 'Your account is paused until billing is resolved. Open Usage & Billing to continue.'
  }
  if (lower.includes('rate limit')) {
    return 'Too many requests. Please wait a few minutes and try again.'
  }
  if (lower.includes('socket hang up') || lower.includes('econnreset')) {
    return 'The connection dropped before the request finished. Check your network and try again.'
  }
  if (lower.includes('econnaborted') || lower.includes('timeout') || lower.includes('timed out')) {
    return 'The request took too long. Please try again.'
  }
  if (lower.includes('enotfound') || lower.includes('econnrefused')) {
    return 'Could not reach FocusFork services. Make sure you are online and the backend is running.'
  }
  if (lower.includes('invalid query')) {
    return 'Discover search could not start. Quit and reopen the app, then try again.'
  }
  if (isDeveloperError(message)) {
    return fallback
  }

  return message
}
