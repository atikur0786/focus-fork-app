interface StatusBarProps {
  statusMessage: string
  branchName: string
  currentFileRelativePath: string | null
}

export const StatusBar = ({ statusMessage, branchName, currentFileRelativePath }: StatusBarProps) => (
  <div className="shrink-0 flex h-8 items-center justify-between border-t border-border bg-surface px-4 text-[11px] text-text-secondary font-mono">
    <span>{statusMessage}</span>
    <span>
      {branchName}
      {currentFileRelativePath ? ` · ${currentFileRelativePath}` : ''}
    </span>
  </div>
)
