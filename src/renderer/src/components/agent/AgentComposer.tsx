import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowUp,
  FileText,
  FolderOpen,
  ImagePlus,
  Loader2,
  Mic,
  MicOff,
  Paperclip,
  Sparkles,
  Square,
  X
} from 'lucide-react'
import {
  arrayBufferToDataUrl,
  buildFileContextBlock,
  buildImageContextBlock,
  buildUploadFileContextBlock,
  createAttachmentId,
  guessMimeType,
  isImagePath,
  isLikelyTextFile,
  relativePathFromRoot,
  type ComposerAttachment
} from '../../lib/chat-attachments'
import { isSpeechInputSupported, startSpeechInput } from '../../lib/speech-input'
import { humanizeError } from '../../lib/user-errors'
import type { ComposerNotice } from '../../lib/ai-session-limits'
import { ContextFilePicker } from './ContextFilePicker'

export interface AgentQuickAction {
  id: string
  label: string
  testId: string
  prompt: string
}

interface AgentComposerProps {
  value: string
  onChange: (value: string) => void
  onSend: (payload: { text: string; attachments: ComposerAttachment[] }) => void | Promise<void>
  disabled?: boolean
  isLoading?: boolean
  repoRootPath?: string | null
  quickActions?: AgentQuickAction[]
  placeholder?: string
  composerNotice?: ComposerNotice
  onComposerNoticeAction?: (action: NonNullable<ComposerNotice['action']>) => void
  composerNoticeBusy?: boolean
}

interface SlashCommand {
  id: string
  label: string
  hint: string
  icon: React.ReactNode
  testId: string
  keywords: string[]
  run: () => void
}

function AttachmentChip({
  attachment,
  onRemove
}: {
  attachment: ComposerAttachment
  onRemove: () => void
}): React.JSX.Element {
  return (
    <div className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-[11px] text-text-main">
      {attachment.kind === 'image' && attachment.previewDataUrl ? (
        <img src={attachment.previewDataUrl} alt="" className="h-4 w-4 rounded object-cover" />
      ) : (
        <FileText size={12} className="shrink-0 text-text-muted" />
      )}
      <span className="truncate">{attachment.label}</span>
      <button
        type="button"
        data-testid={`attachment-remove-${attachment.id}`}
        onClick={onRemove}
        className="rounded-full p-0.5 text-text-muted hover:bg-surface-hover hover:text-text-main"
        aria-label={`Remove ${attachment.label}`}
      >
        <X size={12} />
      </button>
    </div>
  )
}

function stripTrailingSlashCommand(value: string): string {
  return value.replace(/(?:^|\n)\/[\w-]*$/, '').trimEnd()
}

const COMPOSER_MIN_HEIGHT = 24
const COMPOSER_MAX_HEIGHT = 144

