/**
 * MarkdownContent - renders markdown text with syntax highlighting.
 * Used by both MessageBubble (final messages) and streaming display.
 *
 * Memoized: avoids re-parsing markdown when content hasn't changed.
 * This is critical during streaming — every delta triggers a parent
 * re-render, but already-committed text blocks stay stable.
 *
 * Image support: `![alt](assets/images/...)` references are resolved
 * from OPFS and rendered as inline images with loading states.
 *
 * Math support: LaTeX formulas via remark-math + rehype-katex.
 * Inline: $x_1$  Block: $$\varepsilon_l = x_l - \hat{x}_l$$
 */

import { memo, useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import { Loader2 } from 'lucide-react'
import { readAssetBlob, readWorkspaceFileBlob } from './asset-utils'

/** Check if a path looks like an OPFS asset reference */
function isAssetPath(src: string): boolean {
  return src.startsWith('assets/') || src.startsWith('/assets/')
}

/** Strip leading "assets/" to get the relative OPFS path */
function toRelativePath(src: string): string {
  const p = src.startsWith('/') ? src.slice(1) : src
  if (p.startsWith('assets/')) return p.slice('assets/'.length)
  return p
}

/**
 * Check whether a string looks like a local/relative file reference
 * rather than a remote URL or data URI. Bare filenames such as
 * `byd_2026_05_sales.png` or `sub/dir/img.png` qualify; `http(s)://`,
 * `data:`, `blob:` and protocol-relative URLs do not.
 */
function isLocalFilePath(src: string): boolean {
  return (
    !/^[a-z][a-z0-9+.-]*:/i.test(src) && // not a URL scheme (http:, data:, blob: ...)
    !src.startsWith('//') && // not protocol-relative
    !src.startsWith('#') // not an anchor
  )
}

/**
 * MarkdownImage — custom `img` component for react-markdown.
 *
 * Resolution order for local images:
 * 1. `assets/...` paths → conversation assets directory (OPFS)
 * 2. Any other local/relative path →
 *    a. try conversation assets directory (stripped of any rootName prefix)
 *    b. try the workspace OPFS store (rootName/path or bare path)
 *
 * External URLs and data URIs are rendered as-is.
 */
function MarkdownImage({ src, alt, ...props }: React.ComponentPropsWithoutRef<'img'>) {
  const srcStr = src || ''

  // External URL or data URI → render as-is
  if (!isAssetPath(srcStr) && !isLocalFilePath(srcStr)) {
    return <img src={srcStr} alt={alt || ''} loading="lazy" {...props} />
  }

  return <AssetImage src={srcStr} alt={alt || ''} />
}

/**
 * AssetImage — resolves a local image reference into an inline image.
 *
 * Resolution order:
 * 1. If `src` is an `assets/...` path → read from conversation assets dir.
 * 2. Otherwise (bare/workspace-relative path) →
 *    a. try the conversation assets dir (last segment as filename)
 *    b. fall back to the workspace OPFS store (handles `rootName/path`
 *       and bare paths across all roots)
 *
 * Shows loading spinner while reading, error state on failure.
 */
function AssetImage({ src, alt }: { src: string; alt: string }) {
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState(false)
  const urlRef = useRef<string | null>(null)
  const assetPath = isAssetPath(src) ? toRelativePath(src) : src.replace(/^\/+/, '')

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    }
  }, [])

  // Load image (assets dir first, then workspace fallback)
  useEffect(() => {
    let cancelled = false

    async function load() {
      // 1. Try the conversation assets directory
      const blob = await readAssetBlob(assetPath)
      if (blob) return blob

      // 2. Fall back to the workspace OPFS store. `readWorkspaceFileBlob`
      //    accepts both `rootName/path` and bare paths; the runtime resolves
      //    bare paths against the configured roots.
      return await readWorkspaceFileBlob(assetPath)
    }

    load().then((blob) => {
      if (cancelled) return
      if (blob) {
        const objectUrl = URL.createObjectURL(blob)
        urlRef.current = objectUrl
        setUrl(objectUrl)
      } else {
        setError(true)
      }
    })
    return () => { cancelled = true }
  }, [assetPath])

  if (error) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded bg-red-50 px-2 py-1 text-xs text-red-500 dark:bg-red-900/20 dark:text-red-400">
        ⚠ Image not found: {assetPath.split('/').pop()}
      </span>
    )
  }

  if (!url) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded bg-neutral-100 px-2 py-1 text-xs text-neutral-400 dark:bg-neutral-800">
        <Loader2 className="h-3 w-3 animate-spin" />
        Loading image…
      </span>
    )
  }

  return (
    <img
      src={url}
      alt={alt}
      className="max-w-full rounded-md"
      loading="lazy"
    />
  )
}

// Stable module-level references — prevents ReactMarkdown from re-parsing
// when the MarkdownContent parent re-renders with unchanged content.
// Previously these were inline literals, causing new array/object refs on
// every render → 76 unnecessary re-renders on cancel (react-scan profiled).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const REMARK_PLUGINS: any = [remarkGfm, remarkMath]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const REHYPE_PLUGINS: any = [rehypeKatex]

