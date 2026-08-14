/**
 * ProcessesPopover — a small floating button in the conversation view
 * (next to AssetsPopover) that expands to show background processes
 * started via the exec tool (dev servers etc, STATUS.md §17).
 *
 * Lists processes from the Native Host registry (exec_list), polls while
 * open, and supports viewing the log tail and stopping a process (with
 * automatic force escalation).
 */

import { useState, useEffect, useCallback, useRef, memo } from 'react'
import {
  ServerCog,
  X,
  ScrollText,
  Square,
  Loader2,
  RefreshCw,
} from 'lucide-react'
import { useT } from '@/i18n'

// ─── Types & helpers ────────────────────────────────────────────────────────

interface ProcessRecord {
  process_id: string
  pid: number
  command: string[]
  scope_id: string
  name: string | null
  state: 'running' | 'exited' | 'stopped'
  started_at: number
  ended_at: number | null
  log_path: string
}

function nativeHostCall(payload: Record<string, unknown>): Promise<any> {
  const agentWeb = (window as any).__agentWeb
  return agentWeb.nativeHostCall(payload)
}

function decodeBase64ToString(b64: string): string {
  try {
    const bin = atob(b64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes)
  } catch {
    return ''
  }
}

function formatTime(seconds: number): string {
  return new Date(seconds * 1000).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

// ─── Process Row ────────────────────────────────────────────────────────────

const STATE_STYLES: Record<ProcessRecord['state'], string> = {
  running: 'text-green-600 dark:text-green-400',
  exited: 'text-red-500 dark:text-red-400',
  stopped: 'text-neutral-400 dark:text-neutral-500',
}

const STATE_I18N_KEYS: Record<ProcessRecord['state'], string> = {
  running: 'processes.stateRunning',
  exited: 'processes.stateExited',
  stopped: 'processes.stateStopped',
}

function ProcessRow({
  proc,
  busy,
  onToggleLog,
  onStop,
}: {
  proc: ProcessRecord
  busy: boolean
  onToggleLog: () => void
  onStop?: () => void
}) {
  const t = useT()
  return (
    <div className="px-2.5 py-1.5 hover:bg-neutral-50 dark:hover:bg-neutral-700/50 rounded-md">
      <div className="flex items-center gap-2">
        <span
          className={`shrink-0 text-[10px] font-semibold uppercase ${STATE_STYLES[proc.state]}`}
        >
          {t(STATE_I18N_KEYS[proc.state], { defaultValue: proc.state })}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5">
            <span className="truncate text-xs font-medium">
              {proc.name ?? proc.process_id}
            </span>
            <code className="truncate text-[10px] text-neutral-400" title={proc.command.join(' ')}>
              {proc.command.join(' ')}
            </code>
          </div>
          <div className="text-[10px] text-neutral-400">
            pid {proc.pid} · {formatTime(proc.started_at)}
            {proc.ended_at ? ` → ${formatTime(proc.ended_at)}` : ''}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={onToggleLog}
            className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-700 dark:hover:text-neutral-300"
            title={t('processes.viewLog', { defaultValue: 'View log' })}
          >
            <ScrollText className="h-3 w-3" />
          </button>
          {onStop && (
            <button
              type="button"
              onClick={onStop}
              disabled={busy}
              className="rounded p-1 text-neutral-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30 dark:hover:text-red-400 disabled:opacity-50"
              title={t('processes.stop', { defaultValue: 'Stop process' })}
            >
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Square className="h-3 w-3" />}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main popover ───────────────────────────────────────────────────────────

export const ProcessesPopover = memo(function ProcessesPopover() {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [processes, setProcesses] = useState<ProcessRecord[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [openLogId, setOpenLogId] = useState<string | null>(null)
  const [logs, setLogs] = useState<Record<string, string>>({})
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const bridgeAvailable =
    typeof window !== 'undefined' &&
    typeof (window as any).__agentWeb?.nativeHostCall === 'function'

  const refresh = useCallback(async () => {
    try {
      const resp = await nativeHostCall({ action: 'exec_list' })
      if (!resp?.ok) {
        setError(String(resp?.error ?? 'unknown error'))
        return
      }
      setError(null)
      setProcesses((resp.processes ?? []) as ProcessRecord[])
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  // Poll while open; slow poll while closed keeps the badge fresh
  useEffect(() => {
    if (open) {
      refresh()
      const timer = setInterval(refresh, 5_000)
      return () => clearInterval(timer)
    }
    // Closed: initial fetch + slow cadence so the running-count badge stays current
    refresh()
    const timer = setInterval(refresh, 30_000)
    return () => clearInterval(timer)
  }, [open, refresh])

  // Immediate refresh whenever a background process starts/stops (exec tool event)
  useEffect(() => {
    const handler = () => refresh()
    window.addEventListener('cw:bg-processes-changed', handler)
    return () => window.removeEventListener('cw:bg-processes-changed', handler)
  }, [refresh])

  // Close on click outside
  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClick)
    }, 0)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handleClick)
    }
  }, [open])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open])

  const handleToggleLog = useCallback(async (proc: ProcessRecord) => {
    if (openLogId === proc.process_id) {
      setOpenLogId(null)
      return
    }
    setBusyId(proc.process_id)
    try {
      const resp = await nativeHostCall({
        action: 'exec_logs',
        process_id: proc.process_id,
        tail: 16_000,
      })
      if (resp?.ok) {
        const text = decodeBase64ToString(String(resp.data ?? ''))
        setLogs((prev) => ({ ...prev, [proc.process_id]: text || '(no output)' }))
        setOpenLogId(proc.process_id)
      }
    } finally {
      setBusyId(null)
    }
  }, [openLogId])

  const handleStop = useCallback(async (proc: ProcessRecord) => {
    setBusyId(proc.process_id)
    try {
      let resp = await nativeHostCall({ action: 'exec_stop', process_id: proc.process_id })
      if (resp?.ok && resp.state === 'running') {
        // SIGTERM grace elapsed — escalate to force.
        resp = await nativeHostCall({
          action: 'exec_stop',
          process_id: proc.process_id,
          force: true,
        })
      }
      await refresh()
    } finally {
      setBusyId(null)
    }
  }, [refresh])

  if (!bridgeAvailable) return null

  const running = (processes ?? []).filter((p) => p.state === 'running')
  const loading = processes === null && error === null

  return (
    <>
      {/* Trigger button — floats above AssetsPopover (bottom-left stack) */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={`absolute bottom-3 left-16 z-20 rounded-full p-1.5 shadow-sm backdrop-blur-sm transition-all ${
          open
            ? 'bg-primary-600/90 text-white hover:bg-primary-700/90'
            : 'bg-neutral-800/60 text-white hover:bg-neutral-700/70 dark:bg-neutral-200/60 dark:text-neutral-900 dark:hover:bg-neutral-200/80'
        } ${running.length > 0 && !open ? 'ring-1 ring-emerald-400/60' : ''}`}
        title={t('processes.title', { defaultValue: 'Background processes' })}
      >
        <ServerCog className="h-3.5 w-3.5" />
        {running.length > 0 && !open && (
          <span className="absolute -top-1 -right-1 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-emerald-500 px-0.5 text-[8px] font-bold leading-none text-white">
            {running.length > 9 ? '9+' : running.length}
          </span>
        )}
      </button>

      {/* Expanded panel */}
      {open && (
        <div
          ref={panelRef}
          className="absolute bottom-12 left-16 z-30 w-96 max-h-80 flex flex-col rounded-xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-700 dark:bg-neutral-800"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-neutral-100 dark:border-neutral-700 px-3 py-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-secondary">
              {t('processes.title', { defaultValue: 'Background processes' })}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => refresh()}
                className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-700 dark:hover:text-neutral-300"
                title={t('processes.refresh', { defaultValue: 'Refresh' })}
              >
                <RefreshCw className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-700 dark:hover:text-neutral-300"
                title={t('common.close', { defaultValue: 'Close' })}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto custom-scrollbar py-1">
            {error && processes === null ? (
              <div className="px-3 py-6 text-center text-xs text-red-500">{error}</div>
            ) : loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-4 w-4 animate-spin text-neutral-400" />
              </div>
            ) : running.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-neutral-400">
                <ServerCog className="mb-2 h-5 w-5" />
                <span className="text-xs">
                  {t('processes.empty', { defaultValue: 'No background processes' })}
                </span>
              </div>
            ) : (
              <>
                {running.map((proc) => (
                  <div key={proc.process_id}>
                    <ProcessRow
                      proc={proc}
                      busy={busyId === proc.process_id}
                      onToggleLog={() => handleToggleLog(proc)}
                      onStop={() => handleStop(proc)}
                    />
                    {openLogId === proc.process_id && (
                      <pre className="mx-2.5 mb-1.5 max-h-40 overflow-auto rounded-md bg-black px-2.5 py-2 font-mono text-[10px] leading-4 text-neutral-200 dark:bg-neutral-950">
                        {logs[proc.process_id] ?? '…'}
                      </pre>
                    )}
                  </div>
                ))}
              </>
            )}
          </div>

          {/* Footer */}
          {running.length > 0 && (
            <div className="border-t border-neutral-100 dark:border-neutral-700 px-3 py-1.5">
              <span className="text-[10px] text-neutral-400">
                {running.length}{' '}
                {t('processes.running', { defaultValue: 'running' })}
              </span>
            </div>
          )}
        </div>
      )}
    </>
  )
})
