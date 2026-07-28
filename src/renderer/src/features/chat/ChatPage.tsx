import { useEffect, useMemo, useState } from 'react'
import { KeyRound, PanelLeftClose, PanelLeftOpen, Trash2 } from 'lucide-react'
import clsx from 'clsx'
import { AIChatPanel } from '../../components/AIChatPanel'
import { ApprovalGate } from '../../components/ApprovalGate'
import { useAIStore } from '../../store/useAIStore'
import { useAIModeStore } from '../../store/useAIModeStore'
import { useAuthStore } from '../../store/useAuthStore'
import { useUIStore } from '../../store/useUIStore'
import {
  GLOBAL_CHAT_PREFIX,
  buildGlobalChatSessionKey,
  isGlobalChatSessionKey,
  listGlobalChatSessionKeys
} from '../../lib/workspace-session'

function defaultGlobalSessionKey(): string {
  return buildGlobalChatSessionKey('default')
}

function createEmptyChat(): string {
  const key = buildGlobalChatSessionKey()
  useAIStore.getState().saveConversation(key, [], 'New chat')
  return key
}

export function ChatPage(): React.JSX.Element {
  const conversationMetaByRepo = useAIStore((state) => state.conversationMetaByRepo)
  const { getConversationKeys, getConversationLabel, clearConversation, setConversationTitle } = useAIStore()
  const { mode: aiMode, hasKey, refresh: refreshAIMode } = useAIModeStore()
  const backendConnected = useAuthStore((state) => state.backendConnected)
  const setView = useUIStore((state) => state.setView)
  const [activeSessionKey, setActiveSessionKey] = useState(() => {
    const globalKeys = listGlobalChatSessionKeys(getConversationKeys())
    return globalKeys[0] || defaultGlobalSessionKey()
  })
  const [pendingDeleteKey, setPendingDeleteKey] = useState<string | null>(null)
  const [renamingKey, setRenamingKey] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(true)

  useEffect(() => {
    void refreshAIMode()
  }, [refreshAIMode])

  const aiNotConfigured = aiMode === 'byok' ? !hasKey : !backendConnected

  const globalSessions = useMemo(
    () =>
      listGlobalChatSessionKeys(
        Object.keys(conversationMetaByRepo).sort(
          (a, b) => (conversationMetaByRepo[b]?.updatedAt ?? 0) - (conversationMetaByRepo[a]?.updatedAt ?? 0)
        )
      ),
    [conversationMetaByRepo]
  )

  // Note: an empty session list is fine — the panel shows a fresh chat for
  // activeSessionKey, and it only appears in the list once a message is sent.

  const handleNewChat = () => {
    const key = createEmptyChat()
    setActiveSessionKey(key)
    setRenamingKey(null)
  }

  const requestDeleteChat = (key: string) => {
    if (!isGlobalChatSessionKey(key)) return
    setPendingDeleteKey(key)
  }

  const confirmDeleteChat = () => {
    if (!pendingDeleteKey || !isGlobalChatSessionKey(pendingDeleteKey)) {
      setPendingDeleteKey(null)
      return
    }

    const key = pendingDeleteKey
    clearConversation(key)
    setPendingDeleteKey(null)
    setRenamingKey(null)

    const remaining = listGlobalChatSessionKeys(getConversationKeys().filter((entry) => entry !== key))
    if (key === activeSessionKey) {
      // Deleting the last chat leaves the list empty and opens a fresh,
      // unsaved chat — it is only persisted once a message is sent.
      setActiveSessionKey(remaining[0] || buildGlobalChatSessionKey())
    }
  }

  const startRename = (key: string) => {
    setRenamingKey(key)
    setRenameDraft(getConversationLabel(key))
  }

  const commitRename = () => {
    if (!renamingKey) return
    const trimmed = renameDraft.trim()
    if (trimmed) {
      setConversationTitle(renamingKey, trimmed, 'user')
    }
    setRenamingKey(null)
    setRenameDraft('')
  }

  const cancelRename = () => {
    setRenamingKey(null)
    setRenameDraft('')
  }

  const sessionItems = globalSessions

  const pendingDeleteLabel = pendingDeleteKey ? getConversationLabel(pendingDeleteKey) : 'this chat'

  return (
    <div data-testid="chat-page" className="flex h-full min-h-0 bg-background">
      {/* Left rail — collapsible */}
      <aside
        className={clsx(
          'flex shrink-0 flex-col border-r border-border transition-all',
          sidebarOpen ? 'w-[280px]' : 'w-[52px]'
        )}
      >
        <div className={clsx('shrink-0 pt-4 pb-3', sidebarOpen ? 'px-4' : 'px-2')}>
          <div className="mb-1 flex items-center justify-between gap-2">
            {sidebarOpen && <div className="text-[15px] font-semibold">Chat</div>}
            <button
              type="button"
              data-testid="chat-sidebar-toggle"
              aria-label={sidebarOpen ? 'Collapse chat list' : 'Expand chat list'}
              onClick={() => setSidebarOpen((open) => !open)}
              className="rounded-md p-1.5 text-text-muted hover:bg-surface-hover hover:text-text-main transition-colors"
            >
              {sidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
            </button>
          </div>
          {sidebarOpen && (
            <>
              <div className="text-[12px] text-text-muted leading-relaxed mb-3.5">
                Day-to-day help, separate from workspace contributions. Conversations are stored on this
                device.
              </div>
              <button
                type="button"
                data-testid="chat-new-btn"
                onClick={handleNewChat}
                className="w-full btn-primary text-[13.5px] py-2.5"
              >
                + New chat
              </button>
            </>
          )}
        </div>
        {!sidebarOpen && (
          <button
            type="button"
            onClick={handleNewChat}
            aria-label="New chat"
            className="mx-2 rounded-md border border-border py-2 text-[15px] font-semibold text-text-secondary hover:bg-surface-hover hover:text-text-main transition-colors"
          >
            +
          </button>
        )}

        <div
          data-testid="chat-session-list"
          className={clsx('min-h-0 flex-1 overflow-y-auto pb-2.5', sidebarOpen ? 'px-2.5' : 'hidden')}
        >
          {globalSessions.length === 0 && (
            <div className="px-3 py-6 text-center text-[12.5px] text-text-muted">
              No conversations yet. Send a message and it will appear here.
            </div>
          )}
          {sessionItems.map((key) => {
            const label = getConversationLabel(key)
            const meta = conversationMetaByRepo[key]
            const active = key === activeSessionKey
            const isRenaming = renamingKey === key
            const timeStr = meta?.updatedAt
              ? new Date(meta.updatedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
              : ''
            return (
              <div
                key={key}
                className={clsx(
                  'group mb-0.5 flex items-center justify-between gap-1.5 rounded-[8px] transition-colors',
                  active ? 'bg-card-muted' : 'hover:bg-surface-hover'
                )}
              >
                {isRenaming ? (
                  <input
                    data-testid={`chat-rename-input-${key.replace(GLOBAL_CHAT_PREFIX, '')}`}
                    value={renameDraft}
                    onChange={(event) => setRenameDraft(event.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        commitRename()
                      }
                      if (event.key === 'Escape') {
                        event.preventDefault()
                        cancelRename()
                      }
                    }}
                    autoFocus
                    className="min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-2 text-[12px] text-text-main outline-none focus:ring-2 focus:ring-primary/15"
                  />
                ) : (
                  <button
                    type="button"
                    data-testid={`chat-session-${key.replace(GLOBAL_CHAT_PREFIX, '')}`}
                    onClick={() => setActiveSessionKey(key)}
                    onDoubleClick={() => startRename(key)}
                    className="min-w-0 flex-1 px-2.5 py-2.5 text-left"
                    title="Double-click to rename"
                  >
                    <div className="text-[13px] font-medium text-text-main truncate">{label}</div>
                    {timeStr && <div className="text-[11px] text-text-muted mt-0.5">{timeStr}</div>}
                  </button>
                )}
                {!isRenaming && (
                  <button
                    type="button"
                    data-testid={`chat-delete-btn-${key.replace(GLOBAL_CHAT_PREFIX, '')}`}
                    aria-label={`Delete ${label}`}
                    onClick={() => requestDeleteChat(key)}
                    className={clsx(
                      'mr-1.5 rounded-md p-1 text-text-muted hover:text-danger transition-opacity shrink-0',
                      active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                    )}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        {aiNotConfigured && (
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-active/30 bg-active-soft px-4 py-2.5 text-[12.5px] text-active-text">
            <span className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 shrink-0" />
              {aiMode === 'byok'
                ? 'Chat runs on your own API key — free, no account needed. Add an OpenRouter or Gemini key to start.'
                : 'Subscription mode is selected but not connected. Reconnect, or switch to your own API key.'}
            </span>
            <button
              type="button"
              data-testid="chat-configure-ai-btn"
              onClick={() => setView('settings')}
              className="btn-primary shrink-0 px-3 py-1.5 text-[12px]"
            >
              Open Settings
            </button>
          </div>
        )}
        <div className="min-h-0 flex-1">
          <AIChatPanel
            key={activeSessionKey}
            variant="general"
            sessionKey={activeSessionKey}
            sessionLabel={getConversationLabel(activeSessionKey)}
            context="Standalone FocusFork chat for everyday questions and productivity."
            title="FocusFork Chat"
          />
        </div>
      </main>

      <ApprovalGate
        isOpen={pendingDeleteKey !== null}
        actionLabel={`Delete "${pendingDeleteLabel}"?`}
        description="This permanently removes the chat and its messages from this device and your synced account history."
        onApprove={confirmDeleteChat}
        onReject={() => setPendingDeleteKey(null)}
      />
    </div>
  )
}