const MARKDOWN_COMPONENTS = {
  // Code blocks
  code({ className, children, ...props }: React.ComponentPropsWithoutRef<'code'> & { className?: string }) {
    const match = /language-(\w+)/.exec(className || '')
    const isBlock = match || (typeof children === 'string' && children.includes('\n'))
    if (isBlock) {
      return (
        <div className="my-2 overflow-hidden rounded-md border border-neutral-200 dark:border-neutral-700">
          {match && (
            <div className="bg-neutral-100 dark:bg-neutral-800 px-3 py-1 text-[10px] font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
              {match[1]}
            </div>
          )}
          <pre className="overflow-x-auto bg-neutral-50 dark:bg-[#1A1A1A] p-3">
            <code className={`text-[13px] leading-relaxed text-neutral-800 dark:text-white ${className || ''}`} {...props}>
              {children}
            </code>
          </pre>
        </div>
      )
    }
    return (
      <code
        className="rounded bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.5 text-[13px] text-pink-600 dark:text-pink-400"
        {...props}
      >
        {children}
      </code>
    )
  },
  // Paragraphs
  p({ children }: React.ComponentPropsWithoutRef<'p'>) {
    return <p className="mb-2 last:mb-0">{children}</p>
  },
  // Lists
  ul({ children }: React.ComponentPropsWithoutRef<'ul'>) {
    return <ul className="mb-2 list-disc space-y-0.5 pl-5 last:mb-0">{children}</ul>
  },
  ol({ children }: React.ComponentPropsWithoutRef<'ol'>) {
    return <ol className="mb-2 list-decimal space-y-0.5 pl-5 last:mb-0">{children}</ol>
  },
  // Links
  a({ href, children }: React.ComponentPropsWithoutRef<'a'>) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary-600 dark:text-primary-400 underline hover:text-primary-700 dark:hover:text-primary-300"
      >
        {children}
      </a>
    )
  },
  // Headings
  h1({ children }: React.ComponentPropsWithoutRef<'h1'>) {
    return <h1 className="mb-2 text-base font-bold text-neutral-900 dark:text-white">{children}</h1>
  },
  h2({ children }: React.ComponentPropsWithoutRef<'h2'>) {
    return <h2 className="mb-1.5 text-sm font-bold text-neutral-900 dark:text-white">{children}</h2>
  },
  h3({ children }: React.ComponentPropsWithoutRef<'h3'>) {
    return <h3 className="mb-1 text-sm font-semibold text-neutral-900 dark:text-white">{children}</h3>
  },
  // Blockquote
  blockquote({ children }: React.ComponentPropsWithoutRef<'blockquote'>) {
    return (
      <blockquote className="mb-2 border-l-2 border-neutral-300 dark:border-neutral-600 pl-3 text-neutral-600 dark:text-white last:mb-0">
        {children}
      </blockquote>
    )
  },
  // Table
  table({ children }: React.ComponentPropsWithoutRef<'table'>) {
    return (
      <div className="my-2 overflow-x-auto">
        <table className="w-full border-collapse text-sm">{children}</table>
      </div>
    )
  },
  th({ children }: React.ComponentPropsWithoutRef<'th'>) {
    return (
      <th className="border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 px-3 py-1.5 text-left font-medium dark:text-white">
        {children}
      </th>
    )
  },
  td({ children }: React.ComponentPropsWithoutRef<'td'>) {
    return <td className="border border-neutral-200 dark:border-neutral-700 px-3 py-1.5 dark:text-white">{children}</td>
  },
  // Horizontal rule
  hr() {
    return <hr className="my-3 border-neutral-200 dark:border-neutral-700" />
  },
  // Images — resolve OPFS asset paths (e.g. assets/images/...)
  img(props: React.ComponentPropsWithoutRef<'img'>) {
    return <MarkdownImage {...props} />
  },
} as const

/**
 * Convert LaTeX-style delimiters to remark-math compatible syntax.
 * \[...\] → $$...$$ (display math)
 * \(...\) → $...$ (inline math)
 *
 * LLMs often output \[\] and \(\) which remark-math doesn't recognize
 * by default (it only handles $$ and $).
 */
function normalizeMathDelimiters(content: string): string {
  // Display math: \[ ... \] → $$ ... $$
  let result = content.replace(/\\\[([\s\S]*?)\\\]/g, (_match, body) => `$$${body}$$`)
  // Inline math: \( ... \) → $ ... $
  result = result.replace(/\\\(([\s\S]*?)\\\)/g, (_match, body) => `$${body}$`)
  return result
}

interface MarkdownContentProps {
  content: string
}

export const MarkdownContent = memo(function MarkdownContent({ content }: MarkdownContentProps) {
  const normalized = normalizeMathDelimiters(content)
  return (
    <ReactMarkdown
      remarkPlugins={REMARK_PLUGINS}
      rehypePlugins={REHYPE_PLUGINS}
      components={MARKDOWN_COMPONENTS}
    >
      {normalized}
    </ReactMarkdown>
  )
})
