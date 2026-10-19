import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { ErrorBoundary } from '../ErrorBoundary'
import { useUIStore } from '../../store/useUIStore'
import { clsx } from 'clsx'
import { useEffect, useState } from 'react'
import { useWorkflowEngineStore } from '../../store/useWorkflowEngineStore'

interface AppShellProps {
    children: React.ReactNode
}

export const AppShell = ({ children }: AppShellProps) => {
    const { sidebarCollapsed } = useUIStore()
    const warning = useWorkflowEngineStore((state) => state.githubWarning)
    const [now, setNow] = useState(Date.now)
    useEffect(() => {
        if (!warning?.retryAt) return
        setNow(Date.now())
        const timer = setInterval(() => setNow(Date.now()), 1000)
        return () => clearInterval(timer)
    }, [warning])
    const remaining = warning?.retryAt ? Math.max(0, Math.ceil((warning.retryAt - now) / 1000)) : null

    return (
        <div className="h-screen w-full bg-background text-text-main overflow-hidden page-enter flex">
            <aside
                className={clsx(
                    'h-full shrink-0 bg-surface border-r border-border transition-[width] duration-200 ease-out overflow-hidden',
                    sidebarCollapsed ? 'w-[56px]' : 'w-[236px]'
                )}
            >
                <Sidebar />
            </aside>

            <main className="flex-1 min-w-0 h-full flex flex-col overflow-hidden">
                <TopBar />
                {warning && (
                    <div role="status" data-testid="github-request-warning" className="shrink-0 border-b border-border bg-surface px-4 py-3 text-sm text-text-secondary">
                        {remaining === null ? warning.message : remaining > 0
                            ? `GitHub rate limit reached. Retry in ${remaining} seconds. Your local work is saved.`
                            : 'GitHub’s retry time has passed. Retry your action when ready; your local work is saved.'}
                    </div>
                )}
                <section className="flex-1 min-h-0 overflow-hidden">
                    <ErrorBoundary fallbackLabel="This view crashed">{children}</ErrorBoundary>
                </section>
            </main>
        </div>
    )
}
