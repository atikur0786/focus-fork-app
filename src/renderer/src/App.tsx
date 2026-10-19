import { useEffect, useRef } from 'react'
import { useAuthStore } from './store/useAuthStore'
import { useUIStore } from './store/useUIStore'
import { AuthPage } from './features/auth/AuthPage'
import { AppShell } from './components/layout/AppShell'
import { IssueBrowser } from './features/issues/IssueBrowser'
import { SettingsPage } from './features/settings/SettingsPage'
import { IDE } from './features/ide/IDE'
import { ContributionsPage } from './features/contributions/ContributionsPage'
import { UsagePage } from './features/usage/UsagePage'
import { ChatPage } from './features/chat/ChatPage'
import { useAIStore } from './store/useAIStore'
import { UpdateNotice } from './components/UpdateNotice'
import { StartupSplash } from './components/StartupSplash'
import { AuthLoadingScreen } from './components/AuthLoadingScreen'
import { OnboardingGuide, useOnboarding } from './components/OnboardingGuide'
import { useWorkflowEngineStore } from './store/useWorkflowEngineStore'

function App(): React.JSX.Element {
  const { isAuthenticated, checkAuth, hasHydratedAuth, isLoggingIn, authMode } = useAuthStore()
  const { currentView, theme, setView } = useUIStore()
  const { provider, apiKey, model, setModel, setApiKey } = useAIStore()
  const { showOnboarding, completeOnboarding } = useOnboarding()
  const wasAuthenticatedRef = useRef(isAuthenticated)

  useEffect(() => window.api.github.onRequestWarning?.((warning) => {
    useWorkflowEngineStore.getState().recordGitHubWarning(warning)
  }), [])

  useEffect(() => {
    if (!wasAuthenticatedRef.current && isAuthenticated) {
      setView('issues')
    }
    wasAuthenticatedRef.current = isAuthenticated
  }, [isAuthenticated, setView])

  useEffect(() => {
    void checkAuth()
    const unsubscribe = window.api.platform.onBackendSessionChange?.((payload) => {
      useAuthStore.getState().applyBackendSession(payload)
    }) ?? (() => undefined)
    return unsubscribe
  }, [checkAuth])

  useEffect(() => {
    if (!isAuthenticated || authMode === 'authenticated-backend') return
    void useAuthStore.getState().refreshBackendConnection()
  }, [isAuthenticated, authMode])

  // One-time migration: if a legacy plaintext API key was persisted in
  // renderer storage by an older version, move it into OS secure storage in the
  // main process, then wipe it from the renderer.
  useEffect(() => {
    if (!apiKey) return
    window.api.ai
      .setProvider({ provider, apiKey, model })
      .then((result) => {
        if (result?.model && result.model !== model) {
          setModel(result.model)
        }
      })
      .catch((error) => {
        console.error('Failed to migrate AI provider key to secure storage', error)
      })
      .finally(() => {
        setApiKey('')
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey])

  // Theme Management
  useEffect(() => {
    const root = window.document.documentElement
    root.classList.remove('light', 'dark')

    if (theme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
      root.classList.add(systemTheme)
    } else {
      root.classList.add(theme)
    }
  }, [theme])

  if (!hasHydratedAuth) {
    return <StartupSplash />
  }

  if (!isAuthenticated) {
    return isLoggingIn ? <AuthLoadingScreen /> : <AuthPage />
  }

  return (
    <div className="draggable-none">
      <AppShell>
        {currentView === 'issues' && (
          <div className="h-full min-h-0">
            <IssueBrowser />
          </div>
        )}
        {currentView === 'contributions' && (
          <div className="h-full min-h-0">
            <ContributionsPage />
          </div>
        )}
        {currentView === 'chat' && (
          <div className="h-full min-h-0">
            <ChatPage />
          </div>
        )}
        {currentView === 'usage' && (
          <div className="h-full min-h-0">
            <UsagePage />
          </div>
        )}
        {currentView === 'settings' && (
          <div className="h-full min-h-0">
            <SettingsPage />
          </div>
        )}
        {currentView === 'ide' && (
          <div className="h-full min-h-0">
            <IDE />
          </div>
        )}
      </AppShell>
      <UpdateNotice />
      {showOnboarding && <OnboardingGuide onComplete={completeOnboarding} />}
    </div>
  )
}

export default App
