export type ChatAttachmentKind = 'repo-file' | 'image' | 'file'

export interface ChatAttachmentMeta {
  id: string
  kind: ChatAttachmentKind
  label: string
  relativePath?: string
  mimeType?: string
  previewDataUrl?: string
}

export interface ComposerAttachment extends ChatAttachmentMeta {
  absolutePath?: string
  content?: string
  contextBlock?: string
}

const TEXT_EXTENSIONS = new Set([
  'ts',
  'tsx',
  'js',
  'jsx',
  'json',
  'md',
  'mdx',
  'css',
  'scss',
  'html',
  'xml',
  'yaml',
  'yml',
  'toml',
  'txt',
  'py',
  'go',
  'rs',
  'java',
  'kt',
  'swift',
  'rb',
  'php',
  'sql',
  'sh',
  'bash',
  'zsh',
  'env',
  'gitignore',
  'dockerfile',
  'vue',
  'svelte'
])

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'])

const MAX_FILE_CHARS = 12000
const MAX_IMAGE_DATA_URL_CHARS = 120000

export function fileExtension(path: string): string {
  const base = path.split('/').pop() || path
  const idx = base.lastIndexOf('.')
  if (idx <= 0) return ''
  return base.slice(idx + 1).toLowerCase()
}

export function isLikelyTextFile(path: string): boolean {
  const ext = fileExtension(path)
  if (!ext) return true
  if (IMAGE_EXTENSIONS.has(ext)) return false
  return TEXT_EXTENSIONS.has(ext) || ext.length <= 4
}

export function isImagePath(path: string): boolean {
  return IMAGE_EXTENSIONS.has(fileExtension(path))
}

export function relativePathFromRoot(repoRootPath: string, absolutePath: string): string {
  const root = repoRootPath.replace(/\/$/, '')
  if (absolutePath === root) return '.'
  if (absolutePath.startsWith(`${root}/`)) return absolutePath.slice(root.length + 1)
  return absolutePath
}

export function createAttachmentId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function truncateContent(content: string, max = MAX_FILE_CHARS): string {
  if (content.length <= max) return content
  return `${content.slice(0, max)}\n\n...[truncated ${content.length - max} characters]`
}

export function buildFileContextBlock(label: string, relativePath: string, content: string): string {
  const ext = fileExtension(relativePath)
  const fence = ext || 'text'
  return `Attached repository file (${label}):\n\`\`\`${fence}\n${truncateContent(content)}\n\`\`\``
}

export function buildImageContextBlock(label: string, mimeType: string, dataUrl: string): string {
  const safeUrl = dataUrl.length > MAX_IMAGE_DATA_URL_CHARS ? dataUrl.slice(0, MAX_IMAGE_DATA_URL_CHARS) : dataUrl
  return [
    `Attached image (${label}, ${mimeType}).`,
    'If your model supports vision, inspect the image data below.',
    `IMAGE_DATA_URL: ${safeUrl}`
  ].join('\n')
}

export function buildUploadFileContextBlock(label: string, content: string): string {
  return `Attached file (${label}):\n\`\`\`\n${truncateContent(content)}\n\`\`\``
}

export function toPersistedAttachmentMeta(attachment: ComposerAttachment): ChatAttachmentMeta {
  return {
    id: attachment.id,
    kind: attachment.kind,
    label: attachment.label,
    relativePath: attachment.relativePath,
    mimeType: attachment.mimeType,
    previewDataUrl:
      attachment.kind === 'image' && attachment.previewDataUrl
        ? attachment.previewDataUrl.slice(0, 24000)
        : undefined
  }
}

export function buildAttachmentsContext(attachments: ComposerAttachment[]): string {
  const blocks = attachments.map((item) => item.contextBlock).filter(Boolean) as string[]
  if (blocks.length === 0) return ''
  return ['User-provided context attachments:', ...blocks].join('\n\n')
}

export async function arrayBufferToDataUrl(buffer: ArrayBuffer, mimeType: string): Promise<string> {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i])
  }
  return `data:${mimeType};base64,${btoa(binary)}`
}

export function guessMimeType(path: string): string {
  const ext = fileExtension(path)
  if (ext === 'png') return 'image/png'
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  if (ext === 'gif') return 'image/gif'
  if (ext === 'webp') return 'image/webp'
  if (ext === 'svg') return 'image/svg+xml'
  return 'application/octet-stream'
}
