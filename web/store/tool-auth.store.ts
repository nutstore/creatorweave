/**
 * Tool Auth Store — the single unified authorization queue.
 *
 * Merges the two previous same-purpose channels:
 *   - exec-auth.store (FIFO queue for exec prompt commands)
 *   - page-write-auth.store (single-slot for page-action writes)
 * into one FIFO channel with an optional "Always allow for this conversation"
 * decision (§3.3 of the tool-authorization-redesign doc).
 *
 * Flow:
 *   1. The policy engine (or a legacy thin wrapper) calls request({ toolName,
 *      description, memoryKey, conversationId, signal })
 *   2. The request is queued; ToolAuthModal renders queue[0]
 *   3. User clicks Allow / Always allow / Deny → resolve(approved, remember)
 *   4. request() resolves { approved, remembered }. The POLICY ENGINE (not
 *      this store) writes the memory key into session-allow.store when
 *      remembered is set — this store stays UI-pure and testable.
 *
 * Stale-approval protection (two layers, both required):
 *   - Store layer: an aborted run's signal resolves its request as deny.
 *   - Executor layer: callers must re-check context.abortSignal?.aborted
 *     after approval (the user may approve a request whose run was already
 *     interrupted — the queue outlives loop lifecycles).
 *
 * The modal has NO timeout and CANNOT be dismissed via backdrop or Esc — it
 * stays blocking until the user clicks an explicit action button. An accidental
 * backdrop-deny previously sent misleading refusal signals to the LLM.
 */

import { create } from 'zustand'
import type { FileChange } from '@/opfs/types/opfs-types'

export interface PendingToolAuth {
  id: string
  toolName: string
  /**
   * Modal body. Either an i18n descriptor (rendered with useT by
   * ToolAuthModal — the locale-aware path) or a pre-formatted string for
   * callers that build context outside the React tree (exec's execution
   * context; legacy thin-wrapper callers).
   */
  description: ToolAuthDescriptionInput
  /** Optional secondary block rendered as code (the exec command itself). */
  detail?: string
  /** Raw tool arguments, rendered in the modal as pretty-printed JSON. */
  toolArgs?: unknown
  /** Structured file-change list (sync-like tools); clickable rows → diff. */
  fileChanges?: FileChange[]
  /**
   * Session-memory key. Non-null enables the "Always allow" button; null means
   * every invocation must be decided individually.
   */
  memoryKey: string | null
  /** Conversation the request belongs to (scopes the "always allow" grant). */
  conversationId: string | null
  /** Resolves when the user makes a decision (remember = "always allow"). */
  resolve: (approved: boolean, remember?: boolean) => void
  abortCleanup?: () => void
  createdAt: number
}

/**
 * Modal body input: an i18n descriptor ({ key, params }) or a plain string.
 * String form is legacy — prefer the descriptor so the modal follows locale.
 */
export type ToolAuthDescriptionInput =
  | { key: string; params?: Record<string, string | number> }
  | string
  | null

export interface ToolAuthRequestInput {
  toolName: string
  description: ToolAuthDescriptionInput
  /** Optional secondary block rendered as code (exec command, etc.). */
  detail?: string
  /** Raw tool arguments for modal display (pretty-printed JSON). */
  toolArgs?: unknown
  /** Structured file-change list (sync-like tools); clickable rows → diff. */
  fileChanges?: FileChange[]
  memoryKey?: string | null
  conversationId?: string | null
  signal?: AbortSignal
}

/** What request() resolves to once the user (or an abort) decided. */
export interface ToolAuthResolution {
  approved: boolean
  /** True when the user picked "Always allow for this conversation". */
  remembered: boolean
}

interface ToolAuthState {
  /** The request currently rendered by the authorization modal. */
  pending: PendingToolAuth | null
  /** FIFO queue of authorization requests, including the current request. */
  queue: PendingToolAuth[]

  /** Enqueue an auth request. Resolves when the user acts on that request. */
  request: (input: ToolAuthRequestInput) => Promise<ToolAuthResolution>

  /** User approved the current request (remember = "always allow" picked). */
  approve: (remember?: boolean) => void

  /** User denied the current request. */
  deny: () => void

  /** Deny the current request AND all queued ones ("Deny all" button). */
  denyAll: () => void

  /** Deny all queued requests (component unmount safety). */
  clear: () => void
}

export const useToolAuthStore = create<ToolAuthState>((set, get) => ({
  pending: null,
  queue: [],

  request: (input) => {
    const id = `tool_auth_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

    return new Promise<ToolAuthResolution>((resolve) => {
      let settled = false
      const settle = (approved: boolean, remember = false) => {
        if (settled) return
        settled = true

        const current = get().queue.find((r) => r.id === id)
        current?.abortCleanup?.()
        const queue = get().queue.filter((r) => r.id !== id)
        set({ queue, pending: queue[0] ?? null })
        resolve({ approved, remembered: remember })
      }

      const onAbort = () => settle(false)
      const abortCleanup = input.signal
        ? () => input.signal!.removeEventListener('abort', onAbort)
        : undefined
      const request: PendingToolAuth = {
        id,
        toolName: input.toolName,
        description: input.description,
        detail: input.detail,
        toolArgs: input.toolArgs,
        fileChanges: input.fileChanges,
        memoryKey: input.memoryKey ?? null,
        conversationId: input.conversationId ?? null,
        resolve: settle,
        abortCleanup,
        createdAt: Date.now(),
      }

      const queue = [...get().queue, request]
      set({ queue, pending: queue[0] ?? null })

      if (input.signal) {
        input.signal.addEventListener('abort', onAbort, { once: true })
        if (input.signal.aborted) onAbort()
      }
    })
  },

  approve: (remember = false) => {
    get().pending?.resolve(true, remember)
  },

  deny: () => {
    get().pending?.resolve(false)
  },

  // "Deny all" is the escape hatch for the stale-queue UX: denying one by one
  // advances the FIFO queue, which can feel endless when many stale requests
  // from interrupted loops piled up.
  denyAll: () => {
    get().clear()
  },

  clear: () => {
    const queue = get().queue
    set({ queue: [], pending: null })
    for (const request of queue) {
      request.abortCleanup?.()
      request.resolve(false)
    }
  },
}))
