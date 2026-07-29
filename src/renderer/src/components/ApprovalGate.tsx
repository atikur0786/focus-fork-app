import { ShieldAlert } from 'lucide-react'
import { type ReactNode, useEffect } from 'react'
import { ModalPortal } from './ModalPortal'

interface ApprovalGateProps {
  actionLabel: string
  description?: string
  isOpen: boolean
  isBusy?: boolean
  size?: 'default' | 'wide'
  onApprove: () => void
  onReject: () => void
  children?: ReactNode
}

export function ApprovalGate({
  actionLabel,
  description,
  isOpen,
  isBusy = false,
  size = 'default',
  onApprove,
  onReject,
  children
}: ApprovalGateProps): React.JSX.Element | null {
  useEffect(() => {
    if (!isOpen || isBusy) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onReject()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [isOpen, isBusy, onReject])

  if (!isOpen) return null

  return (
    <ModalPortal>
    <div
      data-testid="approval-gate"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget && !isBusy) onReject() }}
    >
      <div
        className={`w-full panel p-5 sm:p-6 page-enter shadow-lg ${size === 'wide' ? 'max-w-3xl max-h-[85vh] overflow-y-auto' : 'max-w-lg'}`}
      >
        <div className="flex items-start gap-3.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/5 border border-primary/10">
            <ShieldAlert className="h-[18px] w-[18px] text-text-main" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-medium text-text-muted">Approval required</div>
            <div data-testid="approval-action" className="mt-1 text-[15px] font-semibold text-text-main leading-snug">
              {actionLabel}
            </div>
            {description && <p className="mt-1.5 text-[13px] leading-relaxed text-text-secondary">{description}</p>}
          </div>
        </div>
        {children && <div className="mt-4 rounded-xl border border-border bg-background p-4">{children}</div>}
        <div className="mt-5 flex items-center justify-end gap-2.5">
          <button
            data-testid="approval-reject-btn"
            type="button"
            onClick={onReject}
            disabled={isBusy}
            className="btn-ghost text-[13px] disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            data-testid="approval-approve-btn"
            type="button"
            onClick={onApprove}
            disabled={isBusy}
            className="btn-primary text-[13px] py-2 disabled:opacity-60"
          >
            {isBusy ? 'Working…' : 'Approve & continue'}
          </button>
        </div>
      </div>
    </div>
    </ModalPortal>
  )
}
