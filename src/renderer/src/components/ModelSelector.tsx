import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Search, Star } from 'lucide-react'
import clsx from 'clsx'
import {
  groupModelsByVendor,
  isModelSelectable,
  modelCostTier,
  modelDescription,
  modelVendorLabel,
  vendorKeyForModel,
  type ModelCatalogEntry
} from '../lib/model-catalog'
import { getFavoriteModelIds, isFavoriteModel, toggleFavoriteModel } from '../lib/model-favorites'
import { isFreePlan } from '../lib/model-entitlements'
import { ProviderBrandIcon } from './ProviderBrandIcon'

export type ModelOption = ModelCatalogEntry

interface ModelSelectorProps {
  value: string
  options: ModelOption[]
  onChange: (value: string) => void
  disabled?: boolean
  compact?: boolean
  billingPlan?: string | null
  onUpgradeClick?: () => void
  /** Where the dropdown panel anchors under the trigger (when not portaled). */
  panelAlign?: 'left' | 'right'
  /** Render dropdown in a fixed portal so it is not clipped by Settings cards. */
  usePortal?: boolean
  className?: string
}

function ModelRow({
  option,
  selected,
  favorite,
  onSelect,
  onToggleFavorite
}: {
  option: ModelOption
  selected: boolean
  favorite: boolean
  onSelect: () => void
  onToggleFavorite: () => void
}): React.JSX.Element {
  const selectable = isModelSelectable(option)
  const tier = modelCostTier(option)
  const [showTip, setShowTip] = useState(false)

  return (
    <div
      className="relative"
      onMouseEnter={() => !selectable && setShowTip(true)}
      onMouseLeave={() => setShowTip(false)}
    >
      <div
        role="button"
        tabIndex={selectable ? 0 : -1}
        data-testid={`model-option-${option.id}`}
        onClick={() => {
          if (selectable) onSelect()
        }}
        onKeyDown={(event) => {
          if (!selectable) return
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onSelect()
          }
        }}
        className={clsx(
          'flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left transition-colors',
          selected && selectable && 'bg-primary/10 ring-1 ring-primary/25',
          selectable ? 'hover:bg-surface-hover cursor-pointer' : 'cursor-not-allowed opacity-55'
        )}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-medium text-text-main">{option.label}</span>
            <span
              className={clsx(
                'rounded px-1 py-0.5 text-[10px] font-semibold',
                tier.level <= 1 && 'bg-success-bg text-success',
                tier.level === 2 && 'bg-active-soft text-active-text',
                tier.level >= 3 && 'bg-danger-bg text-danger'
              )}
            >
              {tier.label}
            </span>
            {option.tierLabel && (
              <span className="text-[10px] text-text-muted truncate max-w-[140px]">{option.tierLabel}</span>
            )}
          </div>
          <p className="mt-0.5 text-[11px] leading-snug text-text-secondary line-clamp-2">
            {modelDescription(option)}
          </p>
        </div>
        <button
          type="button"
          aria-label={favorite ? 'Remove from favorites' : 'Add to favorites'}
          data-testid={`model-favorite-${option.id}`}
          onClick={(event) => {
            event.stopPropagation()
            onToggleFavorite()
          }}
          className={clsx(
            'shrink-0 rounded-md p-1 transition-colors',
            favorite ? 'text-active' : 'text-text-muted hover:text-active'
          )}
        >
          <Star size={14} className={favorite ? 'fill-current' : ''} />
        </button>
      </div>
      {!selectable && showTip && (
        <div
          role="tooltip"
          className="pointer-events-none absolute left-2 right-2 top-full z-30 mt-1 rounded-md border border-border bg-surface px-2 py-1.5 text-[11px] text-text-main shadow-md"
        >
          Paid subscription required. Upgrade in Usage &amp; Billing to unlock this model.
        </div>
      )}
    </div>
  )
}

