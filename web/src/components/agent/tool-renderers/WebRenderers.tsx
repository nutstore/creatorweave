/**
 * Renderer for `web_search` and `web_fetch` tools.
 *
 * Design: minimalist / ascetic — no borders, no badges, no color noise.
 * Content speaks. Whitespace structures.
 */

import { ExternalLink, Globe } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useT } from '@/i18n'
import { CopyIconButton } from '../CopyIconButton'
import { registerRenderer } from './registry'
import type { ToolRenderCtx } from './types'

// ── web_search ──

const PROVIDER_LABELS: Record<string, string> = {
  duckduckgo: 'DuckDuckGo',
  baidu: '百度',
}

registerRenderer({
  name: 'web_search',
  icon: <Globe className="h-3.5 w-3.5 text-neutral-400" />,
  Summary(ctx) {
    const t = useT()
    const query = typeof ctx.args.query === 'string' ? ctx.args.query : ''
    const results = extractSearchResults(ctx)
    const provider = extractProvider(ctx)
    return (
      <>
        <code className="font-medium text-neutral-700 dark:text-neutral-200">web_search</code>
        {query && <span className="truncate text-neutral-400 dark:text-neutral-500">&quot;{query}&quot;</span>}
        {!ctx.isExecuting && !ctx.isStreaming && (
          <>
            {provider && (
              <span className="text-[10px] text-neutral-400 dark:text-neutral-500 shrink-0">
                {PROVIDER_LABELS[provider] || provider}
              </span>
            )}
            <span className="ml-auto text-xs text-neutral-400 shrink-0">
              {t('toolCallDisplay.resultCount', { count: results.length, s: results.length !== 1 ? 's' : '' })}
            </span>
          </>
        )}
      </>
    )
  },
  Detail(ctx) {
    const t = useT()
    const results = extractSearchResults(ctx)
    const provider = extractProvider(ctx)
    if (results.length === 0) {
      if (ctx.isExecuting) return <StreamingSkeleton />
      return <div className="px-4 py-3 text-xs text-neutral-400">{t('toolCallDisplay.noResults')}</div>
    }
    return (
      <div className="px-4 py-3 space-y-3">
        {results.slice(0, 6).map((r, i) => (
          <div key={i} className="space-y-0.5">
            <div className="text-xs font-medium text-neutral-800 dark:text-neutral-200 truncate">{r.title}</div>
            <div className="text-[10px] text-neutral-400 dark:text-neutral-500 truncate">{r.url}</div>
            {r.snippet && <div className="text-[11px] text-neutral-500 dark:text-neutral-400 line-clamp-2">{r.snippet}</div>}
          </div>
        ))}
        {results.length > 6 && <div className="text-[10px] text-neutral-400">{t('toolCallDisplay.moreCount', { count: results.length - 6 })}</div>}
        <div className="flex items-center justify-between">
          {provider && <span className="text-[10px] text-neutral-400 dark:text-neutral-500">via {PROVIDER_LABELS[provider] || provider}</span>}
          <CopyIconButton content={results.map(r => `${r.title}\n${r.url}\n${r.snippet}`).join('\n\n')} />
        </div>
      </div>
    )
  },
})

// ── web_fetch ──

