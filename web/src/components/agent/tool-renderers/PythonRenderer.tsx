/**
 * Renderer for `python` tool — terminal-style stdout/stderr display.
 */

import { Terminal } from 'lucide-react'
import { CopyIconButton } from '../CopyIconButton'
import { registerRenderer } from './registry'
import type { ToolRenderCtx } from './types'

registerRenderer({
  name: 'python',
  icon: <Terminal className="h-3.5 w-3.5 text-neutral-400" />,
  Summary(ctx) {
    const output = extractOutput(ctx)

    if (ctx.isExecuting) {
      return (
        <>
          <code className="font-medium text-neutral-700 dark:text-neutral-200">python</code>
          <span className="text-xs text-blue-500">running...</span>
        </>
      )
    }

    const lines = output.stdout ? output.stdout.split('\n').length : 0
    const hasError = output.isError || !!output.stderr

    return (
      <>
        <code className="font-medium text-neutral-700 dark:text-neutral-200">python</code>
        {hasError ? (
          <span className="ml-auto text-xs text-red-400 shrink-0">error</span>
        ) : lines > 0 ? (
          <span className="ml-auto text-xs text-neutral-400 shrink-0">{lines} line{lines !== 1 ? 's' : ''}</span>
        ) : null}
      </>
    )
  },
  Detail(ctx) {
    const output = extractOutput(ctx)

    if (ctx.isExecuting) return <StreamingPlaceholder />

    const hasOutput = output.stdout || output.stderr || output.errorText
    if (!hasOutput) {
      return (
        <div className="px-3 py-2 text-xs text-neutral-400 dark:text-neutral-500">No output</div>
      )
    }

    const code = typeof ctx.args.code === 'string' ? ctx.args.code : ''
    const codeLines = code ? code.split('\n').length : 0

    return (
      <div className="px-3 py-2 space-y-2">
        {/* Executed code */}
        {code && (
          <div>
            <div className="text-[10px] text-neutral-400 dark:text-neutral-500 mb-1">
              code{codeLines > 1 ? ` (${codeLines} lines)` : ''}
            </div>
            <div className="rounded-md bg-black dark:bg-neutral-950 p-2 overflow-x-auto max-h-64">
              <pre className="text-[11px] leading-5 font-mono text-neutral-300 whitespace-pre-wrap">{code}</pre>
            </div>
          </div>
        )}

        {/* Stdout */}
        {output.stdout && (
          <div>
            <div className="text-[10px] text-neutral-400 dark:text-neutral-500 mb-1">stdout</div>
            <div className="rounded-md bg-black dark:bg-neutral-950 p-2 overflow-x-auto max-h-48">
              <pre className="text-[11px] leading-5 font-mono text-emerald-400 whitespace-pre-wrap">{output.stdout}</pre>
            </div>
          </div>
        )}

        {/* Stderr */}
        {output.stderr && (
          <div>
            <div className="text-[10px] text-neutral-400 dark:text-neutral-500 mb-1">stderr</div>
            <div className="rounded-md bg-black dark:bg-neutral-950 p-2 overflow-x-auto max-h-32">
              <pre className="text-[11px] leading-5 font-mono text-red-400 whitespace-pre-wrap">{output.stderr}</pre>
            </div>
          </div>
        )}

        {/* Error */}
        {output.errorText && !output.stderr && (
          <div>
            <div className="text-[10px] text-neutral-400 dark:text-neutral-500 mb-1">error</div>
            <div className="rounded-md bg-black dark:bg-neutral-950 p-2 overflow-x-auto max-h-32">
              <pre className="text-[11px] leading-5 font-mono text-red-300 whitespace-pre-wrap">{output.errorText}</pre>
            </div>
          </div>
        )}

        <div className="flex justify-end">
          <CopyIconButton content={[output.stdout, output.stderr, output.errorText].filter(Boolean).join('\n')} />
        </div>
      </div>
    )
  },
})

function extractOutput(ctx: ToolRenderCtx): {
  stdout: string | undefined
  stderr: string | undefined
  errorText: string | undefined
  isError: boolean
} {
  const data = ctx.result?.data as Record<string, unknown> | undefined

  if (data) {
    return {
      stdout: typeof data.stdout === 'string' ? data.stdout : undefined,
      stderr: typeof data.stderr === 'string' ? data.stderr : undefined,
      errorText: typeof data.error === 'string' ? data.error : undefined,
      isError: ctx.isError,
    }
  }

  // V2 envelope error: { ok: false, error: { code, message } }
  if (ctx.result && !ctx.result.ok && ctx.result.error) {
    const err = ctx.result.error as Record<string, unknown>
    const msg = typeof err.message === 'string' ? err.message : String(err)
    return { stdout: undefined, stderr: undefined, errorText: msg, isError: true }
  }

  // Fallback: try rawResult
  if (ctx.rawResult) {
    // If rawResult looks like plain text output
    if (!ctx.rawResult.startsWith('{')) {
      return { stdout: ctx.rawResult, stderr: undefined, errorText: undefined, isError: ctx.isError }
    }
  }

  return { stdout: undefined, stderr: undefined, errorText: undefined, isError: ctx.isError }
}

function StreamingPlaceholder() {
  return (
    <div className="px-3 py-2">
      <div className="rounded-md bg-black dark:bg-neutral-950 p-2 space-y-1.5">
        {[60, 80, 45, 70].map((w, i) => (
          <div key={i} className="h-3 rounded bg-neutral-800 animate-pulse" style={{ width: w + '%' }} />
        ))}
      </div>
    </div>
  )
}
