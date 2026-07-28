import { useState } from 'react'
import { aiErrorActionLabel, aiErrorTips, aiErrorTitle, aiErrorUserMessage, isTechnicalUserMessage, type AiErrorCode } from '../lib/ai-errors'
import { useUIStore } from '../store/useUIStore'

export function AiErrorNotice({
  errorCode,
  message,
  debugHint,
  compact = false,
  modelId,
  modelLabel,
  onRetry,
  onReconnect,
  onChangeModel,
  reconnectDisabled = false,
  retryDisabled = false,
  retryLabel = 'Retry message'
}: {
  errorCode?: AiErrorCode
  message?: string
  debugHint?: string
  compact?: boolean
  modelId?: string
  modelLabel?: string
  onRetry?: () => void
  onReconnect?: () => void
  onChangeModel?: () => void
  reconnectDisabled?: boolean
  retryDisabled?: boolean
  retryLabel?: string
}) {
  const setView = useUIStore((state) => state.setView)
  const [showTechnical, setShowTechnical] = useState(false)

  const context = { modelId, modelLabel }
  const friendlyBody = errorCode
    ? aiErrorUserMessage(errorCode, context)
    : message && !isTechnicalUserMessage(message)
      ? message
      : aiErrorUserMessage(undefined, context)

  const tips = aiErrorTips(errorCode, context)
  const billingAction = errorCode === 'QUOTA_EXCEEDED' || errorCode === 'ACCOUNT_SUSPENDED'
  const changeModelAction =
    errorCode === 'MODEL_UNAVAILABLE' || errorCode === 'RATE_LIMITED' || errorCode === 'INVALID_REQUEST'

  const technicalDetails = debugHint?.trim() || (message && isTechnicalUserMessage(message) ? message : '')
  const showDevDetails = import.meta.env.DEV && Boolean(technicalDetails)

  return (
    <div
      className={`rounded-xl border border-active/30 bg-active-soft text-active-text ${
        compact ? 'p-3' : 'p-4'
      }`}
      data-testid="ai-error-notice"
    >
      <p className={`font-semibold ${compact ? 'text-sm' : 'text-base'}`}>{aiErrorTitle(errorCode)}</p>
      <p className={`mt-1.5 leading-relaxed text-active-text/90 ${compact ? 'text-xs' : 'text-sm'}`}>
        {friendlyBody}
      </p>

      {tips.length > 0 && (
        <ul className={`mt-3 space-y-1 text-active-text/80 ${compact ? 'text-[11px]' : 'text-xs'}`}>
          {tips.map((tip) => (
            <li key={tip} className="flex gap-2">
              <span className="shrink-0">•</span>
              <span>{tip}</span>
            </li>
          ))}
        </ul>
      )}

      {(onRetry || onReconnect || onChangeModel || billingAction || changeModelAction) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {onReconnect && (
            <button
              type="button"
              data-testid="ai-error-reconnect-btn"
              onClick={onReconnect}
              disabled={reconnectDisabled}
              className="inline-flex items-center rounded-lg border border-active/40 bg-background px-3 py-1.5 text-xs font-medium text-active-text hover:bg-active-soft disabled:cursor-not-allowed disabled:opacity-60"
            >
              {reconnectDisabled ? 'Reconnecting…' : 'Reconnect'}
            </button>
          )}
          {onRetry && (
            <button
              type="button"
              data-testid="ai-error-retry-btn"
              onClick={onRetry}
              disabled={retryDisabled}
              className="inline-flex items-center rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              {retryLabel}
            </button>
          )}
          {changeModelAction && onChangeModel && (
            <button
              type="button"
              data-testid="ai-error-change-model-btn"
              onClick={onChangeModel}
              className="inline-flex items-center rounded-lg border border-active/40 bg-background px-3 py-1.5 text-xs font-medium text-active-text hover:bg-active-soft"
            >
              {aiErrorActionLabel(errorCode) || 'Change model'}
            </button>
          )}
          {billingAction && (
            <button
              type="button"
              onClick={() => setView('usage')}
              className="inline-flex items-center rounded-lg border border-active/40 bg-background px-3 py-1.5 text-xs font-medium text-active-text hover:bg-active-soft"
            >
              {aiErrorActionLabel(errorCode) || 'Usage & Billing'}
            </button>
          )}
        </div>
      )}

      {showDevDetails && (
        <div className="mt-3 border-t border-active/20 pt-2">
          <button
            type="button"
            className="text-[10px] font-medium text-active-text/80 underline underline-offset-2"
            onClick={() => setShowTechnical((open) => !open)}
          >
            {showTechnical ? 'Hide technical details' : 'Technical details (dev only)'}
          </button>
          {showTechnical && (
            <p className="mt-1 font-mono text-[10px] leading-relaxed text-active-text/70" data-testid="ai-error-debug-hint">
              {technicalDetails}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
