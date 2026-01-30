/**
 * MarkdownContent - renders markdown text with syntax highlighting.
 * Used by both MessageBubble (final messages) and streaming display.
 */

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface MarkdownContentProps {
  content: string
}

export function MarkdownContent({ content }: MarkdownContentProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        // Code blocks
        code({ className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || '')
          const isBlock = match || (typeof children === 'string' && children.includes('\n'))
          if (isBlock) {
            return (
              <div className="my-2 overflow-hidden rounded-md border border-neutral-200">
                {match && (
                  <div className="bg-neutral-100 px-3 py-1 text-[10px] font-medium uppercase tracking-wider text-neutral-500">
                    {match[1]}
                  </div>
                )}
                <pre className="overflow-x-auto bg-neutral-50 p-3">
                  <code className={`text-[13px] leading-relaxed ${className || ''}`} {...props}>
                    {children}
                  </code>
                </pre>
              </div>
            )
          }
          return (
            <code
              className="rounded bg-neutral-100 px-1.5 py-0.5 text-[13px] text-pink-600"
              {...props}
            >
              {children}
            </code>
          )
        },
        // Paragraphs
        p({ children }) {
          return <p className="mb-2 last:mb-0">{children}</p>
        },
        // Lists
        ul({ children }) {
          return <ul className="mb-2 list-disc space-y-0.5 pl-5 last:mb-0">{children}</ul>
        },
        ol({ children }) {
          return <ol className="mb-2 list-decimal space-y-0.5 pl-5 last:mb-0">{children}</ol>
        },
        // Links
        a({ href, children }) {
          return (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary-600 underline hover:text-primary-700"
            >
              {children}
            </a>
          )
        },
        // Headings
        h1({ children }) {
          return <h1 className="mb-2 text-base font-bold">{children}</h1>
        },
        h2({ children }) {
          return <h2 className="mb-1.5 text-sm font-bold">{children}</h2>
        },
        h3({ children }) {
          return <h3 className="mb-1 text-sm font-semibold">{children}</h3>
        },
        // Blockquote
        blockquote({ children }) {
          return (
            <blockquote className="mb-2 border-l-2 border-neutral-300 pl-3 text-neutral-600 last:mb-0">
              {children}
            </blockquote>
          )
        },
        // Table
        table({ children }) {
          return (
            <div className="my-2 overflow-x-auto">
              <table className="w-full border-collapse text-sm">{children}</table>
            </div>
          )
        },
        th({ children }) {
          return (
            <th className="border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-left font-medium">
              {children}
            </th>
          )
        },
        td({ children }) {
          return <td className="border border-neutral-200 px-3 py-1.5">{children}</td>
        },
        // Horizontal rule
        hr() {
          return <hr className="my-3 border-neutral-200" />
        },
      }}
    >
      {content}
    </ReactMarkdown>
  )
}
