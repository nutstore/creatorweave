/**
 * Renderer for `search_conversations` tool — cross-workspace conversation search
 * with time-window / project filters and project activity breakdown.
 *
 * Layout:
 *   Summary: icon + mode badge + filter chips + count + mini breakdown
 *   Detail:  conversation list (title + project + relative time) + breakdown table
 */

import { MessageSquare, Search, Clock } from 'lucide-react'
import { registerRenderer } from './registry'
import type { ToolRenderCtx } from './types'

interface SearchResultItem {
  conversationId: string
  title: string
  workspaceName?: string
  projectName?: string
  updatedAt: number
  snippet?: string | null
}

interface ProjectBreakdownItem {
  projectName: string
  conversationCount: number
  lastActivityAt: number
}

interface SearchConversationsData {
  query?: string
  totalMatches?: number
  hasMore?: boolean
  mode?: 'keyword' | 'list'
  results?: SearchResultItem[]
  projects_breakdown?: ProjectBreakdownItem[]
  filters?: {
    updated_after?: number | null
    updated_before?: number | null
    project?: string | null
    sort_by?: string
  }
}

/** Extract the data payload from the tool result envelope. */
function extractData(ctx: ToolRenderCtx): SearchConversationsData | null {
  if (!ctx.result?.data) return null
  return ctx.result.data as SearchConversationsData
}

/** Format a Unix-ms timestamp as a short relative time (e.g. "3h ago", "2d ago"). */
function relativeTime(ms: number): string {
  const now = Date.now()
  const diff = now - ms
  const sec = Math.floor(diff / 1000)
  const min = Math.floor(sec / 60)
  const hr = Math.floor(min / 60)
  const day = Math.floor(hr / 24)

  if (sec < 60) return 'just now'
  if (min < 60) return `${min}m ago`
  if (hr < 24) return `${hr}h ago`
  if (day < 7) return `${day}d ago`
  // Fall back to date for older items
  const d = new Date(ms)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

/** Truncate a string to n chars with ellipsis. */
function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}

/** Project badge color — deterministic per project name for visual distinction. */
const PROJECT_COLORS = [
  'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300',
  'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300',
  'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
]

function projectColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  }
  return PROJECT_COLORS[hash % PROJECT_COLORS.length]
}

