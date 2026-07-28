import { useAuthStore } from '../../store/useAuthStore'
import { Github, Loader2, Search, Wand2, GitPullRequest, ArrowRight, ShieldCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import logo from '../../../../../resources/icon.png'

const WORKFLOW_STEPS = [
    { icon: Search, label: 'Discover issues', detail: 'Filter by language, labels, and repo scope' },
    { icon: Wand2, label: 'Evaluate fit with AI', detail: 'Know if an issue matches your skills before you fork' },
    { icon: GitPullRequest, label: 'Fork, edit, and open PR', detail: 'Stay in your IDE while FocusFork handles Git and PR flow' }
]

export const AuthPage = () => {
    const { login, isLoggingIn, error } = useAuthStore()
    const [configStatus, setConfigStatus] = useState<{ hasClientId: boolean; source: 'env' | 'app-config' | 'none' } | null>(null)
    const [backendOnline, setBackendOnline] = useState<boolean | null>(null)

    useEffect(() => {
        window.api.auth.configStatus().then(setConfigStatus).catch(() => setConfigStatus(null))
        window.api.platform.status()
            .then((status) => setBackendOnline(!!status?.enabled))
            .catch(() => setBackendOnline(false))
    }, [])

    return (
        <div data-testid="login-screen" className="min-h-screen bg-background text-text-main draggable page-enter">
            <div className="min-h-screen grid lg:grid-cols-[1.05fr_0.95fr]">
                {/* Left pane — marketing context */}
                <section className="relative hidden lg:flex flex-col justify-between border-r border-border warm-surface p-12">
                    <div>
                        <div className="inline-flex items-center gap-3">
                            <img src={logo} alt="FocusFork logo" className="focusfork-logo-well h-[30px] w-[30px] rounded-[9px]" />
                            <div>
                                <div className="text-[15px] font-semibold tracking-tight">FocusFork</div>
                                <div className="text-[11px] text-text-muted mt-0.5">Desktop companion for OSS contributors</div>
                            </div>
                        </div>
                        <h1 className="mt-12 font-serif text-[36px] font-medium tracking-tight leading-[1.15] max-w-lg">
                            From issue discovery to merged PR — without losing your flow.
                        </h1>
                        <p className="mt-4 text-[14.5px] text-text-secondary max-w-md leading-relaxed">
                            A calm control panel beside your editor. Search issues, evaluate fit with AI, fork with approval gates, and ship pull requests from one guided workspace.
                        </p>
                    </div>

                    <div className="space-y-3">
                        {WORKFLOW_STEPS.map(({ icon: Icon, label, detail }, index) => (
                            <div key={label} className="shell-card flex items-start gap-4 p-4">
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-background">
                                    <Icon className="h-4 w-4 text-text-main" />
                                </div>
                                <div>
                                    <div className="text-[11px] font-mono text-text-muted">Step {index + 1}</div>
                                    <div className="text-[13.5px] font-semibold text-text-main mt-0.5">{label}</div>
                                    <div className="text-[12.5px] text-text-secondary mt-1 leading-relaxed">{detail}</div>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="flex items-center gap-2 text-[12px] text-text-muted">
                        <ShieldCheck className="h-3.5 w-3.5" />
                        Destructive actions always require your explicit approval.
                    </div>
                </section>

                {/* Right pane — auth card */}
                <section className="flex items-center justify-center p-6 sm:p-10">
                    <div className="w-full max-w-md panel p-8 sm:p-10">
                        <div className="flex flex-col items-center text-center lg:items-start lg:text-left">
                            <div className="h-14 w-14 rounded-2xl border border-border bg-surface-hover flex items-center justify-center lg:hidden">
                                <img src={logo} alt="FocusFork logo" className="focusfork-logo-well h-9 w-9" />
                            </div>
                            <h2 className="font-serif text-[24px] font-medium tracking-tight mt-5 lg:mt-0">Welcome back</h2>
                            <p className="text-text-secondary text-[13.5px] mt-2 max-w-sm leading-relaxed">
                                Sign in with GitHub to sync your contribution history and unlock AI-guided workflows.
                            </p>
                            {backendOnline !== null && (
                                <div className={`mt-4 status-pill ${
                                    backendOnline
                                        ? 'border-success/30 bg-success-bg text-success'
                                        : 'border-active/30 bg-active-soft text-active'
                                }`}>
                                    <span className={`h-[6px] w-[6px] rounded-full ${backendOnline ? 'bg-success' : 'bg-active'}`} />
                                    Backend {backendOnline ? 'reachable' : 'offline — GitHub fallback enabled'}
                                </div>
                            )}
                        </div>

                        <div className="mt-8 space-y-3 lg:hidden">
                            {WORKFLOW_STEPS.map(({ icon: Icon, label }) => (
                                <div key={label} className="flex items-center gap-3 rounded-[10px] border border-border bg-background px-3 py-2.5 text-[13px] text-text-secondary">
                                    <Icon className="h-4 w-4 text-text-main shrink-0" />
                                    {label}
                                </div>
                            ))}
                        </div>

                        <div className="mt-8 space-y-3">
                            {configStatus && !configStatus.hasClientId && (
                                <div className="text-[12px] text-active-text text-center border border-active/30 bg-active-soft rounded-[10px] p-3">
                                    Add `GITHUB_CLIENT_ID` in `.env` for local development.
                                </div>
                            )}

                            {!backendOnline && backendOnline !== null && (
                                <div className="rounded-[11px] border border-danger/30 bg-danger-bg p-4">
                                    <p className="text-[13px] font-semibold text-danger mb-1">Can't reach FocusFork's backend</p>
                                    <p className="text-[12.5px] text-text-muted leading-relaxed">Check your connection and try again. You can still sign in with GitHub directly.</p>
                                </div>
                            )}

                            <button
                                data-testid="github-login-btn"
                                onClick={login}
                                disabled={isLoggingIn}
                                className="w-full btn-primary h-12 rounded-[10px]"
                            >
                                {isLoggingIn ? <Loader2 className="animate-spin h-5 w-5" /> : <Github className="h-5 w-5" />}
                                {isLoggingIn ? 'Signing in…' : 'Continue with GitHub'}
                                {!isLoggingIn && <ArrowRight className="h-4 w-4 ml-auto opacity-70" />}
                            </button>
                            {error && (
                                <div className="rounded-[11px] border border-danger/30 bg-danger-bg p-3">
                                    <p className="text-[12.5px] text-danger">{error}</p>
                                </div>
                            )}
                        </div>

                        <p className="mt-6 text-[11px] text-center text-text-muted leading-relaxed">
                            By continuing, you connect FocusFork to your GitHub account for issue search, forking, and pull request creation.
                        </p>
                    </div>
                </section>
            </div>
        </div>
    )
}
