/**
 * Renderer for `edit` tool — unified diff view.
 * Supports both legacy {old_text, new_text} and current {edits: [{old_text, new_text}]} formats.
 * For multi-edit, each edit entry is rendered as a separate diff block.
 */

import { Pencil } from 'lucide-react'
import { CopyIconButton } from '../CopyIconButton'
import { registerRenderer } from './registry'
import type { ToolRenderCtx } from './types'

/** A single edit entry parsed from args */
interface EditEntry {
  oldText: string
  newText: string
}

/** Parse edit entries from args — supports both legacy and current formats */
function parseEditEntries(args: Record<string, unknown>): EditEntry[] {
  // Legacy format: top-level old_text / new_text
  if (typeof args.old_text === 'string' || typeof args.new_text === 'string') {
    return [{
      oldText: typeof args.old_text === 'string' ? args.old_text : '',
      newText: typeof args.new_text === 'string' ? args.new_text : '',
    }]
  }

  // Current format: edits array
  const edits = args.edits
  if (Array.isArray(edits) && edits.length > 0) {
    const entries: EditEntry[] = []
    for (const e of edits) {
      if (e && typeof e === 'object') {
        entries.push({
          oldText: typeof e.old_text === 'string' ? e.old_text : '',
          newText: typeof e.new_text === 'string' ? e.new_text : '',
        })
      }
    }
    if (entries.length > 0) return entries
  }

  return []
}

registerRenderer({
  name: 'edit',
  icon: <Pencil className="h-3.5 w-3.5 text-neutral-400" />,
  Summary(ctx) {
    const path = typeof ctx.args.path === 'string' ? ctx.args.path : undefined
    const entries = parseEditEntries(ctx.args)

    // Aggregate del/add counts across all edit entries
    let delCount = 0
    let addCount = 0
    for (const entry of entries) {
      const diff = computeDiff(entry.oldText, entry.newText)
      delCount += diff.filter(d => d.type === 'del').length
      addCount += diff.filter(d => d.type === 'add').length
    }
    const hasChanges = delCount > 0 || addCount > 0

    return (
      <>
        <code className="font-medium text-neutral-700 dark:text-neutral-200">edit</code>
        {path && (
          <span className="truncate text-neutral-400 dark:text-neutral-500">{shortPath(path)}</span>
        )}
        {ctx.isStreaming && hasChanges && (
          <span className="ml-auto flex items-center gap-1 shrink-0">
            {delCount > 0 && <span className="text-xs text-red-400 dark:text-red-500">-{delCount}</span>}
            {addCount > 0 && <span className="text-xs text-green-500 dark:text-green-400">+{addCount}</span>}
            <span className="text-xs text-neutral-400">…</span>
          </span>
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
    const entries = parseEditEntries(ctx.args)
    const replaceAll = ctx.args.replace_all === true

    if (entries.length === 0) {
      if (ctx.isExecuting || ctx.isStreaming) return <StreamingPlaceholder />
      return <div className="px-3 py-2 text-xs text-neutral-400">No content</div>
    }

    // For single edit, render as before (no separator needed)
    if (entries.length === 1) {
      const entry = entries[0]!
      if (!entry.oldText && !entry.newText) {
        if (ctx.isExecuting || ctx.isStreaming) return <StreamingPlaceholder />
        return <div className="px-3 py-2 text-xs text-neutral-400">No content</div>
      }
      return (
        <div className="px-3 py-2 space-y-2">
          {path && <PathHeader path={path} replaceAll={replaceAll} />}
          <DiffBlock diff={computeDiff(entry.oldText, entry.newText)} />
          {ctx.isStreaming && <StreamingIndicator />}
          <div className="flex justify-end">
            <CopyIconButton content={entry.newText} />
          </div>
        </div>
      )
    }

    // For multiple edits, render each as a separate diff block with a header
    const allNewText = entries.map(e => e.newText).join('\n')
    return (
      <div className="px-3 py-2 space-y-2">
        {path && <PathHeader path={path} replaceAll={replaceAll} />}
        {entries.map((entry, i) => {
          const diff = computeDiff(entry.oldText, entry.newText)
          const hasChanges = diff.some(d => d.type === 'add' || d.type === 'del')
          return (
            <div key={i}>
              {entries.length > 1 && (
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-medium text-neutral-400 dark:text-neutral-500 bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.5 rounded">
                    Edit {i + 1} of {entries.length}
                  </span>
                  {!hasChanges && (
                    <span className="text-[10px] text-neutral-400">no change</span>
                  )}
                  {hasChanges && (
                    <span className="flex items-center gap-1">
                      {diff.filter(d => d.type === 'del').length > 0 && (
                        <span className="text-[10px] text-red-400 dark:text-red-500">
                          -{diff.filter(d => d.type === 'del').length}
                        </span>
                      )}
                      {diff.filter(d => d.type === 'add').length > 0 && (
                        <span className="text-[10px] text-green-500 dark:text-green-400">
                          +{diff.filter(d => d.type === 'add').length}
                        </span>
                      )}
                    </span>
                  )}
                </div>
              )}
              <DiffBlock diff={diff} />
            </div>
          )
        })}
        {ctx.isStreaming && <StreamingIndicator />}
        <div className="flex justify-end">
          <CopyIconButton content={allNewText} />
        </div>
      </div>
    )
  },
})

// ── Sub-components ──────────────────────────────────────────────────

function PathHeader({ path, replaceAll }: { path: string; replaceAll: boolean }) {
  return (
    <div className="flex items-center gap-2 text-xs text-neutral-400 dark:text-neutral-500">
      <span className="font-mono">{path}</span>
      {replaceAll && <span className="text-[10px] bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.5 rounded">replace all</span>}
    </div>
  )
}

function DiffBlock({ diff }: { diff: DiffLine[] }) {
  if (diff.length === 0) return null
  return (
    <div className="rounded-md bg-white dark:bg-neutral-900 border border-neutral-100 dark:border-neutral-800 overflow-hidden">
      <div className="p-2 text-xs leading-5 font-mono">
        {diff.map((d, i) => (
          <div key={i} className={
            d.type === 'add' ? 'bg-green-50 dark:bg-green-900/10 text-green-700 dark:text-green-400' :
            d.type === 'del' ? 'bg-red-50 dark:bg-red-900/10 text-red-700 dark:text-red-400' :
            'text-neutral-400 dark:text-neutral-500'
          }>
            <span className="select-none mr-1">{d.type === 'add' ? '+' : d.type === 'del' ? '-' : ' '}</span>
            <span className="whitespace-pre-wrap break-all">{d.text || '\u00A0'}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function StreamingIndicator() {
  return (
    <div className="border-t border-neutral-100 dark:border-neutral-800 px-2 py-1.5 flex items-center gap-1.5">
      <span className="inline-block h-2 w-0.5 bg-blue-500 animate-pulse" />
      <span className="text-[11px] text-neutral-400">编辑中…</span>
    </div>
  )
}

// ── Diff utilities ──────────────────────────────────────────────────

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

function extractError(ctx: ToolRenderCtx): string {
  const raw = ctx.result?.error
  // V2 envelope: error is { code, message, retryable }
  if (raw && typeof raw === 'object' && typeof (raw as Record<string, unknown>).message === 'string') {
    return (raw as Record<string, unknown>).message as string
  }
  // Legacy: error is a plain string
  if (typeof raw === 'string') return raw
  return 'Edit failed'
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
