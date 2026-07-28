import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface PersistedChatMessage {
  role: 'user' | 'model'
  content: string
  isError?: boolean
  errorCode?: string
  proposedEdits?: Array<{ relativePath: string; content: string }>
  editsApplied?: boolean
  attachments?: Array<{
    id: string
    kind: 'repo-file' | 'image' | 'file'
    label: string
    relativePath?: string
    mimeType?: string
    previewDataUrl?: string
  }>
  attachmentContextBlocks?: string[]
  retryUserMessageIndex?: number
  debugHint?: string
}

interface AIState {
  provider: string
  apiKey: string
  model: string
  conversationByRepo: Record<string, PersistedChatMessage[]>
  conversationMetaByRepo: Record<
    string,
    { label: string; updatedAt: number; issueNumber?: number; titleSource?: 'auto' | 'user' }
  >
  setConversationTitle: (sessionKey: string, label: string, source?: 'auto' | 'user') => void
  setProvider: (provider: string) => void
  setApiKey: (key: string) => void
  setModel: (model: string) => void
  saveConversation: (sessionKey: string, messages: PersistedChatMessage[], sessionLabel?: string, issueNumber?: number) => void
  getConversation: (sessionKey: string) => PersistedChatMessage[]
  getConversationKeys: () => string[]
  getConversationLabel: (sessionKey: string) => string
  clearConversation: (sessionKey: string) => void
}

export const useAIStore = create<AIState>()(
  persist(
    (set, get) => ({
      provider: 'openrouter',
      apiKey: '',
      model: 'meta-llama/llama-3.3-70b-instruct:free',
      conversationByRepo: {},
      conversationMetaByRepo: {},
      setProvider: (provider) => set({ provider }),
      setApiKey: (apiKey) => set({ apiKey }),
      setModel: (model) =>
        set({
          model: model === 'gemini-pro' ? 'deepseek/deepseek-r1:free' : model
        }),
      saveConversation: (sessionKey, messages, sessionLabel, issueNumber) => {
        set((state) => ({
          conversationByRepo: {
            ...state.conversationByRepo,
            [sessionKey]: messages.slice(-100)
          },
          conversationMetaByRepo: {
            ...state.conversationMetaByRepo,
            [sessionKey]: {
              ...state.conversationMetaByRepo[sessionKey],
              label: sessionLabel || state.conversationMetaByRepo[sessionKey]?.label || sessionKey,
              updatedAt: Date.now(),
              issueNumber: issueNumber ?? state.conversationMetaByRepo[sessionKey]?.issueNumber
            }
          }
        }))
        void import('../lib/chat-sync').then(({ scheduleThreadSync }) => scheduleThreadSync(sessionKey))
      },
      getConversation: (sessionKey) => get().conversationByRepo[sessionKey] || [],
      getConversationKeys: () =>
        Object.entries(get().conversationMetaByRepo)
          .sort((a, b) => b[1].updatedAt - a[1].updatedAt)
          .map(([sessionKey]) => sessionKey),
      getConversationLabel: (sessionKey) =>
        get().conversationMetaByRepo[sessionKey]?.label ||
        // Never surface raw internal session keys in the UI.
        (sessionKey.startsWith('global-chat:') ? 'New chat' : sessionKey),
      setConversationTitle: (sessionKey, label, source = 'user') => {
        const trimmed = label.trim()
        if (!trimmed || !sessionKey.trim()) return
        set((state) => {
          const existing = state.conversationMetaByRepo[sessionKey]
          if (source === 'auto' && existing?.titleSource === 'user') {
            return state
          }
          return {
            conversationMetaByRepo: {
              ...state.conversationMetaByRepo,
              [sessionKey]: {
                label: trimmed,
                updatedAt: Date.now(),
                issueNumber: existing?.issueNumber,
                titleSource: source
              }
            }
          }
        })
        void import('../lib/chat-sync').then(({ scheduleThreadSync }) => scheduleThreadSync(sessionKey))
      },
      clearConversation: (sessionKey) => {
        set((state) => {
          const next = { ...state.conversationByRepo }
          const nextMeta = { ...state.conversationMetaByRepo }
          delete next[sessionKey]
          delete nextMeta[sessionKey]
          return { conversationByRepo: next, conversationMetaByRepo: nextMeta }
        })
        void import('../lib/chat-sync').then(({ deleteThreadSync }) => deleteThreadSync(sessionKey))
      }
    }),
    {
      name: 'ai-storage',
      version: 6,
      // SECURITY: apiKey is intentionally excluded from persistence. Keys live
      // encrypted in the main process (Electron safeStorage), never in
      // localStorage. The in-memory apiKey field only carries a legacy key
      // during one-time migration (see App.tsx).
      partialize: (state) =>
        Object.fromEntries(
          Object.entries(state).filter(([key]) => key !== 'apiKey')
        ) as AIState,
      migrate: (persisted) => {
        const state = (persisted as Partial<AIState>) || {}
        let model = state.model || 'meta-llama/llama-3.3-70b-instruct:free'
        if (
          model === 'gemini-pro' ||
          model === 'openai/gpt-4o-mini' ||
          model === 'deepseek/deepseek-r1:free'
        ) {
          model = 'meta-llama/llama-3.3-70b-instruct:free'
        }
        return {
          provider: state.provider || 'openrouter',
          // Carried in-memory only so App.tsx can migrate it to secure storage.
          apiKey: state.apiKey || '',
          model,
          conversationByRepo: state.conversationByRepo || {},
          conversationMetaByRepo: state.conversationMetaByRepo || {}
        }
      }
    }
  )
)
