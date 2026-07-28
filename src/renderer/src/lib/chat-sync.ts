import { isGlobalChatSessionKey } from './workspace-session'
import { useAIStore, type PersistedChatMessage } from '../store/useAIStore'

type RemoteChatThread = {
  client_key: string
  title?: string
  thread_kind?: string
  repo_owner?: string
  repo_name?: string
  issue_number?: number | null
  updated_at?: string
  messages?: Array<{
    seq: number
    role: string
    content: string
    metadata?: Record<string, unknown>
  }>
}

const SYNC_DEBOUNCE_MS = 900
const SYNC_FAILURE_COOLDOWN_MS = 60_000
const pendingSyncTimers = new Map<string, ReturnType<typeof setTimeout>>()
let fullSyncPromise: Promise<void> | null = null
let lastSyncFailedAt = 0

function parseUpdatedAt(value?: string): number {
  if (!value) return 0
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function threadKindFromSessionKey(sessionKey: string): string {
  return isGlobalChatSessionKey(sessionKey) ? 'general' : 'workspace'
}

function parseWorkspaceFields(sessionKey: string): {
  repoOwner?: string
  repoName?: string
  issueNumber?: number
} {
  const issueMatch = sessionKey.match(/^(.+?)#issue-(\d+)$/)
  if (issueMatch) {
    const repoPath = issueMatch[1]
    const slash = repoPath.lastIndexOf('/')
    if (slash > 0) {
      return {
        repoOwner: repoPath.slice(0, slash),
        repoName: repoPath.slice(slash + 1),
        issueNumber: Number(issueMatch[2])
      }
    }
  }
  const slash = sessionKey.lastIndexOf('/')
  if (slash > 0) {
    return {
      repoOwner: sessionKey.slice(0, slash),
      repoName: sessionKey.slice(slash + 1)
    }
  }
  return {}
}

function normalizeRole(role: string): 'user' | 'model' {
  if (role === 'assistant' || role === 'model') return 'model'
  return 'user'
}

function messageFromRemote(entry: NonNullable<RemoteChatThread['messages']>[number]): PersistedChatMessage {
  const metadata = entry.metadata || {}
  const message: PersistedChatMessage = {
    role: normalizeRole(entry.role),
    content: entry.content || ''
  }
  if (typeof metadata.isError === 'boolean') message.isError = metadata.isError
  if (typeof metadata.errorCode === 'string') message.errorCode = metadata.errorCode
  if (typeof metadata.debugHint === 'string') message.debugHint = metadata.debugHint
  if (typeof metadata.editsApplied === 'boolean') message.editsApplied = metadata.editsApplied
  if (typeof metadata.retryUserMessageIndex === 'number') {
    message.retryUserMessageIndex = metadata.retryUserMessageIndex
  }
  if (Array.isArray(metadata.proposedEdits)) {
    message.proposedEdits = metadata.proposedEdits as PersistedChatMessage['proposedEdits']
  }
  if (Array.isArray(metadata.attachments)) {
    message.attachments = metadata.attachments as PersistedChatMessage['attachments']
  }
  if (Array.isArray(metadata.attachmentContextBlocks)) {
    message.attachmentContextBlocks = metadata.attachmentContextBlocks as string[]
  }
  return message
}

function messageToRemote(message: PersistedChatMessage, seq: number) {
  const metadata: Record<string, unknown> = {}
  if (message.isError) metadata.isError = message.isError
  if (message.errorCode) metadata.errorCode = message.errorCode
  if (message.debugHint) metadata.debugHint = message.debugHint
  if (message.editsApplied) metadata.editsApplied = message.editsApplied
  if (message.retryUserMessageIndex !== undefined) {
    metadata.retryUserMessageIndex = message.retryUserMessageIndex
  }
  if (message.proposedEdits?.length) metadata.proposedEdits = message.proposedEdits
  if (message.attachments?.length) metadata.attachments = message.attachments
  if (message.attachmentContextBlocks?.length) {
    metadata.attachmentContextBlocks = message.attachmentContextBlocks
  }
  return {
    seq,
    role: message.role,
    content: message.content,
    metadata
  }
}

function buildThreadPayload(sessionKey: string): {
  title: string
  thread_kind: string
  repo_owner: string
  repo_name: string
  issue_number?: number
  updated_at: string
  messages: ReturnType<typeof messageToRemote>[]
} {
  const state = useAIStore.getState()
  const messages = state.getConversation(sessionKey)
  const meta = state.conversationMetaByRepo[sessionKey]
  const workspace = parseWorkspaceFields(sessionKey)
  return {
    title: meta?.label || sessionKey,
    thread_kind: threadKindFromSessionKey(sessionKey),
    repo_owner: workspace.repoOwner || '',
    repo_name: workspace.repoName || '',
    issue_number: workspace.issueNumber ?? meta?.issueNumber,
    updated_at: new Date(meta?.updatedAt || Date.now()).toISOString(),
    messages: messages.map((message, index) => messageToRemote(message, index))
  }
}

async function pushThread(sessionKey: string): Promise<void> {
  try {
    const status = await window.api.platform.status()
    if (!status.enabled || !status.connected) return
    await window.api.platform.upsertChatThread(sessionKey, buildThreadPayload(sessionKey))
  } catch (error) {
    console.warn('[FocusFork Chat Sync] Failed to push thread', sessionKey, error)
  }
}

export function scheduleThreadSync(sessionKey: string): void {
  const existing = pendingSyncTimers.get(sessionKey)
  if (existing) clearTimeout(existing)
  pendingSyncTimers.set(
    sessionKey,
    setTimeout(() => {
      pendingSyncTimers.delete(sessionKey)
      void pushThread(sessionKey)
    }, SYNC_DEBOUNCE_MS)
  )
}

export async function deleteThreadSync(sessionKey: string): Promise<void> {
  const existing = pendingSyncTimers.get(sessionKey)
  if (existing) {
    clearTimeout(existing)
    pendingSyncTimers.delete(sessionKey)
  }
  try {
    const status = await window.api.platform.status()
    if (!status.enabled || !status.connected) return
    await window.api.platform.deleteChatThread(sessionKey)
  } catch (error) {
    console.warn('[FocusFork Chat Sync] Failed to delete thread', sessionKey, error)
  }
}

function applyRemoteThread(thread: RemoteChatThread): void {
  const sessionKey = thread.client_key
  if (!sessionKey) return

  const state = useAIStore.getState()
  const localUpdated = state.conversationMetaByRepo[sessionKey]?.updatedAt ?? 0
  const remoteUpdated = parseUpdatedAt(thread.updated_at)
  if (localUpdated > remoteUpdated) {
    void pushThread(sessionKey)
    return
  }

  const messages = (thread.messages || [])
    .slice()
    .sort((a, b) => a.seq - b.seq)
    .map(messageFromRemote)

  useAIStore.setState((current) => ({
    conversationByRepo: {
      ...current.conversationByRepo,
      [sessionKey]: messages
    },
    conversationMetaByRepo: {
      ...current.conversationMetaByRepo,
      [sessionKey]: {
        label: thread.title || current.conversationMetaByRepo[sessionKey]?.label || sessionKey,
        updatedAt: remoteUpdated || Date.now(),
        issueNumber:
          thread.issue_number ?? current.conversationMetaByRepo[sessionKey]?.issueNumber
      }
    }
  }))
}

export async function syncChatHistoryFromBackend(): Promise<void> {
  if (fullSyncPromise) return fullSyncPromise
  if (Date.now() - lastSyncFailedAt < SYNC_FAILURE_COOLDOWN_MS) return

  fullSyncPromise = (async () => {
    try {
      const status = await window.api.platform.status()
      if (!status.enabled || !status.connected) return

      const response = await window.api.platform.listChatThreads(500)
      const items = Array.isArray(response?.items) ? (response.items as RemoteChatThread[]) : []

      for (const thread of items) {
        applyRemoteThread(thread)
      }

      const state = useAIStore.getState()
      const localKeys = Object.keys(state.conversationMetaByRepo)
      const remoteKeys = new Set(items.map((thread) => thread.client_key))
      for (const sessionKey of localKeys) {
        const localUpdated = state.conversationMetaByRepo[sessionKey]?.updatedAt ?? 0
        const remote = items.find((thread) => thread.client_key === sessionKey)
        const remoteUpdated = parseUpdatedAt(remote?.updated_at)
        if (!remoteKeys.has(sessionKey) || localUpdated > remoteUpdated) {
          await pushThread(sessionKey)
        }
      }
    } catch (error) {
      lastSyncFailedAt = Date.now()
      console.warn('[FocusFork Chat Sync] Failed to pull chat history', error)
    } finally {
      fullSyncPromise = null
    }
  })()

  return fullSyncPromise
}
