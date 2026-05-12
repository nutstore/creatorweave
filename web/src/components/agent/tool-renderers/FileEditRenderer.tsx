/**
 * Renderer for `edit` tool — unified diff view.
 * Computes a simple line diff from old_text / new_text args.
 */

import { Pencil } from 'lucide-react'
import { CopyIconButton } from '../CopyIconButton'
import { registerRenderer } from './registry'
import type { ToolRenderCtx } from './types'

registerRenderer({
  name: 'edit',
  icon: <Pencil className="h-3.5 w-3.5 text-neutral-400" />,
  Summary(ctx) {
    const path = typeof ctx.args.path === 'string' ? ctx.args.path : undefined
    const oldText = typeof ctx.args.old_text === 'string' ? ctx.args.old_text : ''
    const newText = typeof ctx.args.new_text === 'string' ? ctx.args.new_text : ''

    // Count actual changed lines from the diff, not just line count delta
    const diff = computeDiff(oldText, newText)
    const delCount = diff.filter(d => d.type === 'del').length
    const addCount = diff.filter(d => d.type === 'add').length
    const hasChanges = delCount > 0 || addCount > 0

    return (
      <>
        <code className="font-medium text-neutral-700 dark:text-neutral-200">edit</code>
        {path && (
          <span className="truncate text-neutral-400 dark:text-neutral-500">{shortPath(path)}</span>
        )}
        {!ctx.isStreaming && !ctx.isExecuting && (
          <span className="ml-auto flex items-center gap-1 shrink-0">
            {delCount > 0 && <span className="text-xs text-red-400 dark:text-red-500">-{delCount}</span>}
            {addCount > 0 && <span className="text-xs text-green-500 dark:text-green-400">+{addCount}</span>}
            {!hasChanges && <span className="text-xs text-neutral-400">no change</span>}
          </span>
        )}
      </>
    )
  },
  Detail(ctx) {
    if (ctx.isError) {
      const errMsg = extractError(ctx)
      return (
        <div className="px-3 py-2">
          <div className="rounded-md bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 p-2 text-xs text-red-600 dark:text-red-400">
            {errMsg || 'Edit failed'}
          </div>
        </div>
      )
    }

    const path = typeof ctx.args.path === 'string' ? ctx.args.path : undefined
    const oldText = typeof ctx.args.old_text === 'string' ? ctx.args.old_text : ''
    const newText = typeof ctx.args.new_text === 'string' ? ctx.args.new_text : ''
    const replaceAll = ctx.args.replace_all === true

    if (!oldText && !newText && ctx.isExecuting) {
      return <StreamingPlaceholder />
    }

    const diff = computeDiff(oldText, newText)
    const diffText = diff.map(d => d.text).join('\n')

    return (
      <div className="px-3 py-2 space-y-2">
        {path && (
          <div className="flex items-center gap-2 text-xs text-neutral-400 dark:text-neutral-500">
            <span className="font-mono">{path}</span>
            {replaceAll && <span className="text-[10px] bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.5 rounded">replace all</span>}
          </div>
        )}
        <div className="rounded-md bg-white dark:bg-neutral-900 border border-neutral-100 dark:border-neutral-800 overflow-x-auto">
          <pre className="p-2 text-xs leading-5 font-mono">
            {diff.map((d, i) => (
              <div key={i} className={
                d.type === 'add' ? 'bg-green-50 dark:bg-green-900/10 text-green-700 dark:text-green-400' :
                d.type === 'del' ? 'bg-red-50 dark:bg-red-900/10 text-red-700 dark:text-red-400' :
                'text-neutral-400 dark:text-neutral-500'
              }>
                <span className="select-none mr-1">{d.type === 'add' ? '+' : d.type === 'del' ? '-' : ' '}</span>
                {d.text}
              </div>
            ))}
          </pre>
        </div>
        <div className="flex justify-end">
          <CopyIconButton content={diffText} />
        </div>
      </div>
    )
  },
})

interface DiffLine {
  type: 'ctx' | 'add' | 'del'
  text: string
}

function computeDiff(oldText: string, newText: string): DiffLine[] {
  if (!oldText && !newText) return []

  const oldLines = oldText.split('\n')
  const newLines = newText.split('\n')
  const result: DiffLine[] = []

  // Find common prefix length
  let prefixEnd = 0
  while (prefixEnd < oldLines.length && prefixEnd < newLines.length && oldLines[prefixEnd] === newLines[prefixEnd]) {
    prefixEnd++
  }

  // Find common suffix length (don't overlap with prefix)
  let suffixLen = 0
  while (
    suffixLen < (oldLines.length - prefixEnd) &&
    suffixLen < (newLines.length - prefixEnd) &&
    oldLines[oldLines.length - 1 - suffixLen] === newLines[newLines.length - 1 - suffixLen]
  ) {
    suffixLen++
  }

  // Context prefix — up to 2 lines
  const ctxPrefixStart = Math.max(0, prefixEnd - 2)
  for (let i = ctxPrefixStart; i < prefixEnd; i++) {
    result.push({ type: 'ctx', text: oldLines[i] })
  }

  // Removed lines
  const delEnd = oldLines.length - suffixLen
  for (let i = prefixEnd; i < delEnd; i++) {
    result.push({ type: 'del', text: oldLines[i] })
  }

  // Added lines
  const addEnd = newLines.length - suffixLen
  for (let i = prefixEnd; i < addEnd; i++) {
    result.push({ type: 'add', text: newLines[i] })
  }

  // Context suffix — up to 2 lines
  const ctxSuffixEnd = Math.min(newLines.length, newLines.length - suffixLen + 2)
  for (let i = newLines.length - suffixLen; i < ctxSuffixEnd; i++) {
    result.push({ type: 'ctx', text: newLines[i] })
  }

  return result
}

function shortPath(p: string): string {
  const parts = p.split('/')
  return parts.length > 3 ? '...' + parts.slice(-3).join('/') : p
}

function extractError(ctx: ToolRenderCtx): string | undefined {
  if (typeof ctx.result?.error === 'string') return ctx.result.error
  const data = ctx.result?.data as Record<string, unknown> | undefined
  if (data && typeof data.error === 'string') return data.error
  return undefined
}

function StreamingPlaceholder() {
  return (
    <div className="px-3 py-2">
      <div className="space-y-1">
        <div className="h-3 w-3/4 rounded bg-red-50 dark:bg-red-900/10" />
        <div className="h-3 w-1/2 rounded bg-red-50 dark:bg-red-900/10" />
        <div className="h-3 w-2/3 rounded bg-green-50 dark:bg-green-900/10" />
        <div className="h-3 w-1/3 rounded bg-green-50 dark:bg-green-900/10" />
      </div>
    </div>
  )
}
