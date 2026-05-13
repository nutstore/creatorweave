/**
 * Renderer for `ls` tool — directory listing with file/folder icons.
 */

import { Folder } from 'lucide-react'
import { registerRenderer } from './registry'
import type { ToolRenderCtx } from './types'

interface LsEntry {
  name: string
  path?: string
  kind?: string
  type?: string
  size?: number
  [key: string]: unknown
}

registerRenderer({
  name: 'ls',
  icon: <Folder className="h-3.5 w-3.5 text-neutral-400" />,
  Summary(ctx) {
    const dirPath = typeof ctx.args.path === 'string' ? ctx.args.path : undefined
    const entries = extractEntries(ctx)
    const fileCount = entries.filter(e => isFile(e)).length
    const dirCount = entries.filter(e => isDir(e)).length

    return (
      <>
        <code className="font-medium text-neutral-700 dark:text-neutral-200">ls</code>
        {dirPath && (
          <span className="truncate text-neutral-400 dark:text-neutral-500">{dirPath}</span>
        )}
        {!ctx.isExecuting && !ctx.isStreaming && (
          <span className="ml-auto text-xs text-neutral-400 shrink-0">
            {fileCount + dirCount} item{fileCount + dirCount !== 1 ? 's' : ''}
          </span>
        )}
      </>
    )
  },
  Detail(ctx) {
    const entries = extractEntries(ctx)
    const dirPath = typeof ctx.args.path === 'string' ? ctx.args.path : undefined
    const pattern = typeof ctx.args.pattern === 'string' ? ctx.args.pattern : undefined

    if (entries.length === 0) {
      if (ctx.isExecuting) return <StreamingPlaceholder />
      return (
        <div className="px-3 py-2 text-xs text-neutral-400 dark:text-neutral-500">
          {dirPath ? `${dirPath} is empty` : 'No entries'}
        </div>
      )
    }

    const dirs = entries.filter(e => isDir(e))
    const files = entries.filter(e => isFile(e))
    const maxShow = 15

    return (
      <div className="px-3 py-2 space-y-1.5">
        {pattern && (
          <div className="text-[10px] text-neutral-400 mb-1">
            filter: <span className="bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.5 rounded">{pattern}</span>
          </div>
        )}

        {dirPath && (
          <div className="text-xs text-neutral-400 dark:text-neutral-500 font-mono mb-1">{dirPath}</div>
        )}

        {/* Directories first */}
        {dirs.slice(0, maxShow).map((entry, i) => (
          <div key={`d-${i}`} className="flex items-center gap-2 text-xs" style={{ animation: `tool-row-in .2s ease-out ${i * 20}ms backwards` }}>
            <FolderIcon />
            <span className="text-neutral-600 dark:text-neutral-300 font-medium truncate" title={entry.path || entry.name}>{(entry.path || entry.name)}/</span>
          </div>
        ))}

        {/* Files */}
        {files.slice(0, maxShow - dirs.length).map((entry, i) => (
          <div key={`f-${i}`} className="flex items-center gap-2 text-xs" style={{ animation: `tool-row-in .2s ease-out ${(dirs.length + i) * 20}ms backwards` }}>
            <FileIcon name={entry.name} />
            <span className="text-neutral-500 dark:text-neutral-400 truncate" title={entry.path || entry.name}>{entry.path || entry.name}</span>
          </div>
        ))}

        {(dirs.length + files.length > maxShow) && (
          <div className="text-[10px] text-neutral-400 dark:text-neutral-600">
            +{dirs.length + files.length - maxShow} more items
          </div>
        )}
      </div>
    )
  },
})

function extractEntries(ctx: ToolRenderCtx): LsEntry[] {
  const data = ctx.result?.data
  if (Array.isArray(data)) return data as LsEntry[]

  // Fallback: parse text output from ls tool
  // list mode: indented tree like "  dir/\n    file.ts"
  // glob mode: plain paths like "src/dir/file.ts"
  const text = (typeof ctx.result?.data === 'string')
    ? ctx.result.data
    : typeof ctx.rawResult === 'string'
      ? (() => {
          try {
            const parsed = JSON.parse(ctx.rawResult!) as Record<string, unknown>
            if (typeof parsed.data === 'string') return parsed.data
          } catch { /* not JSON */ }
          // Might be plain text (not JSON envelope)
          if (!ctx.rawResult!.startsWith('{')) return ctx.rawResult!
          return undefined
        })()
      : undefined

  if (!text) return []

  const entries: LsEntry[] = []
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('...') || trimmed.startsWith('No ')) continue
    const name = trimmed.replace(/\s*\([\d.]+[BKMG]?\)\s*$/, '') // strip size suffix
    const isDir = name.endsWith('/')
    entries.push({
      name: isDir ? name.slice(0, -1) : name,
      kind: isDir ? 'directory' : 'file',
      type: isDir ? 'directory' : 'file',
    })
  }
  return entries
}

function isFile(e: LsEntry): boolean {
  return e.kind === 'file' || e.type === 'file'
}

function isDir(e: LsEntry): boolean {
  return e.kind === 'directory' || e.type === 'directory'
}

function FolderIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-blue-400 shrink-0">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  )
}

function FileIcon({ name }: { name: string }) {
  const ext = name.split('.').pop()?.toLowerCase()
  const color =
    ext === 'tsx' || ext === 'ts' ? 'text-blue-400' :
    ext === 'jsx' || ext === 'js' ? 'text-yellow-500' :
    ext === 'css' || ext === 'scss' ? 'text-pink-400' :
    ext === 'json' ? 'text-green-500' :
    ext === 'md' ? 'text-neutral-400' :
    ext === 'py' ? 'text-emerald-400' :
    'text-neutral-400'

  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`${color} shrink-0`}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  )
}

function StreamingPlaceholder() {
  return (
    <div className="px-3 py-2 space-y-1.5">
      {[70, 55, 80, 45, 60].map((w, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="h-3.5 w-3.5 rounded bg-neutral-200 dark:bg-neutral-700 animate-pulse" />
          <div className="h-3 rounded bg-neutral-100 dark:bg-neutral-800 animate-pulse" style={{ width: w + '%' }} />
        </div>
      ))}
    </div>
  )
}