export function ModelSelector({
  value,
  options,
  onChange,
  disabled = false,
  compact = true,
  billingPlan,
  onUpgradeClick,
  panelAlign,
  usePortal = true,
  className
}: ModelSelectorProps): React.JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [providerFilter, setProviderFilter] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [favoriteIds, setFavoriteIds] = useState<string[]>(() => getFavoriteModelIds())
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({})

  const selected = options.find((option) => option.id === value)
  const showUpgrade = isFreePlan(billingPlan)

  const vendorGroups = useMemo(() => groupModelsByVendor(options), [options])
  const vendors = useMemo(
    () => [...vendorGroups.keys()].sort((a, b) => modelVendorLabel(a).localeCompare(modelVendorLabel(b))),
    [vendorGroups]
  )

  const favoriteOptions = useMemo(
    () => options.filter((option) => favoriteIds.includes(option.id)),
    [options, favoriteIds]
  )

  const filteredOptions = useMemo(() => {
    const query = search.trim().toLowerCase()
    return options.filter((option) => {
      if (providerFilter && vendorKeyForModel(option) !== providerFilter) return false
      if (!query) return true
      const haystack = `${option.label} ${option.id} ${option.tierLabel || ''} ${modelVendorLabel(vendorKeyForModel(option))}`.toLowerCase()
      return haystack.includes(query)
    })
  }, [options, providerFilter, search])

  const panelPosition = panelAlign ?? (compact ? 'right' : 'left')
  const panelWidth = compact ? Math.min(440, window.innerWidth - 24) : Math.min(520, window.innerWidth - 32)

  useLayoutEffect(() => {
    if (!open || !usePortal || !rootRef.current) return
    const rect = rootRef.current.getBoundingClientRect()
    const left =
      panelPosition === 'right'
        ? Math.max(8, rect.right - panelWidth)
        : Math.max(8, Math.min(rect.left, window.innerWidth - panelWidth - 8))
    setPanelStyle({
      position: 'fixed',
      top: rect.bottom + 4,
      left,
      width: panelWidth,
      zIndex: 10000,
      maxHeight: 'min(72vh, 440px)'
    })
  }, [open, usePortal, panelPosition, panelWidth, options.length])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        const target = event.target as HTMLElement
        if (target.closest('[data-testid="model-dropdown"]')) return
        setOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const handleSelect = (modelId: string) => {
    const option = options.find((entry) => entry.id === modelId)
    if (option && !isModelSelectable(option)) return
    onChange(modelId)
    setOpen(false)
  }

  const handleToggleFavorite = (modelId: string) => {
    setFavoriteIds(toggleFavoriteModel(modelId))
  }

  const triggerLabel = selected?.label || value || 'Select model'

  const panelBody = (
    <>
      <div className="flex w-[80px] shrink-0 flex-col border-r border-border bg-background/80">
        <div className="shrink-0 border-b border-border px-1 py-2 text-center text-[9px] font-semibold uppercase tracking-wide text-text-muted">
          Provider
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto py-1">
          <button
            type="button"
            data-testid="model-provider-all"
            onClick={() => setProviderFilter(null)}
            className={clsx(
              'mx-1 mb-1 flex w-[calc(100%-8px)] flex-col items-center rounded-lg px-1 py-2 text-[10px] transition-colors',
              providerFilter === null ? 'bg-primary/12 text-text-main' : 'text-text-secondary hover:bg-surface-hover'
            )}
          >
            <ProviderBrandIcon vendorKey="all" size={28} />
            <span className="mt-1">All</span>
          </button>
          {vendors.map((vendor) => {
            const count = vendorGroups.get(vendor)?.length ?? 0
            return (
              <button
                key={vendor}
                type="button"
                data-testid={`model-provider-${vendor}`}
                onClick={() => setProviderFilter(vendor)}
                title={`${modelVendorLabel(vendor)} (${count})`}
                className={clsx(
                  'mx-1 mb-1 flex w-[calc(100%-8px)] flex-col items-center rounded-lg px-1 py-2 text-[10px] transition-colors',
                  providerFilter === vendor ? 'bg-primary/12 text-text-main' : 'text-text-secondary hover:bg-surface-hover'
                )}
              >
                <ProviderBrandIcon vendorKey={vendor} size={28} />
                <span className="mt-1 max-w-full truncate text-center leading-tight">
                  {modelVendorLabel(vendor).split(' ')[0]}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col min-h-0">
        {showUpgrade && onUpgradeClick && (
          <div className="shrink-0 flex items-center justify-between gap-2 border-b border-border bg-surface-hover/50 px-3 py-2">
            <p className="text-xs text-text-secondary">
              <span className="font-medium text-text-main">Unlock all models</span> on Pro
            </p>
            <button type="button" onClick={onUpgradeClick} className="btn-primary px-2.5 py-1 text-[11px]">
              Upgrade
            </button>
          </div>
        )}

        <div className="shrink-0 border-b border-border px-2 py-2">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-2">
            <Search size={14} className="shrink-0 text-text-muted" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search models…"
              data-testid="model-search-input"
              className="min-w-0 flex-1 bg-transparent py-1.5 text-xs text-text-main outline-none placeholder:text-text-muted"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {!providerFilter && !search && favoriteOptions.length > 0 && (
            <div className="mb-3">
              <div className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                Favorites
              </div>
              <div className="space-y-0.5">
                {favoriteOptions.map((option) => (
                  <ModelRow
                    key={`fav-${option.id}`}
                    option={option}
                    selected={option.id === value}
                    favorite={isFavoriteModel(option.id)}
                    onSelect={() => handleSelect(option.id)}
                    onToggleFavorite={() => handleToggleFavorite(option.id)}
                  />
                ))}
              </div>
            </div>
          )}

          <div className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
            {providerFilter ? modelVendorLabel(providerFilter) : 'All models'}
          </div>
          {filteredOptions.length === 0 ? (
            <p className="px-2 py-4 text-center text-xs text-text-secondary">No models match your search.</p>
          ) : (
            <div className="space-y-0.5">
              {filteredOptions.map((option) => (
                <ModelRow
                  key={option.id}
                  option={option}
                  selected={option.id === value}
                  favorite={favoriteIds.includes(option.id)}
                  onSelect={() => handleSelect(option.id)}
                  onToggleFavorite={() => handleToggleFavorite(option.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )

  const panel = open ? (
    <div
      data-testid="model-dropdown"
      style={usePortal ? panelStyle : undefined}
      className={clsx(
        'flex max-h-[min(72vh,440px)] overflow-hidden rounded-xl border border-border bg-surface shadow-lg',
        !usePortal && 'absolute top-full z-40 mt-1',
        !usePortal && (panelPosition === 'right' ? 'right-0' : 'left-0'),
        !usePortal && (compact ? 'w-[min(92vw,440px)]' : 'w-full min-w-[min(100%,520px)] max-w-[520px]')
      )}
    >
      {panelBody}
    </div>
  ) : null

  const portaledPanel = open && usePortal && panel ? createPortal(panel, document.body) : null

  return (
    <div
      ref={rootRef}
      data-testid="model-selector"
      className={clsx('relative min-w-0', compact ? 'min-w-[160px] max-w-[220px]' : 'w-full max-w-none', className)}
    >
      <button
        type="button"
        data-testid="model-selector-trigger"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        title={triggerLabel}
        className={clsx(
          'flex w-full items-center gap-1 rounded-lg border border-border bg-background text-text-main hover:bg-surface-hover disabled:opacity-60',
          compact ? 'px-2 py-1.5 text-xs' : 'px-3 py-2 text-sm'
        )}
      >
        <span className="min-w-0 flex-1 truncate text-left">{triggerLabel}</span>
        <ChevronDown size={compact ? 12 : 16} className={clsx('shrink-0 opacity-70 transition-transform', open && 'rotate-180')} />
      </button>
      {!usePortal && panel}
      {portaledPanel}
    </div>
  )
}
