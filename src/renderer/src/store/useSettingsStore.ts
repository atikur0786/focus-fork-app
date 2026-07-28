import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface SettingsState {
  workspaceRoot: string | null
  activeRepoPath: string | null
  preferredEditorId: string | null
  setWorkspaceRoot: (path: string) => void
  setActiveRepoPath: (path: string | null) => void
  setPreferredEditorId: (editorId: string | null) => void
  selectWorkspaceRoot: () => Promise<void>
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      workspaceRoot: null,
      activeRepoPath: null,
      preferredEditorId: null,
      setWorkspaceRoot: (path) => set({ workspaceRoot: path }),
      setActiveRepoPath: (path) => set({ activeRepoPath: path }),
      setPreferredEditorId: (editorId) => set({ preferredEditorId: editorId }),
      selectWorkspaceRoot: async () => {
        try {
          const path = await window.api.fs.selectDir()
          if (path) {
            set({ workspaceRoot: path })
          }
        } catch (error) {
          console.error('Failed to select workspace:', error)
        }
      }
    }),
    {
      name: 'settings-storage',
      version: 2,
      migrate: (persistedState: unknown) => {
        const state = (persistedState ?? {}) as Record<string, unknown>
        if (state.workspacePath && !state.workspaceRoot) {
          return {
            ...state,
            workspaceRoot: state.workspacePath as string,
            activeRepoPath: (state.activeRepoPath as string | null | undefined) ?? null,
            preferredEditorId: (state.preferredEditorId as string | null | undefined) ?? null
          }
        }
        return {
          ...state,
          preferredEditorId: (state.preferredEditorId as string | null | undefined) ?? null
        } as SettingsState
      }
    }
  )
)
