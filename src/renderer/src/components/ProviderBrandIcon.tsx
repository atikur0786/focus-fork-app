import clsx from 'clsx'
import { Layers } from 'lucide-react'
import { modelVendorLabel } from '../lib/model-catalog'
import { PROVIDER_LOGO_MAP, resolveLogoSrc } from '../lib/provider-logo-map'
import { useResolvedTheme } from '../hooks/useResolvedTheme'

type ProviderBrandIconProps = {
  vendorKey: string
  size?: number
  className?: string
}

/** Brand mark for model vendor rail — logos from https://svgl.app */
export function ProviderBrandIcon({ vendorKey, size = 28, className }: ProviderBrandIconProps): React.JSX.Element {
  const theme = useResolvedTheme()
  const key = vendorKey === 'all' ? 'all' : vendorKey.trim().toLowerCase()
  const asset = key === 'all' ? undefined : PROVIDER_LOGO_MAP[key]
  const label = key === 'all' ? 'All providers' : modelVendorLabel(key)

  return (
    <span
      className={clsx(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-surface p-0.5',
        className
      )}
      style={{ width: size, height: size }}
      title={label}
      aria-hidden
    >
      {key === 'all' ? (
        <Layers size={Math.max(12, size - 12)} className="text-text-secondary" strokeWidth={2} />
      ) : asset ? (
        <img
          src={resolveLogoSrc(asset, theme)}
          alt=""
          className="h-full w-full object-contain"
          draggable={false}
        />
      ) : (
        <span className="text-[10px] font-bold uppercase text-text-muted">{key.slice(0, 2)}</span>
      )}
    </span>
  )
}
