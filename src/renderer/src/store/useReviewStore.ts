import { create } from 'zustand'
import type { AgentContext } from '../agents/agent-context'
import { codeReviewAgent, type ReviewFinding, type ReviewResult } from '../agents/code-review-agent'

export type ReviewStatus = 'idle' | 'reviewing' | 'done' | 'error'

interface ReviewState {
  findings: ReviewFinding[]
  reviewStatus: ReviewStatus
  lastReviewedAt: string | null
  reviewError: string | null
  reviewSummary: string | null
  reviewModel: string | null

  runReview: (repoPath: string, ctx: AgentContext) => Promise<ReviewResult>
  acknowledgeFinding: (findingId: string) => void
  acknowledgeAll: () => void
  dismissFinding: (findingId: string) => void
  clearReview: () => void
}

export const useReviewStore = create<ReviewState>((set) => ({
  findings: [],
  reviewStatus: 'idle',
  lastReviewedAt: null,
  reviewError: null,
  reviewSummary: null,
  reviewModel: null,

  runReview: async (repoPath: string, ctx: AgentContext): Promise<ReviewResult> => {
    set({ reviewStatus: 'reviewing', reviewError: null })

    try {
      const diff = await window.api.git.diff(repoPath)

      if (!diff.trim()) {
        const stagedDiff = await window.api.git.diff(repoPath, true)
        if (!stagedDiff.trim()) {
          const result: ReviewResult = {
            findings: [],
            summary: 'No changes to review.',
            reviewedAt: new Date().toISOString(),
            model: ctx.selectedModelId
          }
          set({
            findings: [],
            reviewStatus: 'done',
            lastReviewedAt: result.reviewedAt,
            reviewSummary: result.summary,
            reviewModel: result.model
          })
          return result
        }
        const result = await codeReviewAgent.reviewDiff(ctx, stagedDiff)
        set({
          findings: result.findings,
          reviewStatus: 'done',
          lastReviewedAt: result.reviewedAt,
          reviewSummary: result.summary,
          reviewModel: result.model
        })
        return result
      }

      const result = await codeReviewAgent.reviewDiff(ctx, diff)
      set({
        findings: result.findings,
        reviewStatus: 'done',
        lastReviewedAt: result.reviewedAt,
        reviewSummary: result.summary,
        reviewModel: result.model
      })
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Review failed'
      set({ reviewStatus: 'error', reviewError: message })
      throw error
    }
  },

  acknowledgeFinding: (findingId: string) => {
    set((state) => ({
      findings: state.findings.map((f) =>
        f.id === findingId ? { ...f, acknowledged: true } : f
      )
    }))
  },

  acknowledgeAll: () => {
    set((state) => ({
      findings: state.findings.map((f) => ({ ...f, acknowledged: true }))
    }))
  },

  dismissFinding: (findingId: string) => {
    set((state) => ({
      findings: state.findings.filter((f) => f.id !== findingId)
    }))
  },

  clearReview: () => {
    set({
      findings: [],
      reviewStatus: 'idle',
      lastReviewedAt: null,
      reviewError: null,
      reviewSummary: null,
      reviewModel: null
    })
  }
}))

export const selectCanCommit = (state: ReviewState): boolean => {
  if (state.reviewStatus === 'idle') return false
  if (state.reviewStatus === 'reviewing') return false
  if (state.reviewStatus === 'error') return false
  const blocking = state.findings.filter(
    (f) => (f.severity === 'critical' || f.severity === 'warning') && !f.acknowledged
  )
  return blocking.length === 0
}

export const selectBlockingCount = (state: ReviewState): number => {
  return state.findings.filter(
    (f) => (f.severity === 'critical' || f.severity === 'warning') && !f.acknowledged
  ).length
}

export const selectAcknowledgedCount = (state: ReviewState): number => {
  return state.findings.filter((f) => f.acknowledged).length
}

export const selectFindingsBySeverity = (state: ReviewState) => {
  const critical = state.findings.filter((f) => f.severity === 'critical')
  const warning = state.findings.filter((f) => f.severity === 'warning')
  const suggestion = state.findings.filter((f) => f.severity === 'suggestion')
  return { critical, warning, suggestion }
}
