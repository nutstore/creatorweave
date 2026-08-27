/**
 * Renderer for `processes` tool — background process inspection/management.
 *
 * Summary: action name + process name / running count
 * Detail:
 *   list   → rows of running processes (name, command, pid, state)
 *   status → single process card
 *   logs   → terminal-style log block
 *   stop   → stop result card
 *
 * Result envelope (V2):
 *   list:   { ok, data: { running: ProcessRecord[], running_count, ended_count?, note? } }
 *   status: { ok, data: { action:'status', process, process_id?, pid?, name?, state?, started_at?... } }
 *   logs:   { ok, data: { action:'logs', process, log, eof } }
 *   stop:   { ok, data: { action:'stop', process, state, signaled } }
 *   error:  { ok: false, error: { code, message } }
 */

import { ServerCog } from 'lucide-react'
import { useT } from '@/i18n'
import { CopyIconButton } from '../CopyIconButton'
import { registerRenderer } from './registry'
import type { ToolRenderCtx } from './types'

// ── Types ───────────────────────────────────────────────────────────

interface ProcessRecord {
  process_id: string
  pid: number
  command: string[]
  scope_id?: string
  name: string | null
  state: 'running' | 'exited' | 'stopped' | string
  started_at: number
  ended_at: number | null
  log_path?: string
  url?: string
  port?: number
  exit_code?: number | null
}

// ── Register ────────────────────────────────────────────────────────

