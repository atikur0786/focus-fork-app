import { useEffect, useState } from 'react'
import { useUIStore } from '../store/useUIStore'
import type { ThemeMode } from '../lib/provider-logo-map'

/** Resolves UI store theme (including system) to light or dark. */
export function useResolvedTheme(): ThemeMode {
  const setting = useUIStore((state) => state.theme)
  const [systemDark, setSystemDark] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
  )

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => setSystemDark(media.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  if (setting === 'dark') return 'dark'
  if (setting === 'light') return 'light'
  return systemDark ? 'dark' : 'light'
}