export function AgentComposer({
  value,
  onChange,
  onSend,
  disabled = false,
  isLoading = false,
  repoRootPath,
  quickActions = [],
  placeholder = 'Ask FocusFork to implement, explain, or ship your contribution…',
  composerNotice,
  onComposerNoticeAction,
  composerNoticeBusy = false
}: AgentComposerProps): React.JSX.Element {
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([])
  const [showFilePicker, setShowFilePicker] = useState(false)
  const [showAttachMenu, setShowAttachMenu] = useState(false)
  const [showQuickMenu, setShowQuickMenu] = useState(false)
  const [showSlashMenu, setShowSlashMenu] = useState(false)
  const [slashQuery, setSlashQuery] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const [voiceHint, setVoiceHint] = useState<string | null>(null)
  const [attachError, setAttachError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const speechControllerRef = useRef<{ stop: () => void } | null>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)

  const hasTypedContent = value.trim().length > 0 || attachments.length > 0
  const canSend = !disabled && !isLoading && hasTypedContent

  useEffect(() => {
    const node = textareaRef.current
    if (!node) return
    node.style.height = 'auto'
    const nextHeight = Math.min(Math.max(node.scrollHeight, COMPOSER_MIN_HEIGHT), COMPOSER_MAX_HEIGHT)
    node.style.height = `${nextHeight}px`
  }, [value, attachments.length, voiceHint])

  useEffect(() => {
    return () => {
      speechControllerRef.current?.stop()
    }
  }, [])

  useEffect(() => {
    const match = value.match(/(?:^|\n)\/([\w-]*)$/)
    if (match) {
      setSlashQuery(match[1] || '')
      setShowSlashMenu(true)
    } else {
      setSlashQuery('')
      setShowSlashMenu(false)
    }
  }, [value])

  useEffect(() => {
    if (!showAttachMenu && !showQuickMenu) return
    const close = () => {
      setShowAttachMenu(false)
      setShowQuickMenu(false)
    }
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [showAttachMenu, showQuickMenu])

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((item) => item.id !== id))
  }

  const clearSlashFromInput = () => {
    onChange(stripTrailingSlashCommand(value))
  }

  const addRepoFiles = async (absolutePaths: string[]) => {
    if (!repoRootPath) return
    setAttachError(null)
    const next: ComposerAttachment[] = []
    for (const absolutePath of absolutePaths) {
      if (attachments.some((item) => item.absolutePath === absolutePath)) continue
      if (!isLikelyTextFile(absolutePath)) continue
      try {
        const content = await window.api.fs.readFile(absolutePath)
        const relativePath = relativePathFromRoot(repoRootPath, absolutePath)
        next.push({
          id: createAttachmentId('repo'),
          kind: 'repo-file',
          label: relativePath,
          relativePath,
          absolutePath,
          content,
          contextBlock: buildFileContextBlock(relativePath, relativePath, content)
        })
      } catch {
        // skip unreadable files
      }
    }
    if (next.length === 0) {
      setAttachError('Could not attach the selected files.')
      return
    }
    setAttachments((prev) => [...prev, ...next])
    setShowFilePicker(false)
  }

  const openRepoFilePicker = () => {
    clearSlashFromInput()
    setShowAttachMenu(false)
    if (!repoRootPath) {
      setAttachError('Open a cloned repository before attaching repo files.')
      return
    }
    setShowFilePicker(true)
  }

  const openUploadFiles = () => {
    clearSlashFromInput()
    setShowAttachMenu(false)
    void window.api.fs
      .selectFiles({ title: 'Choose files to attach', multi: true })
      .then(addUploadedPaths)
      .catch((error) => setAttachError(humanizeError(error, 'Could not attach files.')))
  }

  const openUploadImage = () => {
    clearSlashFromInput()
    setShowAttachMenu(false)
    imageInputRef.current?.click()
  }

  const addUploadedPaths = async (paths: string[]) => {
    if (paths.length === 0) return
    setAttachError(null)
    const next: ComposerAttachment[] = []
    for (const absolutePath of paths) {
      try {
        if (isImagePath(absolutePath)) {
          const buffer = await window.api.fs.readFileBuffer(absolutePath)
          const mimeType = guessMimeType(absolutePath)
          const dataUrl = await arrayBufferToDataUrl(buffer, mimeType)
          const label = absolutePath.split('/').pop() || 'image'
          next.push({
            id: createAttachmentId('image'),
            kind: 'image',
            label,
            absolutePath,
            mimeType,
            previewDataUrl: dataUrl,
            contextBlock: buildImageContextBlock(label, mimeType, dataUrl)
          })
          continue
        }
        if (!isLikelyTextFile(absolutePath)) continue
        const content = await window.api.fs.readFile(absolutePath)
        const label = absolutePath.split('/').pop() || 'file'
        next.push({
          id: createAttachmentId('file'),
          kind: 'file',
          label,
          absolutePath,
          content,
          contextBlock: buildUploadFileContextBlock(label, content)
        })
      } catch {
        // skip
      }
    }
    if (next.length === 0) {
      setAttachError('No supported files could be attached.')
      return
    }
    setAttachments((prev) => [...prev, ...next])
  }

  const handleImageInput = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files?.length) return
    setAttachError(null)
    const next: ComposerAttachment[] = []
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result || ''))
        reader.onerror = () => reject(new Error('read failed'))
        reader.readAsDataURL(file)
      })
      next.push({
        id: createAttachmentId('image'),
        kind: 'image',
        label: file.name,
        mimeType: file.type,
        previewDataUrl: dataUrl,
        contextBlock: buildImageContextBlock(file.name, file.type, dataUrl)
      })
    }
    setAttachments((prev) => [...prev, ...next])
    event.target.value = ''
  }

  const toggleVoice = () => {
    if (isRecording) {
      speechControllerRef.current?.stop()
      speechControllerRef.current = null
      setIsRecording(false)
      setVoiceHint(null)
      return
    }

    const controller = startSpeechInput({
      onPartial: (text) => setVoiceHint(text),
      onFinal: (text) => {
        onChange(value.trim() ? `${value.trim()} ${text}` : text)
        setVoiceHint(null)
        setIsRecording(false)
        speechControllerRef.current = null
      },
      onError: (message) => {
        setAttachError(message)
        setIsRecording(false)
        setVoiceHint(null)
        speechControllerRef.current = null
      }
    })
    if (!controller) return
    speechControllerRef.current = controller
    setIsRecording(true)
    setAttachError(null)
    setVoiceHint('Listening…')
  }

  const submit = () => {
    if (!canSend) return
    void onSend({ text: value.trim(), attachments })
    onChange('')
    setAttachments([])
    setShowQuickMenu(false)
    setShowSlashMenu(false)
  }

  const slashCommands = useMemo<SlashCommand[]>(() => {
    const items: SlashCommand[] = [
      {
        id: 'file',
        label: 'Attach repo files',
        hint: 'Pick files from this repository',
        icon: <FolderOpen size={14} />,
        testId: 'slash-file',
        keywords: ['file', 'files', 'repo', 'context'],
        run: openRepoFilePicker
      },
      {
        id: 'upload',
        label: 'Upload file',
        hint: 'Choose a file from your computer',
        icon: <FileText size={14} />,
        testId: 'slash-upload',
        keywords: ['upload', 'file', 'attach'],
        run: openUploadFiles
      },
      {
        id: 'image',
        label: 'Upload image',
        hint: 'Attach a screenshot or mockup',
        icon: <ImagePlus size={14} />,
        testId: 'slash-image',
        keywords: ['image', 'photo', 'screenshot', 'picture'],
        run: openUploadImage
      }
    ]

    for (const action of quickActions) {
      items.push({
        id: action.id,
        label: action.label,
        hint: 'Insert quick action prompt',
        icon: <Sparkles size={14} />,
        testId: action.testId,
        keywords: [action.id, action.label.toLowerCase()],
        run: () => {
          clearSlashFromInput()
          onChange(action.prompt)
          setShowSlashMenu(false)
          textareaRef.current?.focus()
        }
      })
    }

    return items
  }, [quickActions, repoRootPath, value])

  const filteredSlashCommands = useMemo(() => {
    const query = slashQuery.trim().toLowerCase()
    if (!query) return slashCommands
    return slashCommands.filter(
      (command) =>
        command.id.includes(query) ||
        command.label.toLowerCase().includes(query) ||
        command.keywords.some((keyword) => keyword.includes(query))
    )
  }, [slashCommands, slashQuery])

  const handleSlashPick = (command: SlashCommand) => {
    setShowSlashMenu(false)
    command.run()
  }

  const handleComposerKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showSlashMenu && filteredSlashCommands.length > 0) {
      if (event.key === 'Tab' || (event.key === 'Enter' && !event.shiftKey)) {
        event.preventDefault()
        handleSlashPick(filteredSlashCommands[0])
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        clearSlashFromInput()
        setShowSlashMenu(false)
        return
      }
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      if (canSend) submit()
    }
  }

  const renderPrimaryAction = () => {
    if (isLoading) {
      return (
        <button
          type="button"
          disabled
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground opacity-70"
          aria-label="Sending"
        >
          <Loader2 size={16} className="animate-spin" />
        </button>
      )
    }

    if (isRecording) {
      return (
        <button
          type="button"
          data-testid="chat-voice-btn"
          onClick={toggleVoice}
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-destructive/10 text-destructive transition-colors hover:bg-destructive/15"
          aria-label="Stop recording"
        >
          <Square size={16} />
        </button>
      )
    }

    if (hasTypedContent) {
      return (
        <button
          data-testid="chat-send-btn"
          type="button"
          onClick={submit}
          disabled={!canSend}
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-all hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Send message"
        >
          <ArrowUp size={16} />
        </button>
      )
    }

    return (
      <button
        type="button"
        data-testid="chat-voice-btn"
        title={isSpeechInputSupported() ? 'Record voice prompt' : 'Voice input unavailable'}
        disabled={disabled || !isSpeechInputSupported()}
        onClick={toggleVoice}
        className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-background text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-main disabled:cursor-not-allowed disabled:opacity-40"
        aria-label="Record voice prompt"
      >
        {isSpeechInputSupported() ? <Mic size={16} /> : <MicOff size={16} />}
      </button>
    )
  }

  return (
    <>
      <div className="agent-composer shrink-0 p-2">
        {composerNotice && (
          <div
            data-testid="chat-composer-notice"
            className={`chat-composer-notice mb-2 rounded-xl border px-3 py-2 text-[11px] leading-relaxed ${
              composerNotice.tone === 'error'
                ? 'border-danger/30 bg-danger-bg text-danger'
                : composerNotice.tone === 'warning'
                  ? 'border-active/30 bg-active-soft text-active-text'
                  : 'border-border bg-surface text-text-secondary'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <p>{composerNotice.message}</p>
              {composerNotice.action && composerNotice.actionLabel && onComposerNoticeAction && (
                <button
                  type="button"
                  data-testid="chat-composer-notice-action"
                  onClick={() => onComposerNoticeAction(composerNotice.action!)}
                  disabled={composerNoticeBusy && composerNotice.action === 'reconnect'}
                  className="shrink-0 font-medium underline underline-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {composerNoticeBusy && composerNotice.action === 'reconnect'
                    ? 'Reconnecting…'
                    : composerNotice.actionLabel}
                </button>
              )}
            </div>
          </div>
        )}
        <div className="relative rounded-2xl border border-border bg-surface shadow-sm transition-shadow focus-within:border-primary/25 focus-within:ring-2 focus-within:ring-primary/8">
          {showSlashMenu && filteredSlashCommands.length > 0 && (
            <div
              data-testid="chat-slash-menu"
              className="absolute bottom-full left-3 right-3 z-30 mb-2 overflow-hidden rounded-xl border border-border bg-surface shadow-lg"
            >
              <div className="border-b border-border px-3 py-2 text-[11px] font-medium text-text-muted">
                Commands · type to filter · Tab or Enter to pick
              </div>
              <div className="max-h-56 overflow-y-auto p-1">
                {filteredSlashCommands.map((command) => (
                  <button
                    key={command.id}
                    type="button"
                    data-testid={command.testId}
                    onClick={() => handleSlashPick(command)}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-surface-hover"
                  >
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-background text-text-secondary">
                      {command.icon}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm text-text-main">/{command.id}</span>
                      <span className="block truncate text-[11px] text-text-secondary">{command.hint}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {(attachments.length > 0 || attachError || voiceHint) && (
            <div className="border-b border-border px-3 py-2">
              {attachments.length > 0 && (
                <div className="flex flex-wrap gap-1.5" data-testid="chat-attachment-chips">
                  {attachments.map((attachment) => (
                    <AttachmentChip key={attachment.id} attachment={attachment} onRemove={() => removeAttachment(attachment.id)} />
                  ))}
                </div>
              )}
              {voiceHint && (
                <div className="mt-1 text-[11px] text-primary" data-testid="chat-voice-hint">
                  {voiceHint}
                </div>
              )}
              {attachError && <div className="mt-1 text-[11px] text-destructive">{attachError}</div>}
            </div>
          )}

          <textarea
            ref={textareaRef}
            data-testid="chat-input"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={handleComposerKeyDown}
            rows={1}
            placeholder={placeholder}
            disabled={disabled || isLoading}
            className="max-h-36 min-h-6 w-full resize-none bg-transparent px-3 py-2 text-sm leading-5 text-text-main outline-none placeholder:text-text-muted disabled:opacity-60"
          />

          <div className="flex items-center justify-between gap-2 border-t border-border/80 px-2 py-2">
            <div className="flex items-center gap-0.5">
              <div className="relative">
                <button
                  type="button"
                  data-testid="chat-attach-btn"
                  title="Attach files or images"
                  disabled={disabled || isLoading}
                  onClick={() => setShowAttachMenu((open) => !open)}
                  className="composer-tool-btn"
                >
                  <Paperclip size={16} />
                </button>
                {showAttachMenu && (
                  <div
                    data-testid="chat-attach-menu"
                    className="absolute bottom-full left-0 z-20 mb-2 w-56 rounded-xl border border-border bg-surface p-1 shadow-lg"
                    onPointerDown={(event) => event.stopPropagation()}
                  >
                    <button
                      type="button"
                      data-testid="chat-attach-repo-btn"
                      disabled={!repoRootPath}
                      onClick={openRepoFilePicker}
                      className="flex w-full items-center rounded-lg px-3 py-2 text-left text-xs text-text-main hover:bg-surface-hover disabled:opacity-50"
                    >
                      <FolderOpen size={14} className="mr-2 shrink-0 text-text-muted" />
                      <span>
                        <span className="block font-medium">From repository</span>
                        <span className="block text-[11px] text-text-secondary">Pick files from this repo</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      data-testid="chat-attach-upload-btn"
                      onClick={openUploadFiles}
                      className="flex w-full items-center rounded-lg px-3 py-2 text-left text-xs text-text-main hover:bg-surface-hover"
                    >
                      <FileText size={14} className="mr-2 shrink-0 text-text-muted" />
                      <span>
                        <span className="block font-medium">Upload file</span>
                        <span className="block text-[11px] text-text-secondary">Choose from your computer</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      data-testid="chat-attach-image-btn"
                      onClick={openUploadImage}
                      className="flex w-full items-center rounded-lg px-3 py-2 text-left text-xs text-text-main hover:bg-surface-hover"
                    >
                      <ImagePlus size={14} className="mr-2 shrink-0 text-text-muted" />
                      <span>
                        <span className="block font-medium">Upload image</span>
                        <span className="block text-[11px] text-text-secondary">Screenshot or mockup</span>
                      </span>
                    </button>
                  </div>
                )}
              </div>

              {quickActions.length > 0 && (
                <div className="relative">
                  <button
                    type="button"
                    data-testid="chat-quick-actions-btn"
                    title="Quick actions"
                    disabled={disabled || isLoading}
                    onClick={() => setShowQuickMenu((open) => !open)}
                    className="composer-tool-btn"
                  >
                    <Sparkles size={16} />
                  </button>
                  {showQuickMenu && (
                    <div
                      data-testid="chat-quick-actions-menu"
                      className="absolute bottom-full left-0 z-20 mb-2 w-52 rounded-xl border border-border bg-surface p-1 shadow-lg"
                      onPointerDown={(event) => event.stopPropagation()}
                    >
                      {quickActions.map((action) => (
                        <button
                          key={action.id}
                          type="button"
                          data-testid={action.testId}
                          onClick={() => {
                            onChange(action.prompt)
                            setShowQuickMenu(false)
                            textareaRef.current?.focus()
                          }}
                          className="flex w-full rounded-lg px-3 py-2 text-left text-xs text-text-main hover:bg-surface-hover"
                        >
                          {action.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {renderPrimaryAction()}
          </div>
        </div>
        <div className="mt-1.5 flex items-center justify-between px-1 text-[10px] text-text-muted/70">
          <span>/ for commands · Enter to send</span>
          <span>
            {attachments.length > 0
              ? `${attachments.length} file${attachments.length === 1 ? '' : 's'} attached`
              : ''}
          </span>
        </div>
      </div>

      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        data-testid="chat-image-input"
        onChange={(event) => void handleImageInput(event)}
      />

      {repoRootPath && (
        <ContextFilePicker
          isOpen={showFilePicker}
          repoRootPath={repoRootPath}
          selectedPaths={attachments.filter((item) => item.absolutePath).map((item) => item.absolutePath!)}
          onClose={() => setShowFilePicker(false)}
          onConfirm={(paths) => void addRepoFiles(paths)}
        />
      )}
    </>
  )
}
