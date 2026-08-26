/**
 * ServiceWorkerBridge — listens for postMessage from the Service Worker
 * and routes accordingly.
 *
 * Currently handles:
 *   - `NAVIGATE_TO_CONVERSATION` — focus + navigate to
 *     `/projects/{projectId}/workspaces/{conversationId}`
 *     (typically triggered by clicking an agent-loop-complete notification)
 *
 * Mount this once near the root of the React tree (e.g. inside AppReady).
 */

import { useEffect } from 'react'
import { useNavigate } from '@/router/next-router-compat'
import { buildConversationNotificationRoute } from '@/services/notification-route'

interface NavigateToConversationMessage {
  type: 'NAVIGATE_TO_CONVERSATION'
  projectId?: string
  conversationId?: string
}

export function ServiceWorkerBridge() {
  const navigate = useNavigate()

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.serviceWorker) {
      return
    }

    const handleMessage = (event: MessageEvent) => {
      const data = event.data
      if (!data || typeof data !== 'object') return

      const message = data as NavigateToConversationMessage

      if (message.type === 'NAVIGATE_TO_CONVERSATION') {
        const { projectId, conversationId } = message
        if (projectId && conversationId) {
          navigate(buildConversationNotificationRoute(projectId, conversationId))
        }
      }
    }

    navigator.serviceWorker.addEventListener('message', handleMessage)
    return () => {
      navigator.serviceWorker.removeEventListener('message', handleMessage)
    }
  }, [navigate])

  return null
}

export default ServiceWorkerBridge
