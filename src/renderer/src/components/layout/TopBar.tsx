import { useEffect } from 'react'
import { useUIStore } from '../../store/useUIStore'
import { useSettingsStore } from '../../store/useSettingsStore'
import { useAuthStore } from '../../store/useAuthStore'
import { useIssueStore } from '../../store/useIssueStore'
import { useAIModeStore } from '../../store/useAIModeStore'
import { ChevronRight } from 'lucide-react'

const VIEW_LABELS: Record<string, string> = {
    issues: 'Discover',
    contributions: 'History',
    chat: 'Chat',
    usage: 'Usage & Billing',
    ide: 'Workspace',
    settings: 'Settings'
}

export const TopBar = () => {
    const { currentView, setView } = useUIStore()
    const { activeRepoPath } = useSettingsStore()
    const { backendConnected } = useAuthStore()
    const { selectedIssue } = useIssueStore()
    const { mode: aiMode, hasKey, refresh } = useAIModeStore()

    useEffect(() => {
        void refresh()
    }, [refresh])

    const viewLabel = VIEW_LABELS[currentView] || currentView
    const repoName = activeRepoPath?.split('/').pop()

    // BYOK mode is independent of the backend: report the key state, not the
    // server. Subscription mode reports live backend reachability.
    const status =
        aiMode === 'byok'
            ? hasKey
                ? { label: 'Own key · independent', tone: 'success' as const }
                : { label: 'Add API key in Settings', tone: 'warn' as const }
            : backendConnected
                ? { label: 'Subscription connected', tone: 'success' as const }
                : { label: 'Subscription offline', tone: 'warn' as const }

    return (
        <header className="h-11 shrink-0 border-b border-border bg-surface/60 px-4 flex items-center justify-between gap-3">
            <div className="min-w-0 flex items-center gap-1.5 text-[13px]">
                <button
                    type="button"
                    onClick={() => setView('issues')}
                    className="text-text-muted text-xs hover:text-text-main transition-colors"
                    title="Go to Discover"
                >
                    FocusFork
                </button>
                <ChevronRight className="h-3 w-3 text-text-muted/60 shrink-0" />
                <span className="font-semibold text-text-main truncate">{viewLabel}</span>
                {/* Repo + issue crumbs belong to the Workspace only; on other
                    views they are stale context. Clicking them returns there. */}
                {repoName && currentView === 'ide' && (
                    <>
                        <ChevronRight className="h-3 w-3 text-text-muted/60 shrink-0" />
                        <button
                            type="button"
                            onClick={() => setView('ide')}
                            className="text-text-muted truncate font-mono text-xs hover:text-text-main transition-colors"
                            title="Open workspace"
                        >
                            {repoName}
                        </button>
                    </>
                )}
                {selectedIssue && currentView === 'ide' && (
                    <>
                        <ChevronRight className="h-3 w-3 text-text-muted/60 shrink-0" />
                        <button
                            type="button"
                            onClick={() => window.api.openExternal(selectedIssue.html_url)}
                            className="text-text-muted truncate text-xs hover:text-text-main transition-colors"
                            title="Open issue on GitHub"
                        >
                            #{selectedIssue.number}
                        </button>
                    </>
                )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
                <div
                    data-testid="topbar-ai-status"
                    className={`status-pill ${
                        status.tone === 'success'
                            ? 'border-success/30 bg-success-bg text-success'
                            : 'border-active/30 bg-active-soft text-active'
                    }`}
                >
                    <span
                        className={`h-[6px] w-[6px] rounded-full shrink-0 ${
                            status.tone === 'success' ? 'bg-success' : 'bg-active'
                        }`}
                    />
                    {status.label}
                </div>
            </div>
        </header>
    )
}