registerRenderer({
  name: 'web_fetch',
  icon: <Globe className="h-3.5 w-3.5 text-neutral-400" />,
  Summary(ctx) {
    const t = useT()
    const url = typeof ctx.args.url === 'string' ? ctx.args.url : ''
    const meta = extractMeta(ctx)
    return (
      <>
        <code className="font-medium text-neutral-700 dark:text-neutral-200">web_fetch</code>
        {meta.title ? (
          <span className="truncate text-neutral-500 dark:text-neutral-400 max-w-[260px]">{meta.title}</span>
        ) : (
          <span className="truncate text-neutral-400 dark:text-neutral-500 max-w-[200px]">{shortUrl(url)}</span>
        )}
        {ctx.isExecuting ? (
          <span className="ml-auto flex items-center gap-1.5 shrink-0">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-blue-500" />
            </span>
            <span className="text-blue-500 text-xs">{t('toolCallDisplay.fetching')}</span>
          </span>
        ) : (
          <span className="ml-auto text-[10px] text-neutral-400 dark:text-neutral-500 shrink-0">
            {[meta.siteName, meta.lineCount ? t('toolCallDisplay.lines', { count: meta.lineCount }) : ''].filter(Boolean).join(' · ')}
          </span>
        )}
      </>
    )
  },
  Detail(ctx) {
    const t = useT()
    const url = typeof ctx.args.url === 'string' ? ctx.args.url : ''
    const meta = extractMeta(ctx)

    if (ctx.isExecuting) return <FetchSkeleton />

    if (!meta.body) {
      return <div className="px-4 py-3 text-xs text-neutral-400">{t('toolCallDisplay.noContent')}</div>
    }

    const charLabel = meta.charCount > 1000
      ? `${(meta.charCount / 1000).toFixed(1)}k`
      : String(meta.charCount)

    return (
      <div>
        {/* Meta */}
        <div className="px-4 pt-3 pb-2.5 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-1.5">
            {meta.title && (
              <div className="text-[13px] font-medium text-neutral-800 dark:text-neutral-200 leading-snug line-clamp-2">{meta.title}</div>
            )}
            <div className="flex items-center gap-2 text-[10px] text-neutral-400 dark:text-neutral-500">
              <span className="truncate">{meta.siteName || shortUrl(url)}</span>
              {meta.byline && <><span className="text-neutral-300 dark:text-neutral-600">·</span><span className="truncate">{meta.byline}</span></>}
            </div>
          </div>
          <a href={url} target="_blank" rel="noopener noreferrer"
            className="shrink-0 mt-0.5 p-1.5 rounded-md text-neutral-300 hover:text-neutral-500 hover:bg-neutral-50 dark:text-neutral-600 dark:hover:text-neutral-400 dark:hover:bg-neutral-800/50 transition-colors">
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>

        {/* Content */}
        <div className="px-4 pb-3">
          <MarkdownBody body={meta.body} />
        </div>

        {/* Footer */}
        <div className="px-4 pb-2.5 flex items-center justify-between">
          <span className="text-[10px] text-neutral-400 dark:text-neutral-500">
            {t('toolCallDisplay.chars', { count: charLabel })}{meta.truncated ? ` · ${t('toolCallDisplay.truncated')}` : ''}
          </span>
          <CopyIconButton content={meta.body} />
        </div>
      </div>
    )
  },
})

// ── Components ────────────────────────────────────────────────────

