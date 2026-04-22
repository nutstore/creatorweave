/**
 * useUnloadGuard - prevent accidental page close/refresh when there are unsaved changes.
 *
 * Registers a `beforeunload` listener that triggers the browser's native
 * "Leave site?" confirmation dialog whenever:
 * - the workspace store reports pending file changes, OR
 * - a conversation (agent loop) is currently running.
 *
 * The hook is a no-op when there is nothing to protect.
 */
import { useEffect } from 'react'
import { useConversationContextStore } from '@/store/conversation-context.store'
import { useConversationStore } from '@/store/conversation.store'

export function useUnloadGuard() {
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      const { currentPendingCount, pendingChanges } = useConversationContextStore.getState()
      const hasPending = currentPendingCount > 0 || (pendingChanges?.changes.length ?? 0) > 0

      // Also guard when any agent loop is running
      const { agentLoops } = useConversationStore.getState()
      let isRunning = false
      for (const loop of agentLoops.values()) {
        if (loop.running) {
          isRunning = true
          break
        }
      }

      if (!hasPending && !isRunning) return

      // Modern browsers require preventDefault() to show the confirmation dialog.
      e.preventDefault()
    }

    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [])
}
