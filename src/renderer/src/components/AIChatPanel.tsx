import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, FileText, History, User } from 'lucide-react'
import focusforkIcon from '../../../../resources/icon.png'
import { AgentComposer, type AgentQuickAction } from './agent/AgentComposer'
import { useAIStore } from '../store/useAIStore'
import { useTabActivityStore } from '../store/useTabActivityStore'
import { useManagedModelCatalog } from '../hooks/useManagedModelCatalog'
import { formatRepoPathContext, loadRepoRelativePaths, resolveProposedEditsPaths } from '../lib/repo-file-index'
import { isAiFailure, humanizeAiChatResult, isRetriableAiError, type AiErrorCode } from '../lib/ai-errors'
import { humanizeError } from '../lib/user-errors'
import {
  FOCUSFORK_THINKING_LABEL,
  isGlobalChatSessionKey,
  sessionMatchesWorkspace
} from '../lib/workspace-session'
import {
  toPersistedAttachmentMeta,
  type ChatAttachmentMeta,
  type ComposerAttachment
} from '../lib/chat-attachments'
import {
  FOCUSFORK_CODING_SYSTEM,
  FOCUSFORK_GENERAL_SYSTEM,
  parseProposedEdits,
  resolveRepoFilePath,
  stripEditBlocksFromDisplay,
  summarizeProposedEdits,
  type ProposedFileEdit
} from '../lib/ai-code-edits'
import { prepareAiChatPayload } from '../lib/ai-chat-request'
import { useReviewStore } from '../store/useReviewStore'
import { defaultContext } from '../agents/agent-context'
import { getComposerLimitState } from '../lib/ai-session-limits'
import {
  buildRetryConversation,
  isPersistedAiErrorMessage,
  resolveRetryUserMessageIndex,
  stripAuthFailedErrors
} from '../lib/chat-retry'
import { useUIStore, type View } from '../store/useUIStore'
import { useAuthStore } from '../store/useAuthStore'
import { deriveChatTitleFromText, generateChatTitleWithAI } from '../lib/chat-title'
import { AiErrorNotice } from './AiErrorNotice'
import { ChatMarkdown } from './ChatMarkdown'
import { ApprovalGate } from './ApprovalGate'
import { AgentProposedChanges, type ApplyProgressState } from './agent/AgentProposedChanges'
import { EditApprovalReview } from './agent/EditApprovalReview'
import { ModelSelector } from './ModelSelector'

interface ChatMessage {
  role: 'user' | 'model'
  content: string
  errorCode?: AiErrorCode
  isError?: boolean
  proposedEdits?: ProposedFileEdit[]
  editsApplied?: boolean
  attachments?: ChatAttachmentMeta[]
  attachmentContextBlocks?: string[]
  retryUserMessageIndex?: number
  debugHint?: string
}

type AIChatVariant = 'workspace' | 'general'

interface AIChatPanelProps {
  variant?: AIChatVariant
  sessionKey: string
  sessionLabel?: string
  issueNumber?: number
  context: string
  title?: string
  issueTitle?: string
  issueBody?: string
  branchName?: string
  upstreamRepoFullName?: string | null
  repoFullName?: string | null
  repoPath?: string | null
  currentFilePath?: string | null
  repoRootPath?: string | null
  currentFileContent?: string | null
  openTabContents?: Record<string, string>
  onRepositoryChanged?: () => void | Promise<void>
  onSessionActivity?: (message: string, level?: 'info' | 'success' | 'error') => void
  onPreviewProposedFile?: (relativePath: string, proposedContent: string) => void | Promise<void>
  onOpenInIde?: () => void
}

const WORKSPACE_STARTER_PROMPTS = [
  'Summarize this issue and the fastest path to a PR',
  'Find the files most likely involved and inspect them',
  'Implement the fix and propose the exact file edits',
  'Draft a conventional commit message and PR description'
]

const GENERAL_STARTER_PROMPTS = [
  'Help me plan my day and prioritize tasks',
  'Explain a technical concept in simple terms',
  'Review and improve this draft',
  'Brainstorm ideas for a side project'
]

function relativePathFromRoot(repoRootPath: string | null | undefined, absolutePath: string | null | undefined): string | null {
  if (!repoRootPath || !absolutePath) return null
  const root = repoRootPath.replace(/\/$/, '')
  if (absolutePath === root) return '.'
  if (absolutePath.startsWith(`${root}/`)) {
    return absolutePath.slice(root.length + 1)
  }
  return absolutePath
}

function FocusForkAvatar(): React.JSX.Element {
  return (
    <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface border border-border shadow-sm">
      <img src={focusforkIcon} alt="FocusFork" className="h-4 w-4 object-contain" />
    </div>
  )
}

function MessageAttachments({ attachments }: { attachments: ChatAttachmentMeta[] }): React.JSX.Element {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {attachments.map((attachment) => (
        <div
          key={attachment.id}
          className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-primary-foreground/15 bg-primary-foreground/10 px-2 py-1 text-[11px]"
        >
          {attachment.kind === 'image' && attachment.previewDataUrl ? (
            <img src={attachment.previewDataUrl} alt="" className="h-5 w-5 rounded object-cover" />
          ) : (
            <FileText size={12} className="opacity-80" />
          )}
          <span className="truncate">{attachment.label}</span>
        </div>
      ))}
    </div>
  )
}

