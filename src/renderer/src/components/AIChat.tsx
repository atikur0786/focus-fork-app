import { useState, useRef, useEffect, type ReactNode } from 'react'
import { Send, Bot, User, Sparkles } from 'lucide-react'
import { clsx } from 'clsx'
import { useAIStore } from '../store/useAIStore'
import { useUIStore } from '../store/useUIStore'

interface Message {
  role: 'user' | 'model'
  content: string
}

interface AIChatProps {
  issue?: {
    title: string
    body?: string
    number: number
    repository: {
      full_name: string
    }
  } | null
  filePath?: string | null
  fileContent?: string
  repoPath?: string | null
}

export const AIChat = ({ issue, filePath, fileContent, repoPath }: AIChatProps) => {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isConfigured, setIsConfigured] = useState(false)
  const [backendReady, setBackendReady] = useState(false)
  const [repoNotice, setRepoNotice] = useState<string | null>(null)
  const [selectedRepoHistoryKey, setSelectedRepoHistoryKey] = useState<string | null>(null)
  const [modelOptions, setModelOptions] = useState<Array<{ id: string; label: string }>>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const {
    apiKey,
    model,
    setModel,
    saveConversation,
    getConversation,
    getConversationKeys,
    getConversationLabel
  } = useAIStore()
  const { setView } = useUIStore()
  const repoKey = issue?.repository?.full_name || repoPath || null

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(scrollToBottom, [messages])
  useEffect(() => {
    const syncBackend = async () => {
      try {
        const status = await window.api.platform.status()
        setBackendReady(!!status?.enabled && !!status?.connected)
      } catch {
        setBackendReady(false)
      }
    }
    syncBackend()
  }, [])

  useEffect(() => {
    const loadModels = async () => {
      try {
        const payload = await window.api.platform.aiModels()
        const items = Array.isArray(payload?.items) ? payload.items : []
        const mapped = items
          .map((item: { id?: string; label?: string }) => ({
            id: String(item?.id || '').trim(),
            label: String(item?.label || item?.id || '').trim()
          }))
          .filter((item) => item.id.length > 0)
        setModelOptions(mapped)
        if (mapped.length > 0 && !mapped.some((item) => item.id === model)) {
          setModel(mapped[0].id)
        }
      } catch {
        setModelOptions([])
      }
    }
    loadModels()
  }, [model, setModel])

  useEffect(() => {
    setIsConfigured(!!apiKey || backendReady)
  }, [apiKey, backendReady])

  useEffect(() => {
    if (!repoKey) {
      setMessages([])
      setRepoNotice(null)
      return
    }

    setSelectedRepoHistoryKey(repoKey)

    const previous = getConversation(repoKey)
    if (previous.length > 0) {
      setMessages(previous)
      setRepoNotice('Loaded previous AI conversation for this repository.')
      return
    }

    if (issue) {
      const summary = [
        `Repo switched: ${issue.repository.full_name}`,
        `Issue #${issue.number}: ${issue.title}`,
        '',
        'Suggested next steps:',
        '1) Read the issue and acceptance criteria.',
        '2) Identify files to change.',
        '3) Make minimal edits and run tests.',
        '4) Commit, push, and open PR.'
      ].join('\n')
      setMessages([{ role: 'model', content: summary }])
      setRepoNotice('Fresh repository context loaded. Start from this issue summary.')
      return
    }

    setMessages([])
    setRepoNotice('Repository switched. Select an issue to get guided summary.')
  }, [repoKey, issue?.number])

  useEffect(() => {
    if (!selectedRepoHistoryKey) return
    const repoLabel = selectedRepoHistoryKey.includes('/') ? selectedRepoHistoryKey : issue?.repository?.full_name || selectedRepoHistoryKey
    saveConversation(selectedRepoHistoryKey, messages, repoLabel)
  }, [selectedRepoHistoryKey, messages, issue?.repository?.full_name])

  useEffect(() => {
    if (!selectedRepoHistoryKey) return
    const previous = getConversation(selectedRepoHistoryKey)
    if (previous.length > 0) {
      setMessages(previous)
      setRepoNotice('Loaded previous AI conversation for this repository.')
    }
  }, [selectedRepoHistoryKey])

  const sendPrompt = async (prompt: string) => {
    if (!prompt.trim() || isLoading) return
    if (!isConfigured) {
      alert('Configure your AI provider in Settings first.')
      return
    }

    const userMsg: Message = { role: 'user', content: prompt }
    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setIsLoading(true)

    try {
      const context = [
        issue
          ? `Issue: #${issue.number} ${issue.title}\nRepo: ${issue.repository.full_name}\nIssue Body: ${issue.body || 'N/A'}`
          : 'Issue: none selected',
        repoPath ? `Repo Path: ${repoPath}` : 'Repo Path: not set',
        filePath
          ? `Current File: ${filePath}\nContent:\n${(fileContent || '').slice(0, 4000)}`
          : 'Current File: none'
      ].join('\n\n')
      const response = await window.electron.ipcRenderer.invoke('ai:chat', {
        messages: [...messages, userMsg],
        context,
        model
      })
      setMessages((prev) => [...prev, { role: 'model', content: response }])
    } catch (error: any) {
      console.error(error)
      const message = error?.message || 'Could not get response from AI.'
      setMessages((prev) => [...prev, { role: 'model', content: `Error: ${message}` }])
    } finally {
      setIsLoading(false)
    }
  }

  const handleSend = async () => {
    await sendPrompt(input)
  }

  const buildExactFixPrompt = () => {
    if (!issue) return ''
    return [
      `You are fixing GitHub issue #${issue.number} in repo ${issue.repository.full_name}.`,
      '',
      'Follow this exact output format with headings:',
      '1) Issue Summary',
      '2) Acceptance Criteria (checkbox list)',
      '3) Exact Files to Change (max 5 files, with reason)',
      '4) Minimal Change Plan (step-by-step)',
      '5) Current File Edits (only for the currently open file)',
      '6) Tests to Add/Update',
      '7) Commit Message + PR Description draft',
      '',
      'Rules:',
      '- Keep changes minimal and issue-focused.',
      '- No unrelated refactor.',
      '- Call out assumptions clearly.',
      '- Mention edge cases and risks.',
      '',
      `Issue title: ${issue.title}`,
      `Issue body: ${issue.body || 'N/A'}`,
      `Repo path: ${repoPath || 'N/A'}`,
      `Current file: ${filePath || 'N/A'}`,
      `Current file content (first 4000 chars): ${(fileContent || '').slice(0, 4000) || 'N/A'}`
    ].join('\n')
  }

  return (
    <div className="flex flex-col h-full bg-surface border-l border-border">
      <div className="p-3 border-b border-border flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="font-semibold text-sm">AI Assistant</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="min-w-[160px]">
            <select
              value={selectedRepoHistoryKey || ''}
              onChange={(e) => setSelectedRepoHistoryKey(e.target.value || null)}
              className="w-full bg-background border border-border rounded-md px-2 py-1 text-[11px] text-text-main focus:ring-1 focus:ring-primary outline-none cursor-pointer"
              title="Repository chat history"
            >
              {!selectedRepoHistoryKey && <option value="">Repo history</option>}
              {getConversationKeys().map((repoConversationKey) => (
                <option key={repoConversationKey} value={repoConversationKey}>
                  {getConversationLabel(repoConversationKey)}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-[140px]">
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-full bg-background border border-border rounded-md px-2 py-1 text-[11px] text-text-main focus:ring-1 focus:ring-primary outline-none cursor-pointer"
            title="AI model"
          >
            {modelOptions.length === 0 && <option value={model}>{model || 'Default model'}</option>}
            {modelOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {repoNotice && (
          <div className="rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-[11px] text-text-secondary">
            {repoNotice}
          </div>
        )}
        {issue && (
          <div className="rounded-xl border border-primary/40 bg-primary/10 p-3">
            <div className="text-[11px] uppercase tracking-wider text-primary font-bold mb-2">
              Issue-to-Code Assistant
            </div>
            <div className="text-xs text-text-secondary mb-3">
              Generate exact, issue-focused code guidance before editing.
            </div>
            <button
              onClick={() => sendPrompt(buildExactFixPrompt())}
              className="w-full text-xs px-3 py-2 rounded-md bg-primary text-primary-foreground font-semibold hover:bg-primary/90"
            >
              Suggest Exact Fix
            </button>
          </div>
        )}
        {issue && (
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => sendPrompt('Summarize the issue and expected behavior.')}
              className="text-[10px] px-2 py-1 rounded bg-surface-hover border border-border text-text-secondary hover:text-text-main"
            >
              Summarize Issue
            </button>
            <button
              onClick={() =>
                sendPrompt('Propose a step-by-step plan to fix this issue in this repo.')
              }
              className="text-[10px] px-2 py-1 rounded bg-surface-hover border border-border text-text-secondary hover:text-text-main"
            >
              Fix Plan
            </button>
            <button
              onClick={() => sendPrompt('Identify likely files/modules to change and why.')}
              className="text-[10px] px-2 py-1 rounded bg-surface-hover border border-border text-text-secondary hover:text-text-main"
            >
              Find Files
            </button>
            <button
              onClick={() =>
                sendPrompt('Create a concise PR description for this issue after changes are made.')
              }
              className="text-[10px] px-2 py-1 rounded bg-surface-hover border border-border text-text-secondary hover:text-text-main"
            >
              PR Description
            </button>
          </div>
        )}
        {messages.length === 0 && (
          <div className="text-center text-text-muted text-sm mt-10">
            <p>Ask me anything about your code!</p>
            {!isConfigured && (
              <button
                onClick={() => setView('settings')}
                className="mt-3 text-xs px-3 py-1 rounded bg-primary text-primary-foreground"
              >
                Configure AI
              </button>
            )}
          </div>
        )}
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={clsx('flex gap-3', msg.role === 'user' ? 'flex-row-reverse' : '')}
          >
            <div
              className={clsx(
                'w-6 h-6 rounded-full flex items-center justify-center shrink-0',
                msg.role === 'user'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-accent/10 text-accent'
              )}
            >
              {msg.role === 'user' ? <User className="h-3 w-3" /> : <Bot className="h-3 w-3" />}
            </div>
            <div
              className={clsx(
                'p-3 rounded-lg text-sm max-w-[85%]',
                msg.role === 'user'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-surface-hover border border-border'
              )}
            >
              {msg.role === 'model' ? (
                <StructuredMessage content={msg.content} />
              ) : (
                <div className="whitespace-pre-wrap break-words">{msg.content}</div>
              )}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex gap-3">
            <div className="w-6 h-6 rounded-full bg-accent/10 text-accent flex items-center justify-center shrink-0">
              <Bot className="h-3 w-3" />
            </div>
            <div className="bg-surface-hover border border-border p-3 rounded-lg text-sm">
              Generating...
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-3 border-t border-border">
        <div className="relative">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Type a message..."
            className="w-full bg-background border border-border rounded-lg pl-3 pr-10 py-2.5 text-sm focus:ring-1 focus:ring-primary outline-none"
          />
          <button
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-primary hover:text-primary/80 disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

function StructuredMessage({ content }: { content: string }) {
  const normalized = normalizeAssistantText(content)
  const lines = normalized.split('\n')

  return (
    <div className="space-y-1 text-text-main">
      {lines.map((line, i) => {
        const trimmed = line.trim()
        if (!trimmed) return <div key={i} className="h-2" />
        if (/^#{1,6}\s/.test(trimmed)) {
          return (
            <div key={i} className="font-semibold text-primary">
              {renderInline(trimmed.replace(/^#{1,6}\s/, ''))}
            </div>
          )
        }
        if (/^\d+[\).]\s/.test(trimmed)) {
          return (
            <div key={i} className="pl-1 font-medium">
              {renderInline(trimmed)}
            </div>
          )
        }
        if (/^[-*]\s/.test(trimmed)) {
          return (
            <div key={i} className="pl-3">
              • {renderInline(trimmed.replace(/^[-*]\s/, ''))}
            </div>
          )
        }
        return (
          <div key={i} className="whitespace-pre-wrap break-words">
            {renderInline(trimmed)}
          </div>
        )
      })}
    </div>
  )
}

function normalizeAssistantText(text: string): string {
  let out = (text || '').replace(/\r\n/g, '\n')
  out = out
    .replace(/([^.:\n])\s(?=\d+[\).]\s)/g, '$1\n')
    .replace(/([^\n])(?=#+\s)/g, '$1\n')
    .replace(/([^\n])(?=\*\*[^*]+\*\*:)/g, '$1\n')
    .replace(/([^\n])\s(?=-\s)/g, '$1\n')
    .replace(/([^\n])\s(?=\*\s)/g, '$1\n')
    .replace(/(\d+[\).]\s[^\n]+)\s(?=\d+[\).]\s)/g, '$1\n')
    .replace(/\*\*(.*?)\*\*/g, (_m, p1) => `**${String(p1).trim()}**`)
    .replace(/\n{3,}/g, '\n\n')
  return out
}

function renderInline(text: string): ReactNode {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g)
  return (
    <>
      {parts.map((part, i) => {
        if (!part) return null
        if (part.startsWith('`') && part.endsWith('`')) {
          return (
            <code
              key={i}
              className="px-1 py-0.5 rounded bg-background border border-border text-xs"
            >
              {part.slice(1, -1)}
            </code>
          )
        }
        if (part.startsWith('**') && part.endsWith('**')) {
          return (
            <strong key={i} className="font-semibold">
              {part.slice(2, -2)}
            </strong>
          )
        }
        return <span key={i}>{part}</span>
      })}
    </>
  )
}
