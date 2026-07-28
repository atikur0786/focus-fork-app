import { create } from 'zustand'

export type AIMode = 'byok' | 'subscription'

interface AIModeState {
  mode: AIMode
  hasKey: boolean
  provider: string
  model: string
  loaded: boolean
  refresh: () => Promise<void>
  setModeLocal: (mode: AIMode) => void
  setHasKeyLocal: (hasKey: boolean) => void
}

/**
 * Mirrors the main-process AI config (mode + whether a BYOK key is stored)
 * so any component can render mode-aware UI. Source of truth stays in the
 * main process; call refresh() to sync.
 */
export const useAIModeStore = create<AIModeState>((set) => ({
  mode: 'byok',
  hasKey: false,
  provider: '',
  model: '',
  loaded: false,
  refresh: async () => {
    try {
      const config = await window.api.ai.getConfig()
      set({
        mode: config.mode === 'subscription' ? 'subscription' : 'byok',
        hasKey: !!config.hasKey,
        provider: config.provider || '',
        model: config.model || '',
        loaded: true
      })
    } catch {
      set({ loaded: true })
    }
  },
  setModeLocal: (mode) => set({ mode }),
  setHasKeyLocal: (hasKey) => set({ hasKey })
}))
