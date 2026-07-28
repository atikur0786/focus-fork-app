import focusforkIcon from '../../../../resources/icon.png'

export function StartupSplash(): React.JSX.Element {
  return (
    <div className="min-h-screen bg-background relative overflow-hidden flex items-center justify-center px-6">
      <div className="absolute -top-24 -left-20 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
      <div className="absolute -bottom-24 -right-20 h-72 w-72 rounded-full bg-accent/10 blur-3xl" />

      <div className="w-full max-w-lg rounded-2xl border border-border bg-surface/95 backdrop-blur p-8 shadow-xl">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-background">
            <img src={focusforkIcon} alt="FocusFork" className="focusfork-logo-well h-7 w-7" />
          </div>
          <div>
            <div className="text-lg font-semibold text-text-main">Starting FocusFork</div>
            <div className="text-sm text-text-secondary mt-0.5">Preparing your contribution workspace…</div>
          </div>
        </div>

        <div className="mt-6 space-y-3">
          <StartupStep label="Checking GitHub sign-in" active />
          <StartupStep label="Connecting managed AI backend" />
          <StartupStep label="Loading your workspace" />
        </div>

        <p className="mt-6 text-xs text-text-muted leading-relaxed">
          FocusFork keeps GitHub and backend sessions separate. If backend sync is slow, you can still browse issues once startup completes.
        </p>
      </div>
    </div>
  )
}

function StartupStep({ label, active = false }: { label: string; active?: boolean }): React.JSX.Element {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-background px-3 py-2.5">
      <div
        className={`h-2.5 w-2.5 rounded-full ${active ? 'bg-primary animate-pulse' : 'bg-border'}`}
        aria-hidden="true"
      />
      <span className={`text-sm ${active ? 'text-text-main font-medium' : 'text-text-secondary'}`}>{label}</span>
    </div>
  )
}
