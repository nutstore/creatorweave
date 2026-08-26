/**
 * Page Action Auth Store
 *
 * A lightweight, standalone authorization queue for page-action write tools.
 * This is SEPARATE from the LLM's ask_user_question tool — it does NOT go
 * through the conversation flow. It's a UI-level confirmation modal that
 * blocks tool execution until the user approves/denies.
 *
 * Flow:
 *   1. Write tool executor calls requestPageWriteAuth(toolName, description)
 *   2. This pushes a pending request into the store → React modal renders
 *   3. User clicks Approve/Deny → promise resolves
 *   4. Tool executor continues or returns AUTH_DENIED_BY_USER
 *
 * The modal has NO timeout — it waits indefinitely for user action.
 * User can dismiss (deny) or the agent's abort signal will reject.
 */

import { create } from 'zustand'

export interface PendingPageWriteAuth {
  id: string
  toolName: string
  description: string
  /** Resolves when the user makes a decision (true=approve, false=deny). */
  resolve: (approved: boolean) => void
  abortCleanup?: () => void
  createdAt: number
}

interface PageWriteAuthState {
  /** Current pending request, or null if none. Only one at a time. */
  pending: PendingPageWriteAuth | null

  /** Push a new auth request. Returns a promise that resolves on user action. */
  request: (toolName: string, description: string, signal?: AbortSignal) => Promise<boolean>

  /** User approved the current request. */
  approve: () => void

  /** User denied the current request. */
  deny: () => void

  /** Clear without resolving (e.g. component unmount safety — resolves as deny). */
  clear: () => void
}

export const usePageWriteAuthStore = create<PageWriteAuthState>((set, get) => ({
  pending: null,

  request: (toolName, description, signal) => {
    // If there's already a pending request, deny it first (shouldn't happen
    // in practice since tools run sequentially, but defensive).
    const existing = get().pending
    if (existing) {
      existing.resolve(false)
    }

    const id = `pwa_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    return new Promise<boolean>((resolve) => {
      let settled = false
      const settle = (approved: boolean) => {
        if (settled) return
        settled = true
        const current = get().pending
        if (current?.id === id) {
          current.abortCleanup?.()
          set({ pending: null })
        }
        resolve(approved)
      }
      const onAbort = () => settle(false)
      const abortCleanup = signal
        ? () => signal.removeEventListener('abort', onAbort)
        : undefined

      set({
        pending: {
          id,
          toolName,
          description,
          resolve: settle,
          abortCleanup,
          createdAt: Date.now(),
        },
      })

      if (signal) {
        signal.addEventListener('abort', onAbort, { once: true })
        if (signal.aborted) onAbort()
      }
    })
  },

  approve: () => {
    const pending = get().pending
    if (pending) {
      pending.abortCleanup?.()
      pending.resolve(true)
    }
  },

  deny: () => {
    const pending = get().pending
    if (pending) {
      pending.abortCleanup?.()
      pending.resolve(false)
    }
  },

  clear: () => {
    const pending = get().pending
    if (pending) {
      pending.abortCleanup?.()
      pending.resolve(false)
    }
    set({ pending: null })
  },
}))
