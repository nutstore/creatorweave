/**
 * Renderer for `write` tool — file creation/overwrite with content preview.
 */

import { FilePlus } from 'lucide-react'
import { CopyIconButton } from '../CopyIconButton'
import { registerRenderer } from './registry'
import type { ToolRenderCtx } from './types'

registerRenderer({
  name: 'write',
  icon: <FilePlus className="h-3.5 w-3.5 text-neutral-400" />,
  Summary(ctx) {
    // Support both single file (path+content) and batch (files[])
    const { path, files } = extractWriteInfo(ctx.args)
    const action = extractAction(ctx)

    if (files && files.length > 1) {
      return (
        <>
          <code className="font-medium text-neutral-700 dark:text-neutral-200">write</code>
          <span className="ml-auto text-xs text-neutral-400 shrink-0">{files.length} files</span>
        </>
      )
    }

    const singlePath = path ?? files?.[0]?.path
    const content = files?.[0]?.content ?? (typeof ctx.args.content === 'string' ? ctx.args.content : undefined)
    const lineCount = content ? content.split('\n').length : 0

    return (
      <>
        <code className="font-medium text-neutral-700 dark:text-neutral-200">write</code>
        {singlePath && (
          <span className="truncate text-neutral-400 dark:text-neutral-500">{shortPath(singlePath)}</span>
        )}
        {!ctx.isStreaming && !ctx.isExecuting && (
          <span className="ml-auto flex items-center gap-1 text-xs text-neutral-400 shrink-0">
            {action ?? 'written'}
            {lineCount > 0 && <span>{lineCount} lines</span>}
          </span>
        )}
      </>
    )
  },
  Detail(ctx) {
    if (ctx.isError) {
      const errMsg = typeof ctx.result?.error === 'string' ? ctx.result.error : 'Write failed'
      return (
        <div className="px-3 py-2">
          <div className="rounded-md bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 p-2 text-xs text-red-600 dark:text-red-400">
            {errMsg}
          </div>
        </div>
      )
    }

    const { path, files } = extractWriteInfo(ctx.args)

    // Batch write — show file list
    if (files && files.length > 1) {
      return (
        <div className="px-3 py-2">
          <div className="text-xs text-neutral-500 dark:text-neutral-400 mb-2">{files.length} files written:</div>
          <div className="space-y-1">
            {files.map((f, i) => (
              <div key={i} className="flex items-center gap-1.5 text-xs">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-neutral-400 shrink-0">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
                </svg>
                <span className="font-mono text-neutral-500 dark:text-neutral-400 truncate">{f.path}</span>
              </div>
            ))}
          </div>
        </div>
      )
    }

    // Single file write — show content preview
    const singlePath = path ?? files?.[0]?.path
    const content = files?.[0]?.content ?? (typeof ctx.args.content === 'string' ? ctx.args.content : undefined)

    if (!content) {
      if (ctx.isExecuting) return <StreamingPlaceholder />
      return <div className="px-3 py-2 text-xs text-neutral-400">No content</div>
    }

    const lines = content.split('\n')
    const maxPreview = 30
    const preview = lines.slice(0, maxPreview)
    const lnWidth = String(lines.length).length

    return (
      <div className="px-3 py-2 space-y-2">
        {singlePath && (
          <div className="text-xs text-neutral-400 dark:text-neutral-500 font-mono">{singlePath}</div>
        )}
        <div className="rounded-md bg-white dark:bg-neutral-900 border border-neutral-100 dark:border-neutral-800 overflow-hidden">
          <div className="p-2 text-xs leading-5 font-mono">
            {preview.map((line, i) => (
              <div key={i} className="flex">
                <span className="select-none text-neutral-300 dark:text-neutral-700 shrink-0 text-right" style={{ minWidth: lnWidth + 'ch', marginRight: '12px' }}>{i + 1}</span>
                <span className="whitespace-pre-wrap break-all text-neutral-600 dark:text-neutral-400 min-w-0">{line || '\u00A0'}</span>
              </div>
            ))}
            {lines.length > maxPreview && (
              <div className="text-neutral-300 dark:text-neutral-700 select-none">
                {' '.repeat(lnWidth + 1)}... {lines.length - maxPreview} more lines
              </div>
            )}
          </div>
        </div>
        <div className="flex justify-end">
          <CopyIconButton content={content} />
        </div>
      </div>
    )
  },
})

function extractWriteInfo(args: Record<string, unknown>) {
  const path = typeof args.path === 'string' ? args.path : undefined
  const rawFiles = args.files
  let files: { path: string; content?: string }[] | undefined
  if (Array.isArray(rawFiles)) {
    files = rawFiles.filter((f: unknown) => typeof f === 'object' && f !== null).map((f: Record<string, unknown>) => ({
      path: typeof f.path === 'string' ? f.path : '',
      content: typeof f.content === 'string' ? f.content : undefined,
    }))
  }
  return { path, files }
}

function extractAction(ctx: ToolRenderCtx): string | undefined {
  const data = ctx.result?.data as Record<string, unknown> | undefined
  if (data && typeof data.action === 'string') {
    return data.action === 'create' ? 'new file' : data.action === 'modify' ? 'overwritten' : data.action
  }
  return undefined
}

function shortPath(p: string): string {
  const parts = p.split('/')
  return parts.length > 3 ? '...' + parts.slice(-3).join('/') : p
}

function StreamingPlaceholder() {
  return (
    <div className="px-3 py-2">
      <div className="space-y-1.5">
        {[50, 65, 45, 55, 40].map((w, i) => (
          <div key={i} className="h-3 rounded bg-neutral-100 dark:bg-neutral-800" style={{ width: w + '%' }} />
        ))}
      </div>
    </div>
  )
}
