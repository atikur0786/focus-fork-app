import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { ErrorBoundary } from '../ErrorBoundary'
import { useUIStore } from '../../store/useUIStore'
import { clsx } from 'clsx'

interface AppShellProps {
    children: React.ReactNode
}

export const AppShell = ({ children }: AppShellProps) => {
    const { sidebarCollapsed } = useUIStore()

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
                <section className="flex-1 min-h-0 overflow-hidden">
                    <ErrorBoundary fallbackLabel="This view crashed">{children}</ErrorBoundary>
                </section>
            </main>
        </div>
    )
}