registerRenderer({
  name: 'processes',
  icon: <ServerCog className="h-3.5 w-3.5 text-neutral-400" />,

  Summary(ctx) {
    const action = extractAction(ctx)
    const procName = extractProcessRef(ctx)

    const label = (
      <code className="font-medium text-neutral-700 dark:text-foreground">processes</code>
    )
    const ref = (
      <span className="truncate text-neutral-400 text-neutral-500 dark:text-neutral-500 max-w-[200px] inline-block align-bottom">
        {procName ?? (action ? `${action}` : 'list')}
      </span>
    )

    if (ctx.isStreaming || ctx.isExecuting) {
      return (
        <>
          {label}
          {ref}
          {ctx.isExecuting && (
            <span className="ml-auto flex items-center gap-1.5 shrink-0">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500" />
              </span>
              <span className="text-xs text-blue-500">running</span>
            </span>
          )}
        </>
      )
    }

    // Error envelope
    const errCode = ctx.result?.error as Record<string, unknown> | undefined
    const errorCode = typeof errCode?.code === 'string' ? errCode.code : undefined
    if (!ctx.result?.ok && errorCode) {
      const tone =
        errorCode === 'user_denied'
          ? 'text-amber-500'
          : errorCode === 'forbidden'
            ? 'text-red-400 dark:text-red-500'
            : 'text-red-400 dark:text-red-500'
      return (
        <>
          {label}
          {ref}
          <span className={`ml-auto text-xs ${tone} shrink-0`}>{errorCode}</span>
        </>
      )
    }

    const data = ctx.result?.data as Record<string, unknown> | undefined

    // list → running count badge
    if (!action) {
      const count = typeof data?.running_count === 'number' ? data.running_count : undefined
      return (
        <>
          {label}
          <span className="truncate text-neutral-400 text-neutral-500 dark:text-neutral-500">
            list
          </span>
          {count !== undefined && (
            <span
              className={`ml-auto text-xs shrink-0 ${
                count > 0 ? 'text-emerald-500' : 'text-neutral-400 dark:text-neutral-500'
              }`}
            >
              {count} running
            </span>
          )}
        </>
      )
    }

    // status / logs / stop → state or action label
    if (action === 'status' && data) {
      return (
        <>
          {label}
          {ref}
          <StateBadge state={String(data.state ?? 'unknown')} className="ml-auto" />
        </>
      )
    }
    if (action === 'logs') {
      return (
        <>
          {label}
          {ref}
          <span className="ml-auto text-xs text-neutral-400 dark:text-neutral-500 shrink-0">log</span>
        </>
      )
    }
    if (action === 'stop' && data) {
      return (
        <>
          {label}
          {ref}
          <StateBadge state={String(data.state ?? 'unknown')} className="ml-auto" />
        </>
      )
    }

    return (
      <>
        {label}
        {ref}
      </>
    )
  },

  Detail(ctx) {
    const action = extractAction(ctx)
    const procName = extractProcessRef(ctx)

    // Error envelope
    if (ctx.isError || (ctx.result && !ctx.result.ok)) {
      const errObj = ctx.result?.error as Record<string, unknown> | undefined
      const errMsg = typeof errObj?.message === 'string' ? errObj.message : 'Action failed'
      const errCode = typeof errObj?.code === 'string' ? errObj.code : 'error'
      return (
        <div className="px-3 py-2 space-y-2">
          <div className="rounded-md bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 p-2">
            <div className="text-[10px] font-medium uppercase tracking-wide text-red-500 mb-1">
              {errCode}
            </div>
            <p className="text-xs text-red-600 dark:text-red-400">{errMsg}</p>
          </div>
        </div>
      )
    }

    const data = ctx.result?.data as Record<string, unknown> | undefined

    // ── list: running process rows ──
    if (!action) {
      const running = Array.isArray(data?.running) ? (data!.running as ProcessRecord[]) : []
      const endedCount = typeof data?.ended_count === 'number' ? data.ended_count : 0
      const note = typeof data?.note === 'string' ? data.note : undefined

      if (running.length === 0) {
        return (
          <div className="px-3 py-2 space-y-1">
            <div className="text-xs text-neutral-400 dark:text-neutral-500">
              No background processes running.
            </div>
            <div className="text-[11px] text-neutral-400 dark:text-neutral-500">
              Start one with exec({'{'} command: [...], background: true, name: "..." {'}'}).
            </div>
          </div>
        )
      }

      return (
        <div className="px-3 py-2 space-y-1.5">
          {running.map((p) => (
            <ProcessRow key={p.process_id} proc={p} />
          ))}
          {endedCount > 0 && note && (
            <div className="text-[10px] text-neutral-400 dark:text-neutral-500 pt-0.5">
              {note}
            </div>
          )}
        </div>
      )
    }

    // ── logs: terminal-style log block ──
    if (action === 'logs' && data) {
      const log = typeof data.log === 'string' ? data.log : ''
      const eof = data.eof === true
      const lineCount = log ? log.split('\n').length : 0
      return (
        <div className="px-3 py-2 space-y-1">
          <div className="flex items-center justify-between">
            <div className="text-[10px] text-neutral-400 text-neutral-500 dark:text-neutral-500">
              log{lineCount > 1 ? ` (${lineCount} lines)` : ''}
              {!eof && <span className="ml-1 text-amber-500">(tail)</span>}
            </div>
            <CopyIconButton content={log} />
          </div>
          <div className="rounded-md bg-black dark:bg-neutral-950 p-2 overflow-x-auto max-h-72">
            <pre className="text-[11px] leading-5 font-mono text-neutral-300 whitespace-pre-wrap">
              {log || '(no output)'}
            </pre>
          </div>
        </div>
      )
    }

    // ── status: single process card ──
    if (action === 'status') {
      const proc = normalizeProcess(data)
      if (!proc) return <NoDataDetail />
      return (
        <div className="px-3 py-2">
          <ProcessRow proc={proc} detailed />
        </div>
      )
    }

    // ── stop: result card ──
    if (action === 'stop' && data) {
      const state = typeof data.state === 'string' ? data.state : 'unknown'
      const signaled = data.signaled === true
      return (
        <div className="px-3 py-2 space-y-1.5">
          <div className="flex items-center gap-2 text-xs">
            <span className="font-medium text-neutral-700 dark:text-foreground">{procName}</span>
            <StateBadge state={state} />
            {signaled && (
              <span className="text-[10px] text-neutral-400 dark:text-neutral-500">signaled</span>
            )}
          </div>
          {state === 'running' && (
            <div className="text-[11px] text-amber-500">
              Still running — stop signal sent, check again with processes({'{'} action: "status" {'}'}).
            </div>
          )}
        </div>
      )
    }

    return <NoDataDetail />
  },
})