/** Markdown preview: plain text with subtle formatting, no line numbers */
function MarkdownBody({ body }: { body: string }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const lines = body.split('\n')
  const maxLines = 12
  const overflow = lines.length > maxLines
  const visible = overflow && !open ? lines.slice(0, maxLines) : lines

  return (
    <div>
      <div className={`text-[11px] leading-[21px] font-mono text-neutral-500 dark:text-neutral-400 whitespace-pre-wrap break-words ${!open && overflow ? 'max-h-[252px] overflow-hidden relative' : 'max-h-[600px] overflow-auto'}`}>
        {!open && overflow && <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-white dark:from-neutral-900/80 to-transparent pointer-events-none" />}
        {visible.map((line, i) => (
          <MarkdownLine key={i}>{line}</MarkdownLine>
        ))}
      </div>
      {overflow && (
        <button onClick={() => setOpen(!open)}
          className="mt-2 text-[10px] text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors">
          {open ? t('toolCallDisplay.collapse') : t('toolCallDisplay.moreLines', { count: lines.length - maxLines })}
        </button>
      )}
    </div>
  )
}

/** Single rendered markdown line — minimal, monochrome */
function MarkdownLine({ children: line }: { children: string }) {
  const html = useMemo(() => renderLine(line), [line])
  if (line.trim() === '') return <div className="h-[9px]" />
  return <div dangerouslySetInnerHTML={{ __html: html }} />
}

function renderLine(line: string): string {
  const s = esc(line)
  if (s.startsWith('### ')) return `<span class="font-semibold text-neutral-800 dark:text-neutral-200" style="font-size:12px">${s}</span>`
  if (s.startsWith('## '))  return `<span class="font-semibold text-neutral-800 dark:text-neutral-200" style="font-size:12px">${s}</span>`
  if (s.startsWith('# '))   return `<span class="font-semibold text-neutral-800 dark:text-neutral-200" style="font-size:12px">${s}</span>`
  if (s.startsWith('> '))   return `<span class="text-neutral-400 dark:text-neutral-500 pl-2 border-l-2 border-neutral-200 dark:border-neutral-700">${s.slice(2)}</span>`
  if (s.match(/^- /))       return `<span class="text-neutral-300 dark:text-neutral-600 select-none mr-2">·</span>${renderInline(s.slice(2))}`
  if (s.match(/^\d+\. /))   return `<span class="text-neutral-300 dark:text-neutral-600 select-none mr-1">${s.match(/^(\d+\.)/)![1]}</span>${renderInline(s.replace(/^\d+\. /, ''))}`
  if (s.match(/^---+$/))    return `<div class="my-1 border-t border-neutral-100 dark:border-neutral-800"></div>`
  return renderInline(s)
}

function renderInline(s: string): string {
  let out = s
  out = out.replace(/\*\*(.+?)\*\*/g, '<strong class="font-medium text-neutral-700 dark:text-neutral-300">$1</strong>')
  out = out.replace(/`([^`]+)`/g, '<code class="text-[10px] text-neutral-500 dark:text-neutral-400 bg-neutral-100 dark:bg-neutral-800 rounded px-1 py-px">$1</code>')
  out = out.replace(/\[([^\]]+)\]\([^)]+\)/g, '<span class="text-neutral-500 dark:text-neutral-400">$1</span>')
  return out
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// ── Skeletons ─────────────────────────────────────────────────────

function FetchSkeleton() {
  return (
    <div className="px-4 py-3 space-y-4">
      <div className="space-y-2">
        <div className="h-3.5 w-3/5 rounded bg-neutral-100 dark:bg-neutral-800 animate-pulse" />
        <div className="h-2 w-1/4 rounded bg-neutral-100 dark:bg-neutral-800 animate-pulse" />
      </div>
      <div className="space-y-2">
        {[85, 70, 90, 55, 80, 45, 75, 60, 50, 85, 40].map((w, i) => (
          <div key={i} className="h-2 rounded bg-neutral-50 dark:bg-neutral-800/60 animate-pulse" style={{ width: w + '%', animationDelay: `${i * 60}ms` }} />
        ))}
      </div>
    </div>
  )
}

function StreamingSkeleton() {
  return (
    <div className="px-4 py-3 space-y-4">
      {[1, 2, 3].map(i => (
        <div key={i} className="space-y-2 animate-pulse">
          <div className="h-3 w-3/4 rounded bg-neutral-100 dark:bg-neutral-800" />
          <div className="h-2 w-1/2 rounded bg-neutral-50 dark:bg-neutral-800/60" />
          <div className="h-2 w-full rounded bg-neutral-50 dark:bg-neutral-800/60" />
        </div>
      ))}
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────

interface FetchMeta {
  title?: string
  byline?: string
  siteName?: string
  status?: number
  body?: string
  lineCount: number
  charCount: number
  truncated: boolean
}

function extractMeta(ctx: ToolRenderCtx): FetchMeta {
  const data = ctx.result?.data as Record<string, unknown> | undefined
  const readability = data?.readability as Record<string, unknown> | undefined
  const body = typeof data?.body === 'string' ? data.body : undefined
  return {
    title: typeof readability?.title === 'string' ? readability.title : undefined,
    byline: typeof readability?.byline === 'string' ? readability.byline : undefined,
    siteName: typeof readability?.siteName === 'string' ? readability.siteName : undefined,
    status: typeof data?.status === 'number' ? data.status : undefined,
    body,
    lineCount: body ? body.split('\n').length : 0,
    charCount: body ? body.length : 0,
    truncated: data?.truncated === true,
  }
}

interface SearchResult { title: string; url: string; snippet: string }

function extractSearchResults(ctx: ToolRenderCtx): SearchResult[] {
  const payload = ctx.result?.data as Record<string, unknown> | undefined
  const results = payload?.results ?? payload
  if (!Array.isArray(results)) return []
  return results.map((item: Record<string, unknown>) => ({
    title: typeof item.title === 'string' ? item.title : '',
    url: typeof item.url === 'string' ? item.url : typeof item.link === 'string' ? item.link : '',
    snippet: typeof item.snippet === 'string' ? item.snippet : typeof item.description === 'string' ? item.description : '',
  })).filter(r => r.title || r.url)
}

function extractProvider(ctx: ToolRenderCtx): string | undefined {
  const data = ctx.result?.data as Record<string, unknown> | undefined
  return typeof data?.provider === 'string' ? data.provider : undefined
}

function shortUrl(url: string): string {
  try {
    const u = new URL(url)
    return u.hostname + (u.pathname.length > 30 ? u.pathname.slice(0, 30) + '…' : u.pathname)
  } catch {
    return url.length > 50 ? url.slice(0, 50) + '…' : url
  }
}
