import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Issue } from './useIssueStore'
import { appPersistStorage } from './app-persist-storage'

/**
 * The contribution pipeline: every issue the user engages with becomes a
 * tracked entry that survives restarts, so "claim → wait for assignment →
 * work → PR → wait for review → merged" has memory between sessions and
 * several contributions can be in flight at once.
 */
export type PipelineStage = 'claimed' | 'in_workspace' | 'pr_open' | 'merged' | 'closed'

export interface PipelineEntry {
  key: string
  issue: Issue
  stage: PipelineStage
  repoPath?: string
  prNumber?: number
  prUrl?: string
  claimUrl?: string
  /** Set by "Check status" when the maintainer assigned the user. */
  assignedToMe?: boolean
  updatedAt: number
}

interface PipelineState {
  entries: Record<string, PipelineEntry>
  upsert: (issue: Issue, patch: Partial<Omit<PipelineEntry, 'key' | 'issue' | 'updatedAt'>>) => void
  patch: (key: string, patch: Partial<Omit<PipelineEntry, 'key' | 'issue' | 'updatedAt'>>) => void
  remove: (key: string) => void
}

export const pipelineKey = (issue: Pick<Issue, 'number'> & { repository: { full_name: string } }): string =>
  `${issue.repository.full_name}#${issue.number}`

const STAGE_ORDER: Record<PipelineStage, number> = {
  claimed: 0,
  in_workspace: 1,
  pr_open: 2,
  merged: 3,
  closed: 3
}

export const usePipelineStore = create<PipelineState>()(
  persist(
    (set) => ({
      entries: {},
      upsert: (issue, patch) =>
        set((state) => {
          const key = pipelineKey(issue)
          const existing = state.entries[key]
          // Stages only move forward automatically; "Check status" may set
          // merged/closed explicitly via patch().
          const nextStage =
            patch.stage && (!existing || STAGE_ORDER[patch.stage] >= STAGE_ORDER[existing.stage])
              ? patch.stage
              : existing?.stage || patch.stage || 'claimed'
          return {
            entries: {
              ...state.entries,
              [key]: {
                ...(existing || { key, issue }),
                ...patch,
                issue,
                key,
                stage: nextStage,
                updatedAt: Date.now()
              }
            }
          }
        }),
      patch: (key, patch) =>
        set((state) => {
          const existing = state.entries[key]
          if (!existing) return state
          return {
            entries: {
              ...state.entries,
              [key]: { ...existing, ...patch, updatedAt: Date.now() }
            }
          }
        }),
      remove: (key) =>
        set((state) => {
          const entries = { ...state.entries }
          delete entries[key]
          return { entries }
        })
    }),
    { name: 'contribution-pipeline', storage: appPersistStorage }
  )
)
