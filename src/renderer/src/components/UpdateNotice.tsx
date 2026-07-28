import { Download, Sparkles, X } from 'lucide-react'
import { useEffect, useState } from 'react'

interface UpdateManifest {
  version: string
  notes: string
  download_url?: string
  published_at?: string
}

interface UpdateCheckResult {
  currentVersion: string
  updateAvailable: boolean
  manifest: UpdateManifest | null
}

const DISMISS_KEY = 'focusfork-dismissed-update-version'

export function UpdateNotice(): React.JSX.Element | null {
  const [result, setResult] = useState<UpdateCheckResult | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const run = async () => {
      try {
        const payload = (await window.api.app.checkForUpdates()) as UpdateCheckResult
        if (!payload?.updateAvailable || !payload.manifest) return
        const dismissedVersion = sessionStorage.getItem(DISMISS_KEY)
        if (dismissedVersion === payload.manifest.version) {
          setDismissed(true)
          return
        }
        setResult(payload)
      } catch {
        // Ignore update check failures.
      }
    }
    void run()
  }, [])

  if (!result?.manifest || dismissed) return null

  const dismiss = () => {
    sessionStorage.setItem(DISMISS_KEY, result.manifest!.version)
    setDismissed(true)
  }

  return (
    <div
      data-testid="update-notice"
      className="fixed bottom-5 right-5 z-[70] w-[min(420px,calc(100vw-2rem))] rounded-2xl border border-border bg-surface p-5 shadow-2xl page-enter"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-background">
          <Sparkles className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="section-kicker">Update available</div>
          <h3 className="mt-1 text-base font-semibold text-text-main">
            FocusFork {result.manifest.version}
          </h3>
          <p className="mt-1 text-xs text-text-secondary">
            You are on v{result.currentVersion}. Install the latest build to get new fixes and features.
          </p>
          <div className="mt-3 rounded-xl border border-border bg-background px-3 py-2 text-sm leading-6 text-text-main whitespace-pre-wrap max-h-40 overflow-y-auto">
            {result.manifest.notes}
          </div>
          <div className="mt-4 flex items-center gap-2">
            {result.manifest.download_url ? (
              <button
                type="button"
                data-testid="update-download-btn"
                onClick={() => void window.api.openExternal(result.manifest!.download_url!)}
                className="btn-primary px-3 py-2 text-xs"
              >
                <Download size={14} />
                Download update
              </button>
            ) : null}
            <button
              type="button"
              data-testid="update-dismiss-btn"
              onClick={dismiss}
              className="btn-secondary px-3 py-2 text-xs"
            >
              Not now
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="rounded-md p-1 text-text-muted hover:bg-surface-hover hover:text-text-main"
          aria-label="Dismiss update notice"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  )
}
