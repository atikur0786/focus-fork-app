import { create } from 'zustand'
import { humanizeError } from '../lib/user-errors'

interface User {
  login: string
  name: string
  avatar_url: string
  html_url: string
}

type AuthMode = 'unauthenticated' | 'authenticated-local' | 'authenticated-backend'

interface AuthState {
  isAuthenticated: boolean
  authMode: AuthMode
  backendConnected: boolean
  backendEnabled: boolean
  hasHydratedAuth: boolean
  isLoggingIn: boolean
  isLoading: boolean
  user: User | null
  error: string | null
  checkAuth: () => Promise<void>
  login: () => Promise<void>
  logout: () => Promise<void>
  refreshBackendConnection: () => Promise<boolean>
  applyBackendSession: (payload: { connected: boolean; enabled: boolean }) => void
}

const getPlatformStatus = async () =>
  window.api.platform.status().catch(() => ({ enabled: false, connected: false, backendBaseURL: '' }))

const resolveUserProfile = async () => window.api.github.user()

const deriveAuthMode = (isAuthenticated: boolean, backendConnected: boolean): AuthMode => {
  if (!isAuthenticated) return 'unauthenticated'
  return backendConnected ? 'authenticated-backend' : 'authenticated-local'
}

let refreshBackendInFlight: Promise<boolean> | null = null

export const useAuthStore = create<AuthState>((set, get) => ({
  isAuthenticated: false,
  authMode: 'unauthenticated',
  backendConnected: false,
  backendEnabled: false,
  hasHydratedAuth: false,
  isLoggingIn: false,
  isLoading: false,
  user: null,
  error: null,
  applyBackendSession: ({ connected, enabled }) => {
    const { isAuthenticated, user } = get()
    set({
      backendConnected: connected,
      backendEnabled: enabled,
      authMode: deriveAuthMode(isAuthenticated, connected)
    })
    if (!user && isAuthenticated) {
      void resolveUserProfile()
        .then((profile) => set({ user: profile }))
        .catch(() => undefined)
    }
  },
  refreshBackendConnection: async () => {
    if (refreshBackendInFlight) {
      return refreshBackendInFlight
    }

    refreshBackendInFlight = (async () => {
      const connected = await window.api.platform.reconnectBackend().catch(() => false)
      const platform = await getPlatformStatus()
      const backendConnected = !!platform?.enabled && !!platform?.connected
      set({
        backendConnected,
        backendEnabled: !!platform?.enabled,
        authMode: deriveAuthMode(get().isAuthenticated, backendConnected)
      })
      if (get().isAuthenticated && !get().user) {
        try {
          const user = await resolveUserProfile()
          set({ user })
        } catch {
          // Keep existing user state.
        }
      }
      if (backendConnected) {
        void import('../lib/chat-sync').then(({ syncChatHistoryFromBackend }) => syncChatHistoryFromBackend())
      }
      return connected
    })()

    try {
      return await refreshBackendInFlight
    } finally {
      refreshBackendInFlight = null
    }
  },
  checkAuth: async () => {
    try {
      const isAuth = await window.api.auth.check()
      const platform = await getPlatformStatus()
      const backendConnected = !!platform?.enabled && !!platform?.connected
      const backendEnabled = !!platform?.enabled
      if (isAuth) {
        try {
          const user = await resolveUserProfile()
          set({
            isAuthenticated: true,
            authMode: deriveAuthMode(true, backendConnected),
            backendConnected,
            backendEnabled,
            user,
            error: null
          })
          if (backendConnected) {
            void import('../lib/chat-sync').then(({ syncChatHistoryFromBackend }) => syncChatHistoryFromBackend())
          }
        } catch (e) {
          console.error('Failed to fetch user details', e)
          set({
            isAuthenticated: true,
            authMode: deriveAuthMode(true, backendConnected),
            backendConnected,
            backendEnabled,
            user: null,
            error: null
          })
        }
      } else {
        set({
          isAuthenticated: false,
          authMode: 'unauthenticated',
          backendConnected: false,
          backendEnabled: false,
          user: null,
          error: null
        })
      }
    } catch (error) {
      console.error('Auth check failed', error)
      set({
        isAuthenticated: false,
        authMode: 'unauthenticated',
        backendConnected: false,
        backendEnabled: false,
        user: null,
        error: 'Authentication check failed'
      })
    } finally {
      set({ hasHydratedAuth: true, isLoading: false })
    }
  },
  login: async () => {
    set({ isLoggingIn: true, isLoading: true, error: null })
    try {
      const success = await window.api.auth.login()
      if (success) {
        const platform = await getPlatformStatus()
        const backendConnected = !!platform?.enabled && !!platform?.connected
        const backendEnabled = !!platform?.enabled
        const user = await resolveUserProfile()
        set({
          isAuthenticated: true,
          authMode: deriveAuthMode(true, backendConnected),
          backendConnected,
          backendEnabled,
          user,
          error: null
        })
        if (backendConnected) {
          void import('../lib/chat-sync').then(({ syncChatHistoryFromBackend }) => syncChatHistoryFromBackend())
        }
        try {
          await window.api.notification.show(
            'Signed in successfully',
            `Welcome ${user.name || user.login}.`
          )
        } catch {
          // Ignore notification failures; auth should still succeed.
        }
      } else {
        set({ error: 'GitHub login did not complete.' })
      }
    } catch (error: any) {
      console.error('Login failed', error)
      set({ error: humanizeError(error, 'GitHub sign-in did not complete. Please try again.') })
    } finally {
      set({ isLoggingIn: false, isLoading: false })
    }
  },
  logout: async () => {
    await window.api.auth.logout()
    set({
      isAuthenticated: false,
      authMode: 'unauthenticated',
      backendConnected: false,
      backendEnabled: false,
      hasHydratedAuth: true,
      isLoggingIn: false,
      user: null,
      error: null
    })
  }
}))
