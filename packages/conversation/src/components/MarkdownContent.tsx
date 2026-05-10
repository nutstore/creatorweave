/**
 * MarkdownContent - renders markdown text with syntax highlighting.
 */

import { memo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

// Stable module-level references — prevents ReactMarkdown from re-parsing
// when the MarkdownContent parent re-renders with unchanged content.
const REMARK_PLUGINS = [remarkGfm] as const

const MARKDOWN_COMPONENTS = {
  code({ className, children, ...props }: React.ComponentPropsWithoutRef<'code'> & { className?: string }) {
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
  p({ children }: React.ComponentPropsWithoutRef<'p'>) {
    return <p className="mb-2 last:mb-0">{children}</p>
  },
  ul({ children }: React.ComponentPropsWithoutRef<'ul'>) {
    return <ul className="mb-2 list-disc space-y-0.5 pl-5 last:mb-0">{children}</ul>
  },
  ol({ children }: React.ComponentPropsWithoutRef<'ol'>) {
    return <ol className="mb-2 list-decimal space-y-0.5 pl-5 last:mb-0">{children}</ol>
  },
  a({ href, children }: React.ComponentPropsWithoutRef<'a'>) {
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
  h1({ children }: React.ComponentPropsWithoutRef<'h1'>) {
    return <h1 className="mb-2 text-base font-bold">{children}</h1>
  },
  h2({ children }: React.ComponentPropsWithoutRef<'h2'>) {
    return <h2 className="mb-1.5 text-sm font-bold">{children}</h2>
  },
  h3({ children }: React.ComponentPropsWithoutRef<'h3'>) {
    return <h3 className="mb-1 text-sm font-semibold">{children}</h3>
  },
  blockquote({ children }: React.ComponentPropsWithoutRef<'blockquote'>) {
    return (
      <blockquote className="mb-2 border-l-2 border-neutral-300 pl-3 text-neutral-600 last:mb-0">
        {children}
      </blockquote>
    )
  },
  table({ children }: React.ComponentPropsWithoutRef<'table'>) {
    return (
      <div className="my-2 overflow-x-auto">
        <table className="w-full border-collapse text-sm">{children}</table>
      </div>
    )
  },
  th({ children }: React.ComponentPropsWithoutRef<'th'>) {
    return (
      <th className="border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-left font-medium">
        {children}
      </th>
    )
  },
  td({ children }: React.ComponentPropsWithoutRef<'td'>) {
    return <td className="border border-neutral-200 px-3 py-1.5">{children}</td>
  },
  hr() {
    return <hr className="my-3 border-neutral-200" />
  },
} as const

interface MarkdownContentProps {
  content: string
}

export const MarkdownContent = memo(function MarkdownContent({ content }: MarkdownContentProps) {
  return (
    <ReactMarkdown
      remarkPlugins={REMARK_PLUGINS}
      components={MARKDOWN_COMPONENTS}
    >
      {content}
    </ReactMarkdown>
  )
})
