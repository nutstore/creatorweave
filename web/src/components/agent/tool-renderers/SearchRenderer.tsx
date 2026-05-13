/**
 * Renderer for `search` tool — grouped results by file with line numbers.
 */

import { Search } from 'lucide-react'
import type { ReactNode } from 'react'
import { CopyIconButton } from '../CopyIconButton'
import { registerRenderer } from './registry'
import type { ToolRenderCtx } from './types'

/** Matches SearchHit from search-worker-manager.ts */
interface SearchResult {
  path: string
  line?: number
  column?: number
  match?: string
  preview?: string
  [key: string]: unknown
}

registerRenderer({
  name: 'search',
  icon: <Search className="h-3.5 w-3.5 text-neutral-400" />,
  Summary(ctx) {
    const query = typeof ctx.args.query === 'string' ? ctx.args.query : ''
    const results = extractResults(ctx)
    const fileCount = new Set(results.map(r => r.path)).size

    return (
      <>
        <code className="font-medium text-neutral-700 dark:text-neutral-200">search</code>
        {query && (
          <span className="truncate text-neutral-400 dark:text-neutral-500">&quot;{query}&quot;</span>
        )}
        {!ctx.isExecuting && !ctx.isStreaming && results.length > 0 && (
          <span className="ml-auto text-xs text-neutral-400 shrink-0">
            {results.length} match{results.length !== 1 ? 'es' : ''} in {fileCount} file{fileCount !== 1 ? 's' : ''}
          </span>
        )}
        {!ctx.isExecuting && !ctx.isStreaming && results.length === 0 && !ctx.isError && (
          <span className="ml-auto text-xs text-neutral-400 shrink-0">no results</span>
        )}
      </>
    )
  },
  Detail(ctx) {
    if (ctx.isError) {
      return <ErrorDetail ctx={ctx} />
    }

    const results = extractResults(ctx)
    const query = typeof ctx.args.query === 'string' ? ctx.args.query : ''
    const mode = typeof ctx.args.mode === 'string' ? ctx.args.mode : undefined
    const glob = typeof ctx.args.glob === 'string' ? ctx.args.glob : undefined

    if (results.length === 0) {
      if (ctx.isExecuting) return <StreamingPlaceholder />
      return (
        <div className="px-3 py-2">
          <div className="text-xs text-neutral-400 dark:text-neutral-500">
            No matches found for &quot;{query}&quot;
          </div>
        </div>
      )
    }

    // Group by file
    const grouped = groupByFile(results)
    const maxFiles = 10
    const maxLinesPerFile = 5
    const shownFiles = grouped.slice(0, maxFiles)
    const hiddenFiles = grouped.length - maxFiles
    const rawText = results.map(r => `${r.path}${r.line ? `:${r.line}` : ''}${r.preview ? ` | ${r.preview}` : r.match ? ` | ${r.match}` : ''}`).join('\n')

    return (
      <div className="px-3 py-2 space-y-2">
        {/* Search options */}
        {(mode || glob) && (
          <div className="flex gap-2 text-[10px]">
            {mode && <span className="bg-neutral-100 dark:bg-neutral-800 text-neutral-500 px-1.5 py-0.5 rounded">{mode}</span>}
            {glob && <span className="bg-neutral-100 dark:bg-neutral-800 text-neutral-500 px-1.5 py-0.5 rounded">{glob}</span>}
          </div>
        )}

        {/* Results grouped by file */}
        <div className="space-y-2">
          {shownFiles.map(([filePath, matches]) => (
            <div key={filePath}>
              <div className="flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400 mb-1">
                <FileIcon />
                <span className="font-mono truncate">{filePath}</span>
                <span className="text-neutral-300 dark:text-neutral-600">·</span>
                <span className="text-neutral-400">{matches.length} match{matches.length !== 1 ? 'es' : ''}</span>
              </div>
              <div className="ml-5 space-y-0.5">
                {matches.slice(0, maxLinesPerFile).map((m, i) => (
                  <div key={i} className="text-xs font-mono text-neutral-400 dark:text-neutral-500 flex">
                    {m.line != null && (
                      <span className="select-none text-neutral-300 dark:text-neutral-700 w-8 text-right mr-2 shrink-0">L{m.line}</span>
                    )}
                    <span className="truncate">{highlightMatch(m.preview ?? m.match ?? '', query)}</span>
                  </div>
                ))}
                {matches.length > maxLinesPerFile && (
                  <div className="text-[10px] text-neutral-400 dark:text-neutral-600">
                    +{matches.length - maxLinesPerFile} more
                  </div>
                )}
              </div>
            </div>
          ))}
          {hiddenFiles > 0 && (
            <div className="text-[10px] text-neutral-400 dark:text-neutral-600 pl-5">
              +{hiddenFiles} more file{hiddenFiles !== 1 ? 's' : ''}
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <CopyIconButton content={rawText} />
        </div>
      </div>
    )
  },
})

function extractResults(ctx: ToolRenderCtx): SearchResult[] {
  const data = ctx.result?.data
  // data may be { results: [...] } envelope or a plain array
  if (Array.isArray(data)) return data as SearchResult[]
  if (data && typeof data === 'object' && Array.isArray((data as Record<string, unknown>).results)) {
    return (data as Record<string, unknown>).results as SearchResult[]
  }
  return []
}

function groupByFile(results: SearchResult[]): [string, SearchResult[]][] {
  const map = new Map<string, SearchResult[]>()
  for (const r of results) {
    const arr = map.get(r.path) ?? []
    arr.push(r)
    map.set(r.path, arr)
  }
  return Array.from(map.entries())
}

function FileIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-neutral-400 shrink-0">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  )
}

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query) return text
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return text
  return (
    <>
      {text.slice(0, idx)}
      <span className="text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 rounded-sm px-0.5">{text.slice(idx, idx + query.length)}</span>
      {text.slice(idx + query.length)}
    </>
  )
}

function ErrorDetail({ ctx }: { ctx: ToolRenderCtx }) {
  const errMsg = typeof ctx.result?.error === 'string' ? ctx.result.error : 'Search failed'
  return (
    <div className="px-3 py-2">
      <div className="rounded-md bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 p-2 text-xs text-red-600 dark:text-red-400">
        {errMsg}
      </div>
    </div>
  )
}

function StreamingPlaceholder() {
  return (
    <div className="px-3 py-2 space-y-2">
      <div className="flex items-center gap-1.5">
        <div className="h-3 w-3 animate-pulse rounded bg-neutral-200 dark:bg-neutral-700" />
        <div className="h-3 w-32 animate-pulse rounded bg-neutral-200 dark:bg-neutral-700" />
      </div>
      <div className="ml-5 space-y-1">
        <div className="h-3 w-48 animate-pulse rounded bg-neutral-100 dark:bg-neutral-800" />
        <div className="h-3 w-36 animate-pulse rounded bg-neutral-100 dark:bg-neutral-800" />
      </div>
    </div>
  )
}