// ── Sub-components ──────────────────────────────────────────────────

function ProcessRow({ proc, detailed }: { proc: ProcessRecord; detailed?: boolean }) {
  return (
    <div className="rounded-md border border-neutral-200 dark:border-neutral-800 p-2 space-y-1">
      <div className="flex items-center gap-2 text-xs min-w-0">
        <span className="font-medium text-neutral-700 dark:text-foreground truncate">
          {proc.name ?? proc.process_id}
        </span>
        <StateBadge state={proc.state} />
        {proc.url && (
          <a
            href={proc.url}
            target="_blank"
            rel="noreferrer"
            className="ml-auto text-sky-500 hover:underline font-mono text-[11px] shrink-0"
          >
            {proc.url}
          </a>
        )}
      </div>
      {proc.command?.length > 0 && (
        <div className="rounded bg-black dark:bg-neutral-950 px-2 py-1 overflow-x-auto">
          <pre className="text-[11px] leading-4 font-mono text-sky-300 whitespace-pre-wrap">
            {proc.command.join(' ')}
          </pre>
        </div>
      )}
      <div className="flex items-center gap-3 text-[10px] text-neutral-400 text-neutral-500 dark:text-neutral-500">
        <span>pid {proc.pid}</span>
        {proc.started_at > 0 && <span>{formatTime(proc.started_at)}</span>}
        {detailed && proc.ended_at ? <span>→ {formatTime(proc.ended_at)}</span> : null}
        {proc.exit_code != null && (
          <span className={proc.exit_code === 0 ? 'text-emerald-500' : 'text-red-400'}>
            exit {proc.exit_code}
          </span>
        )}
      </div>
    </div>
  )
}

function StateBadge({ state, className = '' }: { state: string; className?: string }) {
  const t = useT()
  const key =
    state === 'running'
      ? 'processes.stateRunning'
      : state === 'exited'
        ? 'processes.stateExited'
        : state === 'stopped'
          ? 'processes.stateStopped'
          : null
  const label = key ? t(key, { defaultValue: state }) : state
  const tone =
    state === 'running'
      ? 'text-emerald-500'
      : state === 'exited'
        ? 'text-red-400 dark:text-red-500'
        : state === 'stopped'
          ? 'text-neutral-400 dark:text-neutral-500'
          : 'text-neutral-400 dark:text-neutral-500'
  return (
    <span className={`text-xs ${tone} ${className} shrink-0`}>{label}</span>
  )
}

function NoDataDetail() {
  return (
    <div className="px-3 py-2 text-xs text-neutral-400 dark:text-neutral-500">
      No result data.
    </div>
  )
}

function formatTime(seconds: number): string {
  return new Date(seconds * 1000).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

// ── Extract helpers ─────────────────────────────────────────────────

function extractAction(ctx: ToolRenderCtx): string | undefined {
  const a = ctx.args.action
  return typeof a === 'string' ? a : undefined
}

function extractProcessRef(ctx: ToolRenderCtx): string | undefined {
  const p = ctx.args.process
  return typeof p === 'string' ? p : undefined
}

/** Normalize a status/result object into a ProcessRecord-ish shape. */
function normalizeProcess(
  data: Record<string, unknown> | undefined,
): ProcessRecord | null {
  if (!data) return null
  const pid = typeof data.pid === 'number' ? data.pid : undefined
  const state = typeof data.state === 'string' ? data.state : undefined
  if (pid === undefined && state === undefined) return null
  return {
    process_id: typeof data.process_id === 'string' ? data.process_id : '',
    pid: pid ?? -1,
    command: Array.isArray(data.command) ? data.command.map(String) : [],
    name: typeof data.name === 'string' ? data.name : null,
    state: state ?? 'unknown',
    started_at: typeof data.started_at === 'number' ? data.started_at : 0,
    ended_at: typeof data.ended_at === 'number' ? data.ended_at : null,
    url: typeof data.url === 'string' ? data.url : undefined,
    exit_code: data.exit_code as number | null | undefined,
  }
}
