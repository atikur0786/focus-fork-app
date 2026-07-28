import {
    Compass,
    MessageSquare,
    GitBranch,
    Code2,
    BarChart3,
    Settings,
    PanelLeftClose,
    PanelLeftOpen,
    Sun,
    Moon
} from 'lucide-react'
import { useIssueStore } from '../../store/useIssueStore'
import { useUIStore, type View } from '../../store/useUIStore'
import { useAuthStore } from '../../store/useAuthStore'
import { useTabActivityStore } from '../../store/useTabActivityStore'
import { useContributionStore, WORKFLOW_ORDER } from '../../store/useContributionStore'
import { clsx } from 'clsx'
import icon from '../../../../../resources/icon.png'

const NAV_ITEMS: Array<{ id: View; label: string; icon: typeof Compass }> = [
    { id: 'issues', label: 'Discover', icon: Compass },
    { id: 'ide', label: 'Workspace', icon: Code2 },
    { id: 'chat', label: 'Chat', icon: MessageSquare },
    { id: 'contributions', label: 'History', icon: GitBranch },
    { id: 'usage', label: 'Usage', icon: BarChart3 },
]

const PROGRESS_SEGMENTS = ['fork', 'clone', 'code', 'pr'] as const

export const Sidebar = () => {
    const { selectedIssue } = useIssueStore()
    const { currentView, setView, sidebarCollapsed, toggleSidebar, theme, setTheme } = useUIStore()
    const { user } = useAuthStore()
    const tabActivity = useTabActivityStore((state) => state.byTab)
    const { steps } = useContributionStore()

    const completedSteps = WORKFLOW_ORDER.filter((step) => steps[step] === 'success').length
    const segmentsFilled = Math.min(
        PROGRESS_SEGMENTS.length,
        Math.round((completedSteps / WORKFLOW_ORDER.length) * PROGRESS_SEGMENTS.length)
    )

    return (
        <div className="w-full h-full flex flex-col font-sans">
            {/* Logo + collapse */}
            <div className={clsx(
                'shrink-0 border-b border-border flex items-center',
                sidebarCollapsed ? 'flex-col gap-1.5 px-2 py-3' : 'px-3.5 py-3 gap-2.5'
            )}>
                <img src={icon} alt="FocusFork" className="focusfork-logo-well h-[26px] w-[26px] shrink-0" />
                {!sidebarCollapsed && (
                    <span className="font-semibold text-[13px] tracking-tight text-text-main truncate">FocusFork</span>
                )}
                <button
                    onClick={toggleSidebar}
                    className={clsx(
                        'h-6 w-6 flex items-center justify-center rounded-md text-text-muted hover:bg-surface-hover hover:text-text-main transition-colors',
                        !sidebarCollapsed && 'ml-auto'
                    )}
                    title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                >
                    {sidebarCollapsed ? <PanelLeftOpen className="h-3.5 w-3.5" /> : <PanelLeftClose className="h-3.5 w-3.5" />}
                </button>
            </div>

            {/* Navigation */}
            <nav className={clsx('flex-1 overflow-y-auto py-2', sidebarCollapsed ? 'px-1.5' : 'px-2')}>
                <div className="space-y-0.5">
                    {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
                        const activity = tabActivity[id]
                        const isActive = currentView === id
                        return (
                            <button
                                key={id}
                                onClick={() => setView(id)}
                                title={sidebarCollapsed ? label : undefined}
                                className={clsx(
                                    'w-full flex items-center rounded-[10px] transition-colors',
                                    sidebarCollapsed ? 'justify-center p-2.5' : 'gap-2.5 px-3 py-2',
                                    isActive
                                        ? 'bg-card-muted text-text-main font-semibold'
                                        : 'text-text-secondary hover:bg-surface-hover hover:text-text-main'
                                )}
                            >
                                <span className="relative shrink-0">
                                    <Icon className="h-[18px] w-[18px]" strokeWidth={isActive ? 2 : 1.5} />
                                    {activity?.status === 'working' && (
                                        <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-active animate-pulse" />
                                    )}
                                    {activity?.status === 'success' && (
                                        <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-success" />
                                    )}
                                    {activity?.status === 'error' && (
                                        <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-danger" />
                                    )}
                                </span>
                                {!sidebarCollapsed && (
                                    <span className="text-[13px] truncate">{label}</span>
                                )}
                            </button>
                        )
                    })}
                </div>

                {/* Active Issue card */}
                {selectedIssue && (
                    <div className={clsx('mt-3 pt-3 border-t border-border', sidebarCollapsed && 'px-0')}>
                        <button
                            onClick={() => setView('ide')}
                            className={clsx(
                                'w-full rounded-[11px] border border-border bg-background transition-colors hover:border-border-strong',
                                sidebarCollapsed ? 'p-2' : 'p-3 text-left'
                            )}
                            title={sidebarCollapsed ? `#${selectedIssue.number}: ${selectedIssue.title}` : undefined}
                        >
                            {sidebarCollapsed ? (
                                <span className="text-xs font-mono font-medium text-text-main">
                                    #{selectedIssue.number}
                                </span>
                            ) : (
                                <>
                                    <span className="text-[10px] font-mono font-medium uppercase tracking-wider text-text-muted">
                                        Active issue
                                    </span>
                                    <p className="text-[12.5px] font-semibold text-text-main mt-1 line-clamp-2 leading-snug">
                                        {selectedIssue.title}
                                    </p>
                                    <span className="text-[11px] font-mono text-text-muted mt-1 block">
                                        #{selectedIssue.number}
                                    </span>
                                    {/* 4-segment progress bar */}
                                    <div className="flex gap-1 mt-2">
                                        {PROGRESS_SEGMENTS.map((seg, i) => (
                                            <div
                                                key={seg}
                                                className={clsx(
                                                    'h-[3px] flex-1 rounded-full transition-colors',
                                                    i < segmentsFilled ? 'bg-active' : 'bg-border'
                                                )}
                                            />
                                        ))}
                                    </div>
                                </>
                            )}
                        </button>
                    </div>
                )}
            </nav>

            {/* Bottom: Settings + Account */}
            <div className={clsx('shrink-0 border-t border-border', sidebarCollapsed ? 'p-1.5' : 'p-2')}>
                <button
                    onClick={() => setView('settings')}
                    title={sidebarCollapsed ? 'Settings' : undefined}
                    className={clsx(
                        'w-full flex items-center rounded-[10px] transition-colors',
                        sidebarCollapsed ? 'justify-center p-2.5' : 'gap-2.5 px-3 py-2',
                        currentView === 'settings'
                            ? 'bg-card-muted text-text-main font-semibold'
                            : 'text-text-secondary hover:bg-surface-hover hover:text-text-main'
                    )}
                >
                    <Settings className="h-[18px] w-[18px] shrink-0" strokeWidth={currentView === 'settings' ? 2 : 1.5} />
                    {!sidebarCollapsed && <span className="text-[13px]">Settings</span>}
                </button>

                {user && (
                    <div className={clsx(
                        'flex items-center mt-2',
                        sidebarCollapsed ? 'justify-center' : 'gap-2 px-3 py-1'
                    )}>
                        <img
                            src={user.avatar_url}
                            alt={user.login}
                            className="h-6 w-6 rounded-full border border-border object-cover shrink-0"
                        />
                        {!sidebarCollapsed && (
                            <>
                                <span className="truncate text-xs text-text-muted flex-1">@{user.login}</span>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        setTheme(theme === 'dark' ? 'light' : 'dark')
                                    }}
                                    className="h-6 w-6 flex items-center justify-center rounded-md text-text-muted hover:bg-surface-hover hover:text-text-main transition-colors shrink-0"
                                    title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
                                >
                                    {theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
                                </button>
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}
