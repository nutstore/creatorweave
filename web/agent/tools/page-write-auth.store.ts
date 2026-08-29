/**
 * Page Write Auth Store — DEPRECATED thin wrapper.
 *
 * PR-1 merged this single-slot queue into the unified FIFO tool-auth.store
 * (web/store/tool-auth.store.ts). Semantics change is intentional and safe:
 * a second concurrent request now queues behind the visible one instead of
 * silently denying it (FIFO only ever delays, never loses, a request).
 *
 * Keeps the legacy usePageWriteAuthStore API (getState().request/approve/
 * deny/clear) for page-write.tool.ts. Modal rendering now happens in
 * ToolAuthModal (subscribed to the unified store).
 *
 * Will be deleted after the page-action side is verified.
 */

import { useToolAuthStore } from '@/store/tool-auth.store'

interface PageWriteAuthState {
  /** Push a new auth request. Returns a promise that resolves on user action. */
  request: (toolName: string, description: string, signal?: AbortSignal) => Promise<boolean>
  approve: () => void
  deny: () => void
  clear: () => void
}

function createPageWriteWrapper(): PageWriteAuthState & { getState: () => PageWriteAuthState } {
  const state: PageWriteAuthState = {
    request: (toolName, description, signal) =>
      useToolAuthStore
        .getState()
        .request({
          toolName,
          description,
          // Coarse grant: one approval covers page-action writes for the
          // conversation (the URL blacklist remains a separate hard pre-check).
          memoryKey: 'page-action-write',
          conversationId: null,
          signal,
        })
        .then((r) => r.approved),

    approve: () => useToolAuthStore.getState().approve(false),
    deny: () => useToolAuthStore.getState().deny(),
    clear: () => useToolAuthStore.getState().clear(),
  }
  return { ...state, getState: () => state }
}

export const usePageWriteAuthStore = createPageWriteWrapper()
