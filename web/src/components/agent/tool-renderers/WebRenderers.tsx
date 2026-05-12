/**
 * Renderer for `web_search` and `web_fetch` tools.
 * web_search: search results as link cards.
 * web_fetch: page metadata summary.
 */

import { Globe } from 'lucide-react'
import { CopyIconButton } from '../CopyIconButton'
import { registerRenderer } from './registry'
import type { ToolRenderCtx } from './types'

// ── web_search ──

registerRenderer({
  name: 'web_search',
  icon: <Globe className="h-3.5 w-3.5 text-neutral-400" />,
  Summary(ctx) {
    const query = typeof ctx.args.query === 'string' ? ctx.args.query : ''
    const results = extractSearchResults(ctx)

    return (
      <>
        <code className="font-medium text-neutral-700 dark:text-neutral-200">web_search</code>
        {query && (
          <span className="truncate text-neutral-400 dark:text-neutral-500">&quot;{query}&quot;</span>
        )}
        {!ctx.isExecuting && !ctx.isStreaming && (
          <span className="ml-auto text-xs text-neutral-400 shrink-0">{results.length} result{results.length !== 1 ? 's' : ''}</span>
        )}
      </>
    )
  },
  Detail(ctx) {
    const results = extractSearchResults(ctx)

    if (results.length === 0) {
      if (ctx.isExecuting) return <StreamingPlaceholder />
      return (
        <div className="px-3 py-2 text-xs text-neutral-400 dark:text-neutral-500">No results</div>
      )
    }

    const maxShow = 6

    return (
      <div className="px-3 py-2 space-y-2">
        <div className="space-y-2">
          {results.slice(0, maxShow).map((r, i) => (
            <div key={i} className="rounded-md border border-neutral-100 dark:border-neutral-800 p-2" style={{ animation: `tool-row-in .2s ease-out ${i * 40}ms backwards` }}>
              <div className="text-xs font-medium text-neutral-700 dark:text-neutral-300 truncate">{r.title}</div>
              {r.url && (
                <div className="text-[10px] text-blue-500 dark:text-blue-400 truncate mt-0.5">{r.url}</div>
              )}
              {r.snippet && (
                <div className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-1 line-clamp-2">{r.snippet}</div>
              )}
            </div>
          ))}
          {results.length > maxShow && (
            <div className="text-[10px] text-neutral-400 dark:text-neutral-600">
              +{results.length - maxShow} more results
            </div>
          )}
        </div>
        <div className="flex justify-end">
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
    const url = typeof ctx.args.url === 'string' ? ctx.args.url : ''
    const meta = extractFetchMeta(ctx)

    return (
      <>
        <code className="font-medium text-neutral-700 dark:text-neutral-200">web_fetch</code>
        <span className="truncate text-neutral-400 dark:text-neutral-500 max-w-[200px]">{shortUrl(url)}</span>
        {meta && (
          <span className="ml-auto text-xs text-neutral-400 shrink-0">{meta}</span>
        )}
      </>
    )
  },
  Detail(ctx) {
    const url = typeof ctx.args.url === 'string' ? ctx.args.url : ''
    const extract = typeof ctx.args.extract === 'string' ? ctx.args.extract : undefined
    const data = ctx.result?.data as Record<string, unknown> | undefined

    if (ctx.isExecuting) return <StreamingPlaceholder />

    const title = typeof data?.title === 'string' ? data.title : undefined
    const excerpt = typeof data?.excerpt === 'string' ? data.excerpt : undefined
    const status = typeof (ctx.result as Record<string, unknown>)?.status === 'number' ? (ctx.result as Record<string, unknown>).status : undefined

    return (
      <div className="px-3 py-2 space-y-2">
        <div className="text-xs">
          <div className="text-neutral-400 dark:text-neutral-500 truncate font-mono">{url}</div>
          {status && <div className="text-[10px] text-neutral-400 mt-0.5">Status: {status}</div>}
          {extract && <div className="text-[10px] text-neutral-400 mt-0.5">Mode: {extract}</div>}
        </div>

        {title && (
          <div className="text-xs font-medium text-neutral-700 dark:text-neutral-300">{title}</div>
        )}
        {excerpt && (
          <div className="text-[11px] text-neutral-500 dark:text-neutral-400 leading-relaxed line-clamp-4">{excerpt}</div>
        )}

        {!title && !excerpt && ctx.rawResult && (
          <pre className="max-h-40 overflow-auto rounded bg-neutral-50 dark:bg-neutral-900 p-2 text-[11px] text-neutral-500 dark:text-neutral-400">{ctx.rawResult.slice(0, 500)}</pre>
        )}
      </div>
    )
  },
})

// ── Helpers ──

interface SearchResult {
  title: string
  url: string
  snippet: string
}

function extractSearchResults(ctx: ToolRenderCtx): SearchResult[] {
  const data = ctx.result?.data
  if (!Array.isArray(data)) return []
  return data.map((item: Record<string, unknown>) => ({
    title: typeof item.title === 'string' ? item.title : '',
    url: typeof item.url === 'string' ? item.url : typeof item.link === 'string' ? item.link : '',
    snippet: typeof item.snippet === 'string' ? item.snippet : typeof item.description === 'string' ? item.description : '',
  })).filter(r => r.title || r.url)
}

function extractFetchMeta(ctx: ToolRenderCtx): string | undefined {
  const data = ctx.result?.data as Record<string, unknown> | undefined
  const status = typeof (ctx.result as Record<string, unknown>)?.status === 'number' ? (ctx.result as Record<string, unknown>).status : undefined
  if (status) return `${status} OK`
  return undefined
}

function shortUrl(url: string): string {
  try {
    const u = new URL(url)
    return u.hostname + (u.pathname.length > 30 ? u.pathname.slice(0, 30) + '...' : u.pathname)
  } catch {
    return url.length > 50 ? url.slice(0, 50) + '...' : url
  }
}

function StreamingPlaceholder() {
  return (
    <div className="px-3 py-2 space-y-2">
      {[1, 2, 3].map(i => (
        <div key={i} className="rounded-md border border-neutral-100 dark:border-neutral-800 p-2 animate-pulse">
          <div className="h-3 w-3/4 rounded bg-neutral-200 dark:bg-neutral-700 mb-1.5" />
          <div className="h-2.5 w-1/2 rounded bg-neutral-100 dark:bg-neutral-800 mb-1" />
          <div className="h-2.5 w-full rounded bg-neutral-100 dark:bg-neutral-800" />
        </div>
      ))}
    </div>
  )
}
