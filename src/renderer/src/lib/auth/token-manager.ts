type StoredUser = {
  login: string
  name?: string
  avatar_url?: string
  html_url?: string
}

type TokenRecord = {
  token: string
  expiresAt: number | null
}

const TOKEN_KEY = 'focusfork.auth.token'
const USER_KEY = 'focusfork.auth.user'

const isBrowser = (): boolean => typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined'

const parseJson = <T,>(value: string | null): T | null => {
  if (!value) return null
  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

const decodeJwtPayload = (token: string): Record<string, unknown> | null => {
  const parts = token.split('.')
  if (parts.length < 2) return null
  try {
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const normalized = payload.padEnd(Math.ceil(payload.length / 4) * 4, '=')
    return JSON.parse(window.atob(normalized)) as Record<string, unknown>
  } catch {
    return null
  }
}

const getExpiryFromToken = (token: string): number | null => {
  if (!isBrowser()) return null
  const payload = decodeJwtPayload(token)
  const exp = payload?.exp
  return typeof exp === 'number' ? exp * 1000 : null
}

export const tokenManager = {
  setToken(token: string, expiresAt?: number | null): void {
    if (!isBrowser()) return
    const resolvedExpiry = typeof expiresAt === 'number' ? expiresAt : getExpiryFromToken(token)
    const record: TokenRecord = {
      token,
      expiresAt: resolvedExpiry
    }
    window.sessionStorage.setItem(TOKEN_KEY, JSON.stringify(record))
  },

  getToken(): string | null {
    if (!isBrowser()) return null
    const record = parseJson<TokenRecord>(window.sessionStorage.getItem(TOKEN_KEY))
    if (!record?.token) return null
    return record.token
  },

  clearToken(): void {
    if (!isBrowser()) return
    window.sessionStorage.removeItem(TOKEN_KEY)
  },

  setUser(user: StoredUser | null): void {
    if (!isBrowser()) return
    if (!user) {
      window.sessionStorage.removeItem(USER_KEY)
      return
    }
    window.sessionStorage.setItem(USER_KEY, JSON.stringify(user))
  },

  getUser(): StoredUser | null {
    if (!isBrowser()) return null
    return parseJson<StoredUser>(window.sessionStorage.getItem(USER_KEY))
  },

  isExpired(skewMs: number = 30_000): boolean {
    if (!isBrowser()) return true
    const record = parseJson<TokenRecord>(window.sessionStorage.getItem(TOKEN_KEY))
    if (!record?.token) return true
    if (!record.expiresAt) return false
    return Date.now() + skewMs >= record.expiresAt
  },

  async refresh(refresher?: () => Promise<{ token: string; expiresAt?: number | null } | null>): Promise<string | null> {
    if (!refresher) return this.getToken()
    const next = await refresher()
    if (!next?.token) {
      this.clearToken()
      return null
    }
    this.setToken(next.token, next.expiresAt)
    return next.token
  },

  async ensureValid(
    refresher?: () => Promise<{ token: string; expiresAt?: number | null } | null>
  ): Promise<string | null> {
    const token = this.getToken()
    if (!token) return this.refresh(refresher)
    if (!this.isExpired()) return token
    return this.refresh(refresher)
  }
}

export type { StoredUser, TokenRecord }
