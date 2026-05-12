/**
 * Renderer for `git_diff` tool — file change summary with +/- stats.
 */

import { GitBranch } from 'lucide-react'
import { CopyIconButton } from '../CopyIconButton'
import { registerRenderer } from './registry'
import type { ToolRenderCtx } from './types'

registerRenderer({
  name: 'git_diff',
  icon: <GitBranch className="h-3.5 w-3.5 text-neutral-400" />,
  Summary(ctx) {
    const mode = typeof ctx.args.mode === 'string' ? ctx.args.mode : 'working'
    const patch = extractPatch(ctx)

    if (!patch) {
      return (
        <>
          <code className="font-medium text-neutral-700 dark:text-neutral-200">git_diff</code>
          <span className="text-xs text-neutral-400">{mode}</span>
          {ctx.isExecuting && <span className="ml-auto text-xs text-blue-500 shrink-0">loading...</span>}
        </>
      )
    }

    const stats = parseDiffStats(patch)

    return (
      <>
        <code className="font-medium text-neutral-700 dark:text-neutral-200">git_diff</code>
        <span className="text-xs text-neutral-400">{mode}</span>
        <span className="ml-auto flex items-center gap-1 shrink-0">
          <span className="text-xs text-neutral-400">{stats.files} file{stats.files !== 1 ? 's' : ''}</span>
          {stats.added > 0 && <span className="text-xs text-green-500 dark:text-green-400">+{stats.added}</span>}
          {stats.removed > 0 && <span className="text-xs text-red-400 dark:text-red-500">-{stats.removed}</span>}
        </span>
      </>
    )
  },
  Detail(ctx) {
    const patch = extractPatch(ctx)
    const mode = typeof ctx.args.mode === 'string' ? ctx.args.mode : 'working'

    if (!patch) {
      if (ctx.isExecuting) return <StreamingPlaceholder />
      return (
        <div className="px-3 py-2 text-xs text-neutral-400 dark:text-neutral-500">No changes</div>
      )
    }

    const files = parseFileChanges(patch)
    const diffText = typeof patch === 'string' ? patch : ''

    return (
      <div className="px-3 py-2 space-y-2">
        <div className="text-xs text-neutral-400 dark:text-neutral-500">{mode === 'working' ? 'Working tree' : mode === 'cached' ? 'Staged' : mode}</div>

        <div className="space-y-0.5">
          {files.map((f, i) => (
            <div key={i} className="flex items-center gap-2 text-xs font-mono">
              <span className={
                f.status === 'A' ? 'text-green-500' :
                f.status === 'D' ? 'text-red-500' :
                f.status === 'M' ? 'text-yellow-500' :
                'text-neutral-400'
              }>{f.status}</span>
              <span className="truncate text-neutral-600 dark:text-neutral-300">{f.path}</span>
              {f.added > 0 && <span className="text-green-500 text-[10px] ml-auto">+{f.added}</span>}
              {f.removed > 0 && <span className="text-red-400 text-[10px]">-{f.removed}</span>}
            </div>
          ))}
        </div>

        <div className="flex justify-end">
          <CopyIconButton content={diffText} />
        </div>
      </div>
    )
  },
})

function extractPatch(ctx: ToolRenderCtx): string | undefined {
  // git_diff result can be the raw diff text or wrapped in { ok, data }
  const data = ctx.result?.data
  if (typeof data === 'string') return data
  if (typeof ctx.rawResult === 'string') {
    // Try to see if it's a wrapped envelope
    try {
      const parsed = JSON.parse(ctx.rawResult) as Record<string, unknown>
      if (typeof parsed.data === 'string') return parsed.data
    } catch {
      // Might be raw diff text
      return ctx.rawResult
    }
  }
  return undefined
}

interface DiffStats {
  files: number
  added: number
  removed: number
}

function parseDiffStats(patch: string): DiffStats {
  let files = 0
  let added = 0
  let removed = 0
  for (const line of patch.split('\n')) {
    if (line.startsWith('+++') || line.startsWith('---')) continue
    if (line.startsWith('diff ')) files++
    else if (line.startsWith('+')) added++
    else if (line.startsWith('-')) removed++
  }
  return { files: Math.max(files, 1), added, removed }
}

interface FileChange {
  status: string
  path: string
  added: number
  removed: number
}

function parseFileChanges(patch: string): FileChange[] {
  const files: FileChange[] = []
  let current: FileChange | null = null

  for (const line of patch.split('\n')) {
    if (line.startsWith('diff ')) {
      if (current) files.push(current)
      current = null
    }
    if (line.startsWith('new file')) {
      current = { status: 'A', path: extractDiffPath(line) || '', added: 0, removed: 0 }
    } else if (line.startsWith('deleted file')) {
      current = { status: 'D', path: extractDiffPath(line) || '', added: 0, removed: 0 }
    } else if (line.startsWith('--- a/') || line.startsWith('--- /dev/null')) {
      if (!current) current = { status: 'M', path: line.replace('--- a/', ''), added: 0, removed: 0 }
    }
    if (current) {
      if (line.startsWith('+') && !line.startsWith('+++')) current.added++
      if (line.startsWith('-') && !line.startsWith('---')) current.removed++
    }
  }
  if (current) files.push(current)
  return files
}

function extractDiffPath(line: string): string {
  const m = line.match(/b\/(.+)$/)
  return m ? m[1] : ''
}

function StreamingPlaceholder() {
  return (
    <div className="px-3 py-2 space-y-1">
      {[50, 70, 40, 60].map((w, i) => (
        <div key={i} className="h-3 rounded bg-neutral-100 dark:bg-neutral-800 animate-pulse" style={{ width: w + '%' }} />
      ))}
    </div>
  )
}
