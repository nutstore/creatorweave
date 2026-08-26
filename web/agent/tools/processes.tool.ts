/**
 * processes tool — inspect and manage background processes started via exec
 * (dev servers etc, STATUS.md §17).
 *
 * Default call (no args) lists all managed processes — this is the cheap,
 * obvious way for the model to discover what is running in the background.
 * logs / status / stop reference a process by name (or process_id).
 *
 * Requires the Native Host bridge; no user approval is needed for list/status
 * (read-only), stop goes through the same channel the exec tool uses.
 */

import type { ToolDefinition, ToolExecutor, ToolPromptDoc } from './tool-types'
import { toolOkJson, toolErrorJson } from './tool-envelope'

// ─── Helpers (shared with exec.tool.ts semantics) ──────────────

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

/** Resolve a native-host scope_id from a root name (same defaulting as exec). */
async function resolveScopeId(
  rootName: string | undefined,
  context: { projectId?: string | null },
): Promise<string | null> {
  try {
    const { getProjectRootRepository } = await import(
      '@/sqlite/repositories/project-root.repository'
    )
    const roots = await getProjectRootRepository().findByProject(context.projectId ?? '')
    const nativeHostRoots = roots.filter((r: any) => r.backend === 'native-host')
    if (rootName) {
      return nativeHostRoots.find((r: any) => r.name === rootName)?.scopeId ?? null
    }
    const defaultRoot = nativeHostRoots.find((r: any) => r.isDefault) ?? nativeHostRoots[0]
    return defaultRoot?.scopeId ?? null
  } catch {
    return null
  }
}

// ─── Tool definition ───────────────────────────────────────────

export const processesDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'processes',
    description: [
      'Inspect and manage background processes started via the exec tool (dev servers, watchers, long-running tasks).',
      '',
      'Call it with NO arguments to list every managed background process and see which are still running — this is the way to discover background processes, including ones left over from earlier sessions.',
      'Use action "logs" (with process name) to read recent output, "status" to check one process, and "stop" to terminate one.',
    ].join('\n'),
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['logs', 'status', 'stop'],
          description: 'Optional action. Omit entirely to list all processes. "logs" returns recent output; "status" checks one process; "stop" terminates it.',
        },
        process: {
          type: 'string',
          description: 'Process name (for example "web-dev") or process_id — required for logs/status/stop.',
        },
        root: {
          type: 'string',
          description: 'Authorized root name, to disambiguate when the same process name exists in multiple roots.',
        },
      },
      required: [],
    },
  },
}

// ─── Executor ──────────────────────────────────────────────────

export const processesExecutor: ToolExecutor = async (args, context) => {
  const action = typeof args.action === 'string' ? args.action : undefined
  const procRef = typeof args.process === 'string' ? args.process : undefined
  const rootName = typeof args.root === 'string' ? args.root : undefined

  // Bridge check
  const agentWeb = (window as any).__agentWeb
  if (typeof agentWeb?.nativeHostCall !== 'function') {
    return toolErrorJson('processes', 'bridge_unavailable',
      'Native Host bridge is not available. Background processes require the Native Host.')
  }

  // --- Default: list all (also discovers leftovers from previous sessions) ---
  if (!action || action === 'list') {
    const resp = await nativeHostCall({ action: 'exec_list' })
      .catch((err) => ({ ok: false, error: String(err) }))
    if (!resp?.ok) {
      return toolErrorJson('processes', 'action_failed', `exec_list failed: ${resp?.error ?? 'unknown error'}`)
    }
    const processes: any[] = resp.processes ?? []
    const running = processes.filter((p) => p.state === 'running')
    const ended = processes.filter((p) => p.state !== 'running')
    return toolOkJson('processes', {
      running,
      running_count: running.length,
      ended_count: ended.length,
      ...(ended.length > 0 ? { note: `${ended.length} finished process record(s) hidden (auto-pruned after 1 day)` } : {}),
    }, running.length > 0 ? undefined : {
      hint: 'No background processes are running. Start one with exec({ command: [...], background: true, name: "..." }).',
    })
  }

  if (!procRef) {
    return toolErrorJson('processes', 'INVALID_INPUT',
      'Parameter "process" (name or id) is required for this action.', { retryable: true })
  }

  // Reference by id or by name (+ scope disambiguation when root is known).
  let payload: Record<string, unknown>
  if (procRef.startsWith('proc_')) {
    payload = { process_id: procRef }
  } else {
    const scopeId = await resolveScopeId(rootName, context)
    payload = { name: procRef, ...(scopeId ? { scope_id: scopeId } : {}) }
  }

  if (action === 'logs') {
    const resp = await nativeHostCall({ action: 'exec_logs', ...payload, tail: 32_000 })
      .catch((err) => ({ ok: false, error: String(err) }))
    if (!resp?.ok) {
      return toolErrorJson('processes', 'action_failed', `exec_logs failed: ${resp?.error ?? 'unknown error'}`)
    }
    return toolOkJson('processes', {
      action: 'logs',
      process: procRef,
      log: decodeBase64ToString(String(resp.data ?? '')) || '(no output)',
      eof: resp.eof === true,
    })
  }

  if (action === 'status') {
    const resp = await nativeHostCall({ action: 'exec_status', ...payload })
      .catch((err) => ({ ok: false, error: String(err) }))
    if (!resp?.ok) {
      return toolErrorJson('processes', 'action_failed', `exec_status failed: ${resp?.error ?? 'unknown error'}`)
    }
    return toolOkJson('processes', { action: 'status', process: procRef, ...resp })
  }

  if (action === 'stop') {
    let resp = await nativeHostCall({ action: 'exec_stop', ...payload })
      .catch((err) => ({ ok: false, error: String(err) }))
    if (!resp?.ok) {
      return toolErrorJson('processes', 'action_failed', `exec_stop failed: ${resp?.error ?? 'unknown error'}`)
    }
    if (resp.state === 'running' && resp.note?.includes('force')) {
      // SIGTERM grace period elapsed — escalate to SIGKILL.
      resp = await nativeHostCall({ action: 'exec_stop', ...payload, force: true })
        .catch((err) => ({ ok: false, error: String(err) }))
      if (!resp?.ok) {
        return toolErrorJson('processes', 'action_failed', `force stop failed: ${resp?.error ?? 'unknown error'}`)
      }
    }
    window.dispatchEvent(new CustomEvent('cw:bg-processes-changed'))
    return toolOkJson('processes', {
      action: 'stop',
      process: procRef,
      state: resp.state,
      signaled: resp.signaled === true,
    })
  }

  return toolErrorJson('processes', 'INVALID_INPUT',
    `Unknown action "${action}". Supported: (none), logs, status, stop.`, { retryable: true })
}

// ─── Prompt doc ────────────────────────────────────────────────

export const processesPromptDoc: ToolPromptDoc = {
  category: 'execution',
  section: '### Command Execution',
  lines: [
    '- `processes()` — List background processes started via exec (dev servers etc), including leftovers from earlier sessions; shows name/command/state. `processes({ action: "logs", process: "<name>" })` reads recent output; `action: "stop"` terminates one. Use this BEFORE starting a dev server to avoid duplicate processes.',
  ],
}
