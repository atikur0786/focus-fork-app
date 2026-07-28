import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { View } from './useUIStore'

export type TabActivityStatus = 'idle' | 'working' | 'success' | 'error'

export interface TabActivity {
  status: TabActivityStatus
  message: string
  updatedAt: number
}

interface TabActivityState {
  byTab: Partial<Record<View, TabActivity>>
  setTabActivity: (tab: View, patch: Partial<TabActivity>) => void
  clearTabActivity: (tab: View) => void
}

export const useTabActivityStore = create<TabActivityState>()(
  persist(
    (set) => ({
      byTab: {},
      setTabActivity: (tab, patch) =>
        set((state) => {
          const current = state.byTab[tab]
          const next: TabActivity = {
            status: patch.status ?? current?.status ?? 'idle',
            message: patch.message ?? current?.message ?? '',
            updatedAt: patch.updatedAt ?? Date.now()
          }
          if (next.status === 'idle' && !patch.message) {
            const rest = { ...state.byTab }
            delete rest[tab]
            return { byTab: rest }
          }
          return {
            byTab: {
              ...state.byTab,
              [tab]: next
            }
          }
        }),
      clearTabActivity: (tab) =>
        set((state) => {
          const next = { ...state.byTab }
          delete next[tab]
          return { byTab: next }
        })
    }),
    {
      name: 'tab-activity-storage',
      partialize: (state) => ({
        byTab: Object.fromEntries(
          Object.entries(state.byTab).filter(([, activity]) => activity.status !== 'working')
        )
      })
    }
  )
)

export function getTabActivityLabel(_tab: View, activity?: TabActivity): string | null {
  if (!activity || activity.status === 'idle') return null
  if (activity.message.trim()) return activity.message.trim()
  if (activity.status === 'working') return 'In progress'
  if (activity.status === 'success') return 'Ready to continue'
  return 'Needs attention'
}
