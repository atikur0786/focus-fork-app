import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type View = 'issues' | 'settings' | 'contributions' | 'usage' | 'ide' | 'chat'

interface UIState {
  currentView: View
  theme: 'light' | 'dark' | 'system'
  sidebarCollapsed: boolean
  setView: (view: View) => void
  setTheme: (theme: 'light' | 'dark' | 'system') => void
  toggleSidebar: () => void
  setSidebarCollapsed: (collapsed: boolean) => void
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      currentView: 'issues',
      theme: 'system',
      sidebarCollapsed: false,
      setView: (view) => set({ currentView: view }),
      setTheme: (theme) => set({ theme }),
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed })
    }),
    {
      name: 'ui-storage',
      version: 3,
      migrate: (persistedState: any, version: number) => {
        const allowed: View[] = ['issues', 'settings', 'contributions', 'usage', 'ide', 'chat']
        const saved = persistedState?.currentView as View | undefined
        if (version < 3) {
          return {
            currentView: saved && allowed.includes(saved) ? saved : 'issues',
            sidebarCollapsed: false
          }
        }
        return {
          currentView: saved && allowed.includes(saved) ? saved : 'issues',
          sidebarCollapsed: !!persistedState?.sidebarCollapsed
        }
      },
      partialize: (state) => ({
        currentView: state.currentView,
        sidebarCollapsed: state.sidebarCollapsed,
        theme: state.theme
      })
    }
  )
)