function ProjectBadge({ name }: { name: string }) {
  const short = name.length > 22 ? name.slice(0, 20) + '…' : name
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium shrink-0 ${projectColor(name)}`}
      title={name}
    >
      {short}
    </span>
  )
}

registerRenderer({
  name: 'search_conversations',
  icon: <MessageSquare className="h-3.5 w-3.5 text-neutral-400" />,
  Summary(ctx) {
    const data = extractData(ctx)

    if (ctx.isError) {
      return (
        <>
          <code className="font-medium text-neutral-700 dark:text-neutral-200">search_conversations</code>
          <span className="ml-auto shrink-0 text-xs text-red-500">failed</span>
        </>
      )
    }

    // Streaming / executing state
    if (ctx.isExecuting || ctx.isStreaming || !data) {
      const query = typeof ctx.args.query === 'string' ? ctx.args.query.trim() : ''
      const mode = query ? 'keyword' : 'list'
      return (
        <>
          <code className="font-medium text-neutral-700 dark:text-neutral-200">search_conversations</code>
          <span className="ml-1 rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
            {mode}
          </span>
          {query && (
            <span className="truncate text-neutral-400 dark:text-neutral-500">"{truncate(query, 30)}"</span>
          )}
          {typeof ctx.args.updated_after === 'number' && (
            <span className="text-xs text-neutral-400">· last {relativeTime(ctx.args.updated_after as number)} →</span>
          )}
        </>
      )
    }

    const total = data.totalMatches ?? 0
    const mode = data.mode ?? 'list'
    const filters = data.filters ?? {}
    const breakdown = data.projects_breakdown ?? []

    // Build filter chips
    const chips: string[] = []
    if (filters.updated_after) chips.push(`≥ ${relativeTime(filters.updated_after)}`)
    if (filters.updated_before) chips.push(`≤ ${relativeTime(filters.updated_before)}`)
    if (filters.project) chips.push(filters.project)

    return (
      <>
        <code className="font-medium text-neutral-700 dark:text-neutral-200">search_conversations</code>
        <span className="ml-1 rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
          {mode}
        </span>
        {mode === 'keyword' && data.query && data.query !== '*' && (
          <span className="truncate text-neutral-400 dark:text-neutral-500">"{truncate(data.query, 30)}"</span>
        )}
        {chips.length > 0 && (
          <span className="truncate text-xs text-neutral-400 dark:text-neutral-500">
            {chips.join(' · ')}
          </span>
        )}
        <span className="ml-auto shrink-0 text-xs text-neutral-400">
          {total} match{total !== 1 ? 'es' : ''}
        </span>
        {/* Mini breakdown badges — only when multiple projects */}
        {breakdown.length > 1 && (
          <span className="hidden sm:inline-flex items-center gap-1 shrink-0">
            {breakdown.slice(0, 3).map((p) => (
              <span
                key={p.projectName}
                className={`inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] ${projectColor(p.projectName)}`}
                title={p.projectName}
              >
                {p.conversationCount}
              </span>
            ))}
          </span>
        )}
      </>
    )
  },

  Detail(ctx) {
    const data = extractData(ctx)

    // Error envelopes do not carry a `data` payload, so this must precede
    // the no-data loading state below.
    if (ctx.isError) {
      const errMsg =
        (ctx.result?.error as Record<string, unknown> | undefined)?.message ?? 'Search failed'
      return (
        <div className="px-3 py-2 text-xs text-red-400 dark:text-red-400/80">{String(errMsg)}</div>
      )
    }

    if (ctx.isExecuting || ctx.isStreaming || !data) {
      return <StreamingPlaceholder />
    }

    const results = data.results ?? []
    const breakdown = data.projects_breakdown ?? []
    const filters = data.filters ?? {}
    const total = data.totalMatches ?? 0
    const mode = data.mode ?? 'list'
    const maxShow = 15

    if (results.length === 0) {
      return (
        <div className="px-3 py-3 text-xs text-neutral-400 dark:text-neutral-500">
          No conversations matched.
        </div>
      )
    }

    return (
      <div className="px-3 py-2 space-y-2">
        {/* Filter summary line */}
        {(filters.updated_after || filters.updated_before || filters.project || mode === 'keyword') && (
          <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-neutral-400 dark:text-neutral-500">
            {mode === 'keyword' && data.query && data.query !== '*' && (
              <span className="inline-flex items-center gap-1 bg-neutral-100 dark:bg-neutral-800 rounded px-1.5 py-0.5">
                <Search className="h-2.5 w-2.5" />
                "{truncate(data.query, 24)}"
              </span>
            )}
            {filters.updated_after && (
              <span className="inline-flex items-center gap-1 bg-neutral-100 dark:bg-neutral-800 rounded px-1.5 py-0.5">
                <Clock className="h-2.5 w-2.5" />
                ≥ {relativeTime(filters.updated_after)}
              </span>
            )}
            {filters.updated_before && (
              <span className="inline-flex items-center gap-1 bg-neutral-100 dark:bg-neutral-800 rounded px-1.5 py-0.5">
                <Clock className="h-2.5 w-2.5" />
                ≤ {relativeTime(filters.updated_before)}
              </span>
            )}
            {filters.project && <ProjectBadge name={filters.project} />}
          </div>
        )}

        {/* Project breakdown table — only when meaningful (multi-project list mode) */}
        {breakdown.length > 1 && (
          <div className="rounded border border-neutral-200 dark:border-neutral-700 overflow-hidden">
            <div className="bg-neutral-50 dark:bg-neutral-800/50 px-2 py-1 text-[10px] font-medium text-neutral-500 dark:text-neutral-400">
              Projects ({breakdown.length})
            </div>
            <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {breakdown.map((p) => (
                <div key={p.projectName} className="flex items-center gap-2 px-2 py-1 text-xs">
                  <ProjectBadge name={p.projectName} />
                  <span className="text-neutral-500 dark:text-neutral-400">{p.conversationCount}</span>
                  <span className="ml-auto text-[10px] text-neutral-400">{relativeTime(p.lastActivityAt)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Conversation list */}
        <div className="space-y-1">
          {results.slice(0, maxShow).map((r, i) => (
            <div
              key={r.conversationId}
              className="flex items-center gap-2 text-xs"
              style={{ animation: `tool-row-in .2s ease-out ${i * 18}ms backwards` }}
            >
              <MessageSquare className="h-3 w-3 text-neutral-400 shrink-0" />
              <span
                className="text-neutral-600 dark:text-neutral-300 truncate flex-1"
                title={r.title}
              >
                {r.title || '(untitled)'}
              </span>
              {r.projectName && <ProjectBadge name={r.projectName} />}
              <span className="text-[10px] text-neutral-400 shrink-0">{relativeTime(r.updatedAt)}</span>
            </div>
          ))}
        </div>

        {/* Overflow indicator */}
        {results.length > maxShow && (
          <div className="text-[10px] text-neutral-400 dark:text-neutral-600">
            +{results.length - maxShow} more ({total} total{data.hasMore ? ', has more' : ''})
          </div>
        )}
        {data.hasMore && results.length <= maxShow && (
          <div className="text-[10px] text-neutral-400 dark:text-neutral-600">more results available</div>
        )}
      </div>
    )
  },
})

function StreamingPlaceholder() {
  return (
    <div className="px-3 py-2 space-y-1.5">
      {[80, 60, 70, 50, 65].map((w, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="h-3 w-3 rounded bg-neutral-200 dark:bg-neutral-700 animate-pulse" />
          <div
            className="h-3 rounded bg-neutral-100 dark:bg-neutral-800 animate-pulse"
            style={{ width: w + '%' }}
          />
        </div>
      ))}
    </div>
  )
}
