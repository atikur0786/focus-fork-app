import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface ChatMarkdownProps {
  content: string
  inverted?: boolean
}

export function ChatMarkdown({ content, inverted = false }: ChatMarkdownProps): React.JSX.Element {
  return (
    <div
      data-testid="chat-markdown"
      className={`chat-markdown text-sm leading-6 ${inverted ? 'chat-markdown-inverted' : ''}`}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h1 className="mb-2 mt-3 text-base font-semibold first:mt-0">{children}</h1>,
          h2: ({ children }) => <h2 className="mb-2 mt-3 text-sm font-semibold first:mt-0">{children}</h2>,
          h3: ({ children }) => <h3 className="mb-1.5 mt-2.5 text-sm font-semibold first:mt-0">{children}</h3>,
          h4: ({ children }) => <h4 className="mb-1 mt-2 text-sm font-semibold first:mt-0">{children}</h4>,
          p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
          ul: ({ children }) => <ul className="mb-2 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>,
          ol: ({ children }) => <ol className="mb-2 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>,
          li: ({ children }) => <li className="leading-6">{children}</li>,
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          code: ({ className, children }) => {
            const isBlock = className?.includes('language-')
            if (isBlock) {
              return (
                <code className="block overflow-x-auto rounded-lg bg-zinc-900 px-3.5 py-2.5 font-mono text-[13px] leading-relaxed text-zinc-200 dark:bg-zinc-950">
                  {children}
                </code>
              )
            }
            return (
              <code className="rounded-md bg-black/[0.06] px-1.5 py-0.5 font-mono text-[0.85em] dark:bg-white/[0.08]">
                {children}
              </code>
            )
          },
          pre: ({ children }) => <pre className="mb-3 overflow-x-auto rounded-lg last:mb-0">{children}</pre>,
          blockquote: ({ children }) => (
            <blockquote className="mb-2 border-l-2 border-border pl-3 text-text-secondary last:mb-0">{children}</blockquote>
          ),
          a: ({ href, children }) => (
            <a href={href} className="font-medium underline underline-offset-2" target="_blank" rel="noreferrer">
              {children}
            </a>
          )
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
