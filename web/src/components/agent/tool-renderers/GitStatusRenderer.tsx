/**
 * Renderer for `git_status` tool — working tree status with file change list.
 */

import { GitBranch } from 'lucide-react'
import { registerRenderer } from './registry'
import type { ToolRenderCtx } from './types'

registerRenderer({
  name: 'git_status',
  icon: <GitBranch className="h-3.5 w-3.5 text-neutral-400" />,
  Summary(ctx) {
    if (ctx.isExecuting) {
      return (
        <>
          <code className="font-medium text-neutral-700 dark:text-neutral-200">git_status</code>
          <span className="text-xs text-blue-500">loading...</span>
        </>
      )
    }

    const entries = extractEntries(ctx)
    return (
      <>
        <code className="font-medium text-neutral-700 dark:text-neutral-200">git_status</code>
        <span className="ml-auto text-xs text-neutral-400 shrink-0">{entries.length} change{entries.length !== 1 ? 's' : ''}</span>
      </>
    )
  },
  Detail(ctx) {
    const entries = extractEntries(ctx)

    if (entries.length === 0) {
      if (ctx.isExecuting) return <StreamingPlaceholder />
      return (
        <div className="px-3 py-2 text-xs text-neutral-400 dark:text-neutral-500">Working tree clean</div>
      )
    }

    return (
      <div className="px-3 py-2 space-y-0.5">
        {entries.map((entry, i) => (
          <div key={i} className="flex items-center gap-2 text-xs font-mono">
            <span className={
              entry.status === 'A' || entry.status === '?' ? 'text-green-500' :
              entry.status === 'D' ? 'text-red-500' :
              entry.status === 'M' ? 'text-yellow-500' :
              entry.status === 'R' ? 'text-blue-400' :
              'text-neutral-400'
            }>{entry.status.padEnd(2)}</span>
            <span className="truncate text-neutral-600 dark:text-neutral-300">{entry.path}</span>
          </div>
        ))}
      </div>
    )
  },
})

interface StatusEntry {
  status: string
  path: string
}

function extractEntries(ctx: ToolRenderCtx): StatusEntry[] {
  // Result could be raw text output or parsed JSON
  const data = ctx.result?.data

  // If data is an array of objects with path/status
  if (Array.isArray(data)) {
    return data.map((e: Record<string, unknown>) => ({
      status: typeof e.status === 'string' ? e.status : typeof e.name_status === 'string' ? e.name_status : '?',
      path: typeof e.path === 'string' ? e.path : '',
    })).filter(e => e.path)
  }

  // Try parsing rawResult as text (git status --short output)
  if (typeof ctx.rawResult === 'string') {
    try {
      const parsed = JSON.parse(ctx.rawResult) as Record<string, unknown>
      const d = parsed.data
      if (typeof d === 'string') {
        return parseGitStatusShort(d)
      }
      if (Array.isArray(d)) {
        return (d as Record<string, unknown>[]).map(e => ({
          status: typeof e.status === 'string' ? e.status : '?',
          path: typeof e.path === 'string' ? e.path : '',
        })).filter(e => e.path)
      }
    } catch {
      // raw text
      return parseGitStatusShort(ctx.rawResult)
    }
  }

  return []
}

function parseGitStatusShort(text: string): StatusEntry[] {
  return text.split('\n')
    .filter(l => l.trim())
    .map(line => ({
      status: line.slice(0, 2).trim() || '?',
      path: line.slice(3).trim(),
    }))
    .filter(e => e.path)
}

function StreamingPlaceholder() {
  return (
    <div className="px-3 py-2 space-y-1">
      {[60, 50, 70].map((w, i) => (
        <div key={i} className="h-3 rounded bg-neutral-100 dark:bg-neutral-800 animate-pulse" style={{ width: w + '%' }} />
      ))}
    </div>
  )
}
