/**
 * useUnloadGuard - prevent accidental page close/refresh when there are unsaved changes.
 *
 * Registers event listeners that:
 * 1. Commit any in-flight streaming drafts to persistent storage, so content
 *    is not lost if the user proceeds with the refresh/close.
 * 2. Trigger the browser's native "Leave site?" confirmation dialog whenever:
 *    - the workspace store reports pending file changes that haven't been synced, OR
 *    - a conversation (agent loop) is currently running.
 *
 * Uses both `beforeunload` (for the confirmation dialog) and `pagehide`
 * (for reliable draft persistence, especially on mobile/bfcache).
 *
 * NOTE: We only check `currentPendingCount` (which reflects the actual pending
 * ledger count from refreshPendingChanges). We intentionally do NOT check
 * `pendingChanges?.changes.length` separately because during sync-to-disk,
 * that field may briefly hold stale data while the async refresh hasn't completed.
 */
import { useEffect } from 'react'
import { useConversationContextStore } from '@/store/conversation-context.store'
import { useConversationStore } from '@/store/conversation.store'

/**
 * Commit and persist any in-flight streaming drafts.
 * Shared between beforeunload and pagehide handlers.
 * Guarded against double-execution with a flag.
 */
let draftsSaved = false
function saveDraftsIfNeeded() {
  if (draftsSaved) return
  const { conversations } = useConversationStore.getState()
  const isRunning = conversations.some(conv => !!conv.activeRunId)
  if (!isRunning) return

  draftsSaved = true
  try {
    useConversationStore.getState().commitAndPersistRunningDrafts()
  } catch (err) {
    console.error('[useUnloadGuard] Failed to save drafts on unload:', err)
  }
}

export function useUnloadGuard() {
  useEffect(() => {
    // Reset flag on mount (e.g. after soft navigation in SPA)
    draftsSaved = false

    // beforeunload: shows the "Leave site?" confirmation dialog
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const { currentPendingCount } = useConversationContextStore.getState()
      const { conversations } = useConversationStore.getState()
      const isRunning = conversations.some(conv => !!conv.activeRunId)

      if (currentPendingCount === 0 && !isRunning) return

      // Save streaming drafts before the page unloads
      saveDraftsIfNeeded()

      // Modern browsers require preventDefault() to show the confirmation dialog.
      e.preventDefault()
      // Fallback for older browsers (Chrome < 119, Firefox < 116)
      e.returnValue = ''
    }

    // pagehide: more reliable than beforeunload for data persistence,
    // especially on mobile Safari and bfcache scenarios.
    // This fires even when beforeunload is suppressed.
    const handlePageHide = () => {
      saveDraftsIfNeeded()
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    window.addEventListener('pagehide', handlePageHide)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      window.removeEventListener('pagehide', handlePageHide)
    }
  }, [])
}