function isErrorMessage(message: ChatMessage): boolean {
  return isPersistedAiErrorMessage(message)
}

function inferErrorCode(message: ChatMessage): AiErrorCode | undefined {
  if (message.errorCode) return message.errorCode
  if (/too many ai requests|rate limit/i.test(message.content)) return 'RATE_LIMITED'
  if (/lost connection|timed out|network/i.test(message.content)) return 'NETWORK_ERROR'
  return undefined
}

function enrichMessagesForRetry(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((message, index, all) => {
    if (!isErrorMessage(message)) return message

    const next: ChatMessage = {
      ...message,
      isError: true,
      errorCode: inferErrorCode(message)
    }

    const resolvedIndex = resolveRetryUserMessageIndex(all, index)
    if (resolvedIndex === null) return next
    return { ...next, retryUserMessageIndex: resolvedIndex }
  })
}

function canRetryFailedMessage(message: ChatMessage): boolean {
  if (!isErrorMessage(message)) return false
  const code = inferErrorCode(message)
  if (isRetriableAiError(code)) return true
  if (!code) return true
  return false
}

export function AIChatPanel({
  variant = 'workspace',
  sessionKey,
  sessionLabel,
  issueNumber,
  context,
  title = 'FocusFork agent',
  issueTitle,
  issueBody,
  branchName,
  upstreamRepoFullName,
  repoFullName,
  repoPath,
  currentFilePath,
  repoRootPath,
  currentFileContent,
  openTabContents,
  onRepositoryChanged,
  onSessionActivity,
  onPreviewProposedFile,
  onOpenInIde
}: AIChatPanelProps): React.JSX.Element {
  const isGeneralChat = variant === 'general'
  const activityTab: View = isGeneralChat ? 'chat' : 'ide'
  const starterPrompts = isGeneralChat ? GENERAL_STARTER_PROMPTS : WORKSPACE_STARTER_PROMPTS

  const sessionInScope = (key: string): boolean =>
    isGeneralChat
      ? isGlobalChatSessionKey(key)
      : !isGlobalChatSessionKey(key) &&
        sessionMatchesWorkspace(key, { issueNumber, repoFullName, repoPath })

  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>(() => [])
  const [isLoading, setIsLoading] = useState(false)
  const [repoPathIndex, setRepoPathIndex] = useState<string[]>([])
  const [pendingEdits, setPendingEdits] = useState<ProposedFileEdit[] | null>(null)
  const [pendingEditMessageIndex, setPendingEditMessageIndex] = useState<number | null>(null)
  const [applyBusy, setApplyBusy] = useState(false)
  const [applyProgress, setApplyProgress] = useState<Record<string, ApplyProgressState>>({})
  const [historyNotice, setHistoryNotice] = useState<string | null>(null)
  const [viewingSessionKey, setViewingSessionKey] = useState(sessionKey)
  const activeSessionKey = isGeneralChat ? sessionKey : viewingSessionKey
  const [showSessionMenu, setShowSessionMenu] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const hydratedSessionRef = useRef<string | null>(null)
  const aiTurnSeqRef = useRef(0)
  const retryInFlightRef = useRef(false)
  const { saveConversation, getConversation, getConversationKeys, getConversationLabel, clearConversation, setConversationTitle } =
    useAIStore()
  const setTabActivity = useTabActivityStore((state) => state.setTabActivity)
  const setView = useUIStore((state) => state.setView)
  const refreshBackendConnection = useAuthStore((state) => state.refreshBackendConnection)
  const backendConnected = useAuthStore((state) => state.backendConnected)
  // Catalog loads in both AI modes: BYOK lists the user's provider models,
  // subscription lists backend models.
  const { model, setModel, billingPlan, modelSelectorOptions } = useManagedModelCatalog()
  const user = useAuthStore((state) => state.user)
  const [reconnectBusy, setReconnectBusy] = useState(false)
  const [pushAfterApply, setPushAfterApply] = useState(false)
  const storedSessions = useMemo(
    () => getConversationKeys().filter(sessionInScope),
    [getConversationKeys, isGeneralChat, issueNumber, repoFullName, repoPath]
  )
  const isWorkspaceThread = activeSessionKey === sessionKey
  const activeSessionLabel = getConversationLabel(activeSessionKey)
  const composerLimitState = useMemo(
    () => getComposerLimitState(messages, { backendConnected }),
    [messages, backendConnected]
  )
  const composerBlocked = composerLimitState.inputBlocked

  const quickActions = useMemo<AgentQuickAction[]>(() => {
    if (isGeneralChat) {
      return [
        {
          id: 'summarize',
          label: 'Summarize',
          testId: 'ai-quick-summarize-btn',
          prompt: 'Summarize the following clearly and concisely:'
        },
        {
          id: 'rewrite',
          label: 'Rewrite',
          testId: 'ai-quick-rewrite-btn',
          prompt: 'Rewrite the following to be clearer and more professional:'
        },
        {
          id: 'ideas',
          label: 'Brainstorm',
          testId: 'ai-quick-ideas-btn',
          prompt: 'Give me five practical ideas for:'
        },
        {
          id: 'learn',
          label: 'Teach me',
          testId: 'ai-quick-learn-btn',
          prompt: 'Explain this like I am new to the topic:'
        }
      ]
    }

    const base = [
      `Repository: ${sessionLabel || sessionKey}`,
      `Issue: ${issueTitle || 'N/A'}`,
      `Issue body: ${(issueBody || 'N/A').slice(0, 2500)}`,
      `Branch: ${branchName || 'N/A'}`,
      `Current file: ${relativePathFromRoot(repoRootPath, currentFilePath) || currentFilePath || 'N/A'}`
    ].join('\n')

    return [
      {
        id: 'summary',
        label: 'Issue summary',
        testId: 'ai-quick-summary-btn',
        prompt: `${base}\n\nGive me a structured issue summary with goal, acceptance criteria, risks, and the best next step.`
      },
      {
        id: 'files',
        label: 'Find relevant files',
        testId: 'ai-quick-files-btn',
        prompt: `${base}\n\nList the most likely files or folders to inspect first and explain why each matters.`
      },
      {
        id: 'plan',
        label: 'Plan the fix',
        testId: 'ai-quick-plan-btn',
        prompt: `${base}\n\nCreate a minimal fix plan with exact steps, likely commands, and tests to run before opening a PR.`
      },
      {
        id: 'implement',
        label: 'Implement now',
        testId: 'ai-quick-implement-btn',
        prompt: `${base}\n\nImplement the issue fix now. Propose concrete file edits using focusfork-edit blocks for every file you change.`
      },
      {
        id: 'commit',
        label: 'Commit message',
        testId: 'ai-quick-commit-btn',
        prompt: `${base}\n\nGenerate a conventional commit message and a short explanation of why it fits this issue.`
      },
      {
        id: 'pr',
        label: 'PR draft',
        testId: 'ai-quick-pr-btn',
        prompt: `${base}\n\nDraft a pull request title and description with summary, validation, and issue link wording.`
      }
    ]
  }, [isGeneralChat, sessionKey, sessionLabel, issueTitle, issueBody, branchName, repoRootPath, currentFilePath])

  useEffect(() => {
    if (!showSessionMenu) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowSessionMenu(false) }
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('[data-testid="chat-session-history"]') && !target.closest('[data-testid="chat-session-menu"]')) {
        setShowSessionMenu(false)
      }
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onClick) }
  }, [showSessionMenu])

  useEffect(() => {
    if (isGeneralChat) return
    setViewingSessionKey((current) => {
      if (sessionInScope(current)) return current
      return sessionKey
    })
  }, [sessionKey, isGeneralChat, issueNumber, repoFullName, repoPath])

  useEffect(() => {
    if (!isGeneralChat) return
    setInput('')
    setPendingEdits(null)
    setPendingEditMessageIndex(null)
    setHistoryNotice(null)
    aiTurnSeqRef.current += 1
  }, [sessionKey, isGeneralChat])

  useEffect(() => {
    const stored = enrichMessagesForRetry(getConversation(activeSessionKey) as ChatMessage[])
    setMessages(stored)
    setHistoryNotice(
      stored.length > 0
        ? `${stored.length} message${stored.length === 1 ? '' : 's'} · ${activeSessionLabel}`
        : isWorkspaceThread
          ? null
          : `Resuming ${activeSessionLabel}`
    )
  }, [activeSessionKey, getConversation, activeSessionLabel, isWorkspaceThread])

  useEffect(() => {
    if (hydratedSessionRef.current !== activeSessionKey) return
    if (messages.length === 0) return
    saveConversation(
      activeSessionKey,
      messages,
      isWorkspaceThread ? sessionLabel || title : activeSessionLabel,
      isGeneralChat ? undefined : issueNumber
    )
  }, [
    messages,
    activeSessionKey,
    sessionLabel,
    title,
    issueNumber,
    saveConversation,
    isWorkspaceThread,
    activeSessionLabel,
    isGeneralChat
  ])

  useEffect(() => {
    hydratedSessionRef.current = activeSessionKey
  }, [activeSessionKey])

  const startNewChat = () => {
    clearConversation(sessionKey)
    setViewingSessionKey(sessionKey)
    setMessages([])
    setHistoryNotice(null)
    setShowSessionMenu(false)
  }

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  useEffect(() => {
    if (!backendConnected) return
    setMessages((prev) => {
      const next = stripAuthFailedErrors(prev)
      if (next.length === prev.length) return prev
      return enrichMessagesForRetry(next)
    })
  }, [backendConnected])

  useEffect(() => {
    if (!repoRootPath) {
      setRepoPathIndex([])
      return
    }
    let cancelled = false
    void loadRepoRelativePaths(repoRootPath).then((paths) => {
      if (!cancelled) setRepoPathIndex(paths)
    })
    return () => {
      cancelled = true
    }
  }, [repoRootPath])

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail
      if (detail) setInput(detail)
    }
    window.addEventListener('focusfork:prefill-chat', handler)
    return () => window.removeEventListener('focusfork:prefill-chat', handler)
  }, [])

  const buildChatContext = (attachmentContextBlocks: string[] = []) => {
    const parts = [isGeneralChat ? FOCUSFORK_GENERAL_SYSTEM : FOCUSFORK_CODING_SYSTEM, context]
    if (!isGeneralChat && (issueTitle || issueBody)) {
      const issueParts = [`Issue: ${issueTitle || 'N/A'}`]
      if (issueBody) issueParts.push(`Issue description:\n${issueBody.slice(0, 3000)}`)
      parts.push(issueParts.join('\n'))
    }
    if (!isGeneralChat && repoPathIndex.length > 0) {
      parts.push(formatRepoPathContext(repoPathIndex))
    }
    if (!isGeneralChat) {
      const includedPaths = new Set<string>()
      const openRelativePath = relativePathFromRoot(repoRootPath, currentFilePath)
      if (openRelativePath && currentFileContent) {
        parts.push(
          `Currently active file (${openRelativePath}):\n\`\`\`\n${currentFileContent.slice(0, 12000)}\n\`\`\``
        )
        if (currentFilePath) includedPaths.add(currentFilePath)
      }
      if (openTabContents) {
        const otherTabs = Object.entries(openTabContents)
          .filter(([path, content]) => content && !includedPaths.has(path))
          .slice(0, 8)
        if (otherTabs.length > 0) {
          const tabBlocks = otherTabs.map(([path, content]) => {
            const rel = relativePathFromRoot(repoRootPath, path) || path
            return `Open tab (${rel}):\n\`\`\`\n${content.slice(0, 6000)}\n\`\`\``
          })
          parts.push('Other open files in editor:\n\n' + tabBlocks.join('\n\n'))
        }
      }
    }
    if (attachmentContextBlocks.length > 0) {
      parts.push(['User-provided context attachments:', ...attachmentContextBlocks].join('\n\n'))
    }
    return parts.join('\n\n')
  }

  const runAssistantTurn = async (conversation: ChatMessage[], userMessageIndex: number, turnId: number) => {
    const userMessage = conversation[userMessageIndex]
    if (!userMessage || userMessage.role !== 'user') {
      console.warn('[FocusFork Chat] Skipped assistant turn: invalid user message index', userMessageIndex)
      return
    }

    setIsLoading(true)
    setTabActivity(activityTab, { status: 'working', message: FOCUSFORK_THINKING_LABEL })

    try {
      const builtContext = buildChatContext(userMessage.attachmentContextBlocks || [])
      const prepared = prepareAiChatPayload(
        conversation.map(({ role, content }) => ({ role, content })),
        builtContext
      )
      console.info('[FocusFork Chat] Sending AI request', {
        turnId,
        userMessageIndex,
        messageCount: prepared.stats.messageCount,
        payloadKb: Math.round(prepared.stats.totalChars / 1024)
      })
      console.info('[FocusFork Chat] Invoking IPC platform:ai-chat…')
      const sessionReady = await window.api.platform.ensureSession().catch(() => false)
      if (!sessionReady) {
        if (turnId !== aiTurnSeqRef.current) return
        setMessages((prev) => [
          ...prev,
          {
            role: 'model',
            content:
              'Your GitHub account is connected, but FocusFork could not restore its backend session. Reconnect backend, then retry.',
            errorCode: 'AUTH_FAILED',
            isError: true,
            retryUserMessageIndex: userMessageIndex,
            debugHint:
              'Managed AI requires the FocusFork backend at the URL configured in .env. Confirm the backend is running, then click Reconnect backend.'
          }
        ])
        setTabActivity(activityTab, { status: 'error', message: 'Backend session missing' })
        return
      }
      const response = await window.api.platform.aiChat({
        messages: prepared.messages,
        context: prepared.context,
        model
      })
      console.info('[FocusFork Chat] IPC platform:ai-chat returned', {
        turnId,
        errorCode: (response as { errorCode?: string })?.errorCode,
        hasText: Boolean(response?.text)
      })
      if (turnId !== aiTurnSeqRef.current) {
        console.info('[FocusFork Chat] Ignored stale AI response', { turnId, activeTurn: aiTurnSeqRef.current })
        return
      }
      if (isAiFailure(response as import('../lib/ai-errors').AiChatResult)) {
        const failed = response as import('../lib/ai-errors').AiChatResult
        const errorContext = {
          modelId: model,
          modelLabel: modelSelectorOptions.find((option) => option.id === model)?.label
        }
        setMessages((prev) => [
          ...prev,
          {
            role: 'model',
            content: humanizeAiChatResult(failed, 'We could not get a reply. Please try again.', errorContext),
            errorCode: failed.errorCode,
            isError: true,
            retryUserMessageIndex: userMessageIndex,
            debugHint: import.meta.env.DEV
              ? failed.debugHint ||
                `Sent ${prepared.stats.messageCount} messages (${Math.round(prepared.stats.totalChars / 1024)}KB).`
              : undefined
          }
        ])
        setTabActivity(activityTab, { status: 'error', message: 'FocusFork could not respond' })
        return
      }
      const rawText = response?.text || 'No response received.'
      if (response?.model && response.model !== model) {
        setModel(response.model)
        if (response.fallbackUsed) {
          const fallbackLabel =
            modelSelectorOptions.find((option) => option.id === response.model)?.label || response.model
          setHistoryNotice(`Used ${fallbackLabel} (auto-fallback)`)
        }
      }
      const proposedEdits = resolveProposedEditsPaths(parseProposedEdits(rawText), repoPathIndex)
      const displayModelContent =
        proposedEdits.length > 0
          ? stripEditBlocksFromDisplay(rawText) || summarizeProposedEdits(proposedEdits)
          : rawText
      setMessages((prev) => [
        ...prev,
        {
          role: 'model',
          content: displayModelContent,
          proposedEdits: proposedEdits.length > 0 ? proposedEdits : undefined
        }
      ])
      setTabActivity(activityTab, {
        status: 'success',
        message: proposedEdits.length > 0 ? 'Review proposed file changes' : 'FocusFork replied'
      })
      if (isGeneralChat && conversation.length === 1) {
        const meta = useAIStore.getState().conversationMetaByRepo[activeSessionKey]
        if (meta?.titleSource !== 'user') {
          void generateChatTitleWithAI(userMessage.content, displayModelContent, model).then((title) => {
            if (title) {
              setConversationTitle(activeSessionKey, title, 'auto')
            }
          })
        }
      }
      onSessionActivity?.(
        proposedEdits.length > 0 ? 'FocusFork proposed file changes for review.' : 'FocusFork replied in workspace chat.',
        'info'
      )
    } catch (error) {
      if (turnId !== aiTurnSeqRef.current) return
      const ipcTimedOut = error instanceof Error && /ipc timed out/i.test(error.message)
      setMessages((prev) => [
        ...prev,
        {
          role: 'model',
          content: humanizeError(
            error,
            ipcTimedOut
              ? 'FocusFork did not receive a response from the desktop AI bridge. Restart npm run dev and check the Electron terminal for [FocusFork AI] logs.'
              : 'We could not reach FocusFork. Please try again.'
          ),
          isError: true,
          errorCode: 'NETWORK_ERROR',
          retryUserMessageIndex: userMessageIndex,
          debugHint: import.meta.env.DEV
            ? ipcTimedOut
              ? 'The renderer waited for the main process AI bridge but got no reply.'
              : 'Desktop AI bridge could not complete the request.'
            : undefined
        }
      ])
      setTabActivity(activityTab, { status: 'error', message: 'FocusFork unavailable' })
    } finally {
      if (turnId === aiTurnSeqRef.current) {
        setIsLoading(false)
      }
    }
  }

  const retryUserPrompt = async (userMessageIndex: number) => {
    if (isLoading || retryInFlightRef.current || composerBlocked) {
      return
    }

    const conversation = buildRetryConversation(messages, userMessageIndex)
    if (!conversation) {
      console.warn('[FocusFork Chat] Retry failed: could not rebuild conversation', { userMessageIndex })
      return
    }

    retryInFlightRef.current = true
    const turnId = ++aiTurnSeqRef.current
    setMessages(conversation)
    try {
      await runAssistantTurn(conversation, userMessageIndex, turnId)
    } finally {
      retryInFlightRef.current = false
    }
  }

  const sendMessage = async (payload: { text: string; attachments: ComposerAttachment[] }) => {
    if (composerBlocked) return
    const trimmed = payload.text.trim()
    if ((!trimmed && payload.attachments.length === 0) || isLoading || retryInFlightRef.current) return

    setIsLoading(true)

    const displayContent =
      trimmed ||
      (payload.attachments.length === 1
        ? `Review the attached ${payload.attachments[0].label}.`
        : `Review the ${payload.attachments.length} attached context items.`)

    const attachmentContextBlocks = payload.attachments
      .map((attachment) => attachment.contextBlock)
      .filter(Boolean) as string[]

    const nextUserMessage: ChatMessage = {
      role: 'user',
      content: displayContent,
      attachments: payload.attachments.map(toPersistedAttachmentMeta),
      attachmentContextBlocks
    }

    const conversation = [...messages, nextUserMessage]
    const userMessageIndex = conversation.length - 1
    const turnId = ++aiTurnSeqRef.current
    setMessages(conversation)
    setInput('')
    if (isGeneralChat) {
      const meta = useAIStore.getState().conversationMetaByRepo[activeSessionKey]
      if (meta?.titleSource !== 'user' && (!meta?.label || meta.label === 'New chat')) {
        setConversationTitle(activeSessionKey, deriveChatTitleFromText(displayContent), 'auto')
      }
    }
    try {
      await runAssistantTurn(conversation, userMessageIndex, turnId)
    } catch {
      if (turnId === aiTurnSeqRef.current) {
        setIsLoading(false)
      }
    }
  }

  const requestApplyEdits = (edits: ProposedFileEdit[], messageIndex: number) => {
    setPendingEdits(edits)
    setPendingEditMessageIndex(messageIndex)
  }

  const handleApprovedApply = async () => {
    if (!pendingEdits?.length || !repoRootPath) return
    const editsToApply = resolveProposedEditsPaths(pendingEdits, repoPathIndex)
    setApplyBusy(true)
    setApplyProgress(Object.fromEntries(editsToApply.map((edit) => [edit.relativePath, 'pending' as ApplyProgressState])))
    try {
      for (const edit of editsToApply) {
        setApplyProgress((prev) => ({ ...prev, [edit.relativePath]: 'writing' }))
        try {
          await window.api.fs.writeFile(resolveRepoFilePath(repoRootPath, edit.relativePath), edit.content)
          setApplyProgress((prev) => ({ ...prev, [edit.relativePath]: 'done' }))
        } catch {
          setApplyProgress((prev) => ({ ...prev, [edit.relativePath]: 'error' }))
          throw new Error(`Could not write ${edit.relativePath}`)
        }
      }
      if (pendingEditMessageIndex !== null) {
        setMessages((prev) =>
          prev.map((message, index) =>
            index === pendingEditMessageIndex ? { ...message, editsApplied: true } : message
          )
        )
      }

      let pushSummary = ''
      if (pushAfterApply && repoRootPath) {
        const reviewStore = useReviewStore.getState()
        let reviewBlocked = false
        try {
          const reviewCtx = {
            ...defaultContext,
            selectedModelId: model,
            currentStep: 'committed' as const,
            issue: issueNumber ? { id: 0, number: issueNumber, title: issueTitle || '', body: undefined, repoOwner: '', repoName: '', repoFullName: repoFullName || '' } : null,
            repo: { rootPath: repoRootPath, activeFilePath: null, branchName: branchName || 'no-branch' },
            auth: { isAuthenticated: true, userLogin: null, backendConnected: true },
            timeline: [],
            metadata: {}
          }
          await reviewStore.runReview(repoRootPath, reviewCtx)
          const updated = useReviewStore.getState()
          const blocking = updated.findings.filter(
            (f) => (f.severity === 'critical' || f.severity === 'warning') && !f.acknowledged
          )
          if (blocking.length > 0) {
            reviewBlocked = true
            pushSummary = ` Files saved, but ${blocking.length} review finding${blocking.length !== 1 ? 's' : ''} need attention. Check the Git tab to review and commit.`
            onSessionActivity?.(`Code review found ${blocking.length} issue${blocking.length !== 1 ? 's' : ''} — commit paused.`, 'error')
          }
        } catch {
          // review failed — proceed with commit anyway
        }

        if (!reviewBlocked) {
          try {
            const paths = editsToApply.map((edit) => edit.relativePath)
            await window.api.git.add(repoRootPath, paths)
            const commitMsg = issueNumber
              ? `fix: apply changes for issue #${issueNumber}`
              : 'fix: apply FocusFork AI edits'
            await window.api.git.commit(repoRootPath, commitMsg)
            try {
              await window.api.git.push(repoRootPath)
            } catch {
              if (branchName && branchName !== 'no-branch') {
                await window.api.git.pushWithUpstream(repoRootPath, branchName)
              } else {
                throw new Error('Push failed. Commit was created locally—push from the Git tab.')
              }
            }
            pushSummary = ' Committed and pushed to your fork.'
          } catch (pushError) {
            pushSummary = ` Files saved locally, but git push failed: ${humanizeError(pushError, 'Could not push')}`
            onSessionActivity?.(pushSummary.trim(), 'error')
          }
        }
      }

      await onRepositoryChanged?.()
      onSessionActivity?.(
        `FocusFork applied ${editsToApply.length} file change${editsToApply.length === 1 ? '' : 's'} to the repository.${pushSummary}`,
        pushSummary.includes('failed') ? 'error' : 'success'
      )
      setMessages((prev) => [
        ...prev,
        {
          role: 'model',
          content: `Applied ${editsToApply.length} file change${editsToApply.length === 1 ? '' : 's'}.${pushSummary || ' Review git status, then commit and push when ready.'}`
        }
      ])
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'model',
          content: humanizeError(error, 'Could not apply the proposed file changes.'),
          isError: true
        }
      ])
    } finally {
      setApplyBusy(false)
      setPendingEdits(null)
      setPendingEditMessageIndex(null)
      setApplyProgress({})
    }
  }

  const handleReconnectBackend = async () => {
    if (reconnectBusy) return
    setReconnectBusy(true)
    try {
      const connected = await refreshBackendConnection()
      if (!connected) {
        setTabActivity(activityTab, { status: 'error', message: 'Backend reconnect failed' })
        onSessionActivity?.('Could not reconnect to the FocusFork backend. Confirm it is running, then try again.', 'error')
        return
      }
      setMessages((prev) => enrichMessagesForRetry(stripAuthFailedErrors(prev)))
      setTabActivity(activityTab, { status: 'success', message: 'Backend session restored' })
      onSessionActivity?.('Backend session restored. You can continue chatting.', 'success')
    } finally {
      setReconnectBusy(false)
    }
  }

  const handleComposerNoticeAction = (action: 'billing' | 'model' | 'reconnect') => {
    if (action === 'reconnect') {
      void handleReconnectBackend()
      return
    }
    if (action === 'billing') {
      setView('usage')
      return
    }
    document.querySelector<HTMLButtonElement>('[data-testid="model-selector-trigger"]')?.focus()
    document.querySelector<HTMLButtonElement>('[data-testid="model-selector-trigger"]')?.click()
  }

  return (
    <>
      <div data-testid="ai-chat-panel" className="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-background">
        <div className="shrink-0 border-b border-border px-4 py-2.5">
          {/* Row 1: identity — gets the full width so the title never collapses. */}
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-surface">
              <img src={focusforkIcon} alt="FocusFork" className="focusfork-logo-well h-[16px] w-[16px]" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-[13px] font-semibold text-text-main">{title}</h2>
              <p className="truncate text-[11px] text-text-muted">
                {isGeneralChat
                  ? activeSessionLabel || 'New chat'
                  : sessionLabel || 'Contribution workspace'}
              </p>
            </div>
            {historyNotice && <span className="status-pill shrink-0 text-[10px]">{historyNotice}</span>}
          </div>
          {/* Row 2: controls on their own line so they never squeeze the title. */}
          <div className="mt-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {!isGeneralChat && (
              <button
                type="button"
                data-testid="chat-new-session-btn"
                onClick={startNewChat}
                className="composer-tool-btn w-auto px-2.5 text-[11px]"
                title="Start a fresh chat for this issue"
              >
                New chat
              </button>
              )}
              {!isGeneralChat && storedSessions.length > 0 && (
                <div className="relative">
                  <button
                    type="button"
                    data-testid="chat-session-history"
                    onClick={() => setShowSessionMenu((open) => !open)}
                    className="composer-tool-btn w-auto px-2.5"
                    title={isGeneralChat ? 'Resume a previous chat' : 'Resume a previous chat for this repository'}
                  >
                    <History size={15} />
                    <ChevronDown size={12} />
                  </button>
                  {showSessionMenu && (
                    <div className="absolute right-0 top-full z-20 mt-1 w-64 rounded-xl border border-border bg-surface p-1 shadow-lg">
                      {storedSessions.map((key) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => {
                            setViewingSessionKey(key)
                            setShowSessionMenu(false)
                          }}
                          className={`flex w-full rounded-lg px-3 py-2 text-left text-xs ${
                            key === activeSessionKey ? 'bg-primary/8 text-text-main' : 'text-text-secondary hover:bg-surface-hover hover:text-text-main'
                          }`}
                        >
                          {getConversationLabel(key)}
                          {key === sessionKey ? (isGeneralChat ? ' (current)' : ' (current issue)') : ''}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            <ModelSelector
              compact
              value={model}
              options={modelSelectorOptions}
              onChange={setModel}
              disabled={isLoading}
              billingPlan={billingPlan}
              onUpgradeClick={() => setView('settings')}
            />
          </div>

          {!isGeneralChat && !isWorkspaceThread && (
            <div className="mt-3 rounded-xl border border-border bg-surface-hover/60 px-3 py-2 text-xs text-text-secondary">
              Resuming <span className="font-medium text-text-main">{activeSessionLabel}</span>. You can keep chatting here or{' '}
              <button type="button" className="font-semibold underline" onClick={() => setViewingSessionKey(sessionKey)}>
                switch to {sessionLabel || title}
              </button>
              .
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {messages.length === 0 && !isLoading && (
            <div className="mx-auto flex max-w-2xl flex-col items-center py-16 text-center">
              <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-b from-surface to-background border border-border shadow-md">
                <img src={focusforkIcon} alt="FocusFork" className="focusfork-logo-well h-8 w-8" />
              </div>
              <h3 className="text-lg font-semibold text-text-main tracking-tight">
                {isGeneralChat ? 'How can FocusFork help today?' : 'Work on this contribution'}
              </h3>
              <p className="mt-2.5 max-w-md text-sm leading-relaxed text-text-secondary">
                {isGeneralChat
                  ? 'Ask questions, draft content, learn concepts, or get coding advice.'
                  : 'Describe what to implement and FocusFork will propose concrete edits you can review, apply, and ship as a PR.'}
              </p>
              <div className="mt-6 grid grid-cols-2 gap-2 max-w-lg w-full">
                {starterPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    data-testid="chat-starter-prompt"
                    onClick={() => setInput(prompt)}
                    disabled={composerBlocked || isLoading}
                    className="rounded-xl border border-border bg-surface px-3.5 py-2.5 text-left text-xs leading-snug text-text-secondary transition-all hover:border-primary/20 hover:bg-surface-hover hover:text-text-main hover:shadow-sm disabled:opacity-50"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mx-auto flex max-w-3xl flex-col gap-5">
            {messages.map((message, index) => {
              const errorMessage = isErrorMessage(message)
              const retryUserMessageIndex = errorMessage ? resolveRetryUserMessageIndex(messages, index) : null
              const showRetry = errorMessage && retryUserMessageIndex !== null && canRetryFailedMessage(message)
              const showReconnect = errorMessage && inferErrorCode(message) === 'AUTH_FAILED'

              return (
              <div
                key={`${message.role}-${index}`}
                data-testid={message.role === 'model' ? 'message-assistant' : undefined}
                className={`agent-message-enter flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {message.role === 'model' && <FocusForkAvatar />}
                <div
                  className={`max-w-[85%] ${
                    message.role === 'user'
                      ? 'chat-bubble-user rounded-2xl bg-primary px-4 py-3 text-sm leading-6 text-primary-foreground shadow-sm'
                      : errorMessage
                        ? 'chat-composer-notice w-full max-w-full'
                        : 'chat-bubble-assistant rounded-2xl border border-border bg-surface px-4 py-3 text-sm leading-6 text-text-main shadow-sm'
                  }`}
                >
                  {errorMessage ? (
                    <AiErrorNotice
                      errorCode={inferErrorCode(message)}
                      message={message.content}
                      debugHint={message.debugHint}
                      modelId={model}
                      modelLabel={modelSelectorOptions.find((option) => option.id === model)?.label}
                      compact
                      onRetry={
                        showRetry
                          ? () => void retryUserPrompt(retryUserMessageIndex!)
                          : undefined
                      }
                      onReconnect={showReconnect ? () => void handleReconnectBackend() : undefined}
                      onChangeModel={() => handleComposerNoticeAction('model')}
                      reconnectDisabled={reconnectBusy}
                      retryDisabled={isLoading}
                    />
                  ) : (
                    <>
                      <ChatMarkdown content={message.content} inverted={message.role === 'user'} />
                      {message.attachments && message.attachments.length > 0 && (
                        <MessageAttachments attachments={message.attachments} />
                      )}
                      {message.proposedEdits && message.proposedEdits.length > 0 && (
                        <AgentProposedChanges
                          edits={message.proposedEdits}
                          repoRootPath={repoRootPath ?? null}
                          editsApplied={message.editsApplied}
                          applyProgress={
                            pendingEditMessageIndex === index && applyBusy ? applyProgress : undefined
                          }
                          applyBusy={pendingEditMessageIndex === index && applyBusy}
                          onApply={() => requestApplyEdits(message.proposedEdits!, index)}
                          onViewFile={
                            onPreviewProposedFile
                              ? (relativePath, proposedContent) => void onPreviewProposedFile(relativePath, proposedContent)
                              : undefined
                          }
                        />
                      )}
                      {message.editsApplied && !message.proposedEdits?.length && (
                        <div className="mt-2 text-xs font-medium text-success">Changes applied to your repository</div>
                      )}
                    </>
                  )}
                </div>
                {message.role === 'user' && (
                  <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-text-main">
                    <User size={13} strokeWidth={2} />
                  </div>
                )}
              </div>
              )
            })}

            {isLoading && (
              <div className="agent-message-enter flex gap-3 justify-start" data-testid="chat-loading-indicator">
                <FocusForkAvatar />
                <div className="rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-text-secondary shadow-sm">
                  <span className="inline-flex items-center gap-2.5">
                    <span className="flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-text-muted animate-bounce [animation-delay:0ms]" />
                      <span className="h-1.5 w-1.5 rounded-full bg-text-muted animate-bounce [animation-delay:150ms]" />
                      <span className="h-1.5 w-1.5 rounded-full bg-text-muted animate-bounce [animation-delay:300ms]" />
                    </span>
                    {FOCUSFORK_THINKING_LABEL}
                  </span>
                </div>
              </div>
            )}
          </div>

          <div ref={endRef} />
        </div>

        <AgentComposer
          value={input}
          onChange={setInput}
          onSend={sendMessage}
          disabled={composerBlocked}
          isLoading={isLoading}
          repoRootPath={repoRootPath}
          quickActions={quickActions}
          composerNotice={composerLimitState.notice}
          onComposerNoticeAction={handleComposerNoticeAction}
          composerNoticeBusy={reconnectBusy}
          placeholder={
            composerBlocked && composerLimitState.inputBlockedReason
              ? composerLimitState.inputBlockedReason
              : isGeneralChat
                ? 'Ask anything — writing, planning, learning, or coding help…'
                : 'Message FocusFork, type / for files, or attach with the paperclip…'
          }
        />
      </div>

      <ApprovalGate
        actionLabel={`${pushAfterApply ? 'Apply, commit, and push' : 'Apply'} ${pendingEdits?.length || 0} AI-proposed file change${pendingEdits?.length === 1 ? '' : 's'}`}
        description={
          pushAfterApply
            ? 'Review the diffs below. Approving will write the files, create a commit, and push the branch to your fork.'
            : 'Review the diffs below. Approving will write the files locally only.'
        }
        isOpen={Boolean(pendingEdits?.length)}
        isBusy={applyBusy}
        size="wide"
        onApprove={() => void handleApprovedApply()}
        onReject={() => {
          if (applyBusy) return
          setPendingEdits(null)
          setPendingEditMessageIndex(null)
        }}
      >
        {pendingEdits && pendingEdits.length > 0 && (
          <EditApprovalReview
            edits={pendingEdits}
            repoRootPath={repoRootPath ?? null}
            upstreamRepoFullName={upstreamRepoFullName}
            forkLogin={user?.login}
            branchName={branchName}
            issueNumber={issueNumber}
            pushAfterApply={pushAfterApply}
            onPushAfterApplyChange={setPushAfterApply}
            onPreviewFile={
              onPreviewProposedFile
                ? (relativePath, proposedContent) => void onPreviewProposedFile(relativePath, proposedContent)
                : undefined
            }
            onOpenInIde={onOpenInIde}
          />
        )}
      </ApprovalGate>
    </>
  )
}
