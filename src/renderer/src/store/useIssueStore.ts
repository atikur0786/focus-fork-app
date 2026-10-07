import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { appPersistStorage } from './app-persist-storage'

export interface Issue {
  id: number
  number: number
  title: string
  body: string
  state: string
  html_url: string
  repository: {
    full_name: string
    name: string
    stars?: number
    forks?: number
    openIssues?: number
    openPRs?: number
    owner: {
      avatar_url: string
      login: string
    }
    primaryLanguage?: {
        name: string
        color: string
    } | null
  }
  labels: {
    id: number
    name: string
    color: string
  }[]
  created_at?: string
  updated_at?: string
  comments?: number
  assignees?: { login: string }[]
}

interface IssueState {
  selectedIssue: Issue | null
  activeIssues: Issue[]
  setSelectedIssue: (issue: Issue | null) => void
  addActiveIssue: (issue: Issue) => void
}

export const useIssueStore = create<IssueState>()(
  persist(
    (set, get) => ({
      selectedIssue: null,
      activeIssues: [],
      setSelectedIssue: (issue) => {
        set({ selectedIssue: issue })
        if (issue) {
            get().addActiveIssue(issue)
        }
      },
      addActiveIssue: (issue) => set((state) => {
          if (state.activeIssues.find(i => i.id === issue.id)) return state
          return { activeIssues: [issue, ...state.activeIssues] }
      })
    }),
    {
      name: 'issue-storage',
      storage: appPersistStorage
    }
  )
)
