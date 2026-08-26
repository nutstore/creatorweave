/**
 * Exec Auth Store
 *
 * Standalone authorization modal for exec tool prompt-level commands.
 * Prompt-level exec calls may run in parallel, so authorization is queued in
 * FIFO order instead of allowing a later request to replace the visible one.
 */

import { create } from 'zustand'

export interface PendingExecAuth {
  id: string
  command: string[]
  description: string
  /** Resolves when the user makes a decision (true=approve, false=deny). */
  resolve: (approved: boolean) => void
  abortCleanup?: () => void
  createdAt: number
}

interface ExecAuthState {
  /** The request currently rendered by the authorization modal. */
  pending: PendingExecAuth | null
  /** FIFO queue of authorization requests, including the current request. */
  queue: PendingExecAuth[]

  /** Enqueue an auth request. Resolves when the user acts on that request. */
  request: (command: string[], description: string, signal?: AbortSignal) => Promise<boolean>

  /** User approved the current request. */
  approve: () => void

  /** User denied the current request. */
  deny: () => void

  /** Deny all queued requests (e.g. component unmount safety). */
  clear: () => void
}

export const useExecAuthStore = create<ExecAuthState>((set, get) => ({
  pending: null,
  queue: [],

  request: (command, description, signal) => {
    const id = `exec_auth_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

    return new Promise<boolean>((resolve) => {
      let settled = false
      const settle = (approved: boolean) => {
        if (settled) return
        settled = true

        const current = get().queue.find((request) => request.id === id)
        current?.abortCleanup?.()
        const queue = get().queue.filter((request) => request.id !== id)
        set({ queue, pending: queue[0] ?? null })
        resolve(approved)
      }

      const onAbort = () => settle(false)
      const abortCleanup = signal
        ? () => signal.removeEventListener('abort', onAbort)
        : undefined
      const request: PendingExecAuth = {
        id,
        command,
        description,
        resolve: settle,
        abortCleanup,
        createdAt: Date.now(),
      }

      const queue = [...get().queue, request]
      set({ queue, pending: queue[0] ?? null })

      if (signal) {
        signal.addEventListener('abort', onAbort, { once: true })
        if (signal.aborted) onAbort()
      }
    })
  },

  approve: () => {
    get().pending?.resolve(true)
  },

  deny: () => {
    get().pending?.resolve(false)
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
