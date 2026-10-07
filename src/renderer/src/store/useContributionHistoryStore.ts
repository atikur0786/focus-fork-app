import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { appPersistStorage } from './app-persist-storage'

export interface LocalContributionEvent {
  id: string
  created_at: string
  repo_owner: string
  repo_name: string
  issue_number?: number
  pr_number?: number
  event_type: string
  metadata?: Record<string, unknown>
}

interface ContributionHistoryState {
  events: LocalContributionEvent[]
  record: (event: Omit<LocalContributionEvent, 'id' | 'created_at'>) => void
  clear: () => void
}

const MAX_LOCAL_EVENTS = 500

/**
 * Local-first contribution history. Every workflow event is stored on this
 * machine so the History page works with no account and no backend; backend
 * sync (when subscribed) is additive, never required.
 */
export const useContributionHistoryStore = create<ContributionHistoryState>()(
  persist(
    (set) => ({
      events: [],
      record: (event) =>
        set((state) => ({
          events: [
            {
              ...event,
              id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              created_at: new Date().toISOString()
            },
            ...state.events
          ].slice(0, MAX_LOCAL_EVENTS)
        })),
      clear: () => set({ events: [] })
    }),
    { name: 'contribution-history', storage: appPersistStorage }
  )
)

/**
 * Record locally (always succeeds) and mirror to the backend when a session
 * exists. Call this instead of window.api.platform.addContribution directly.
 */
export const trackContributionEvent = (
  event: Omit<LocalContributionEvent, 'id' | 'created_at'>
): void => {
  useContributionHistoryStore.getState().record(event)
  void window.api.platform
    .addContribution({
      repoOwner: event.repo_owner,
      repoName: event.repo_name,
      issueNumber: event.issue_number,
      prNumber: event.pr_number,
      eventType: event.event_type,
      metadata: event.metadata
    })
    .catch(() => {
      // Backend sync is best-effort; local history is the source of truth.
    })
}
