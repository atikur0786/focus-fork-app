import { Github, Loader2 } from 'lucide-react'
import focusforkIcon from '../../../../resources/icon.png'

export function AuthLoadingScreen(): React.JSX.Element {
  return (
    <div className="min-h-screen bg-background relative overflow-hidden flex items-center justify-center px-6">
      <div className="absolute top-[-20%] left-[-10%] h-[60vh] w-[60vh] rounded-full bg-active/5 blur-3xl" />
      <div className="absolute bottom-[-20%] right-[-10%] h-[50vh] w-[50vh] rounded-full bg-active/5 blur-3xl" />

      <div className="w-full max-w-md rounded-2xl border border-border bg-surface/95 backdrop-blur p-8 shadow-lg text-center relative z-10">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-background">
          <img src={focusforkIcon} alt="FocusFork" className="focusfork-logo-well h-8 w-8" />
        </div>
        <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-border bg-card-muted px-3 py-1.5 text-[12px] font-medium text-text-secondary">
          <Github className="h-3.5 w-3.5" />
          GitHub device sign-in
        </div>
        <h1 className="mt-5 font-serif text-[22px] font-medium tracking-tight text-text-main">
          Finish signing in with GitHub
        </h1>
        <p className="mt-2 text-[13.5px] text-text-muted leading-relaxed max-w-sm mx-auto">
          Complete the browser prompt, then return here. FocusFork will sync your profile and backend session automatically.
        </p>
        <div className="mt-6 flex items-center justify-center gap-2 text-[13px] text-active font-medium">
          <Loader2 className="h-4 w-4 animate-spin" />
          Waiting for authorization…
        </div>
      </div>
    </div>
  )
}
