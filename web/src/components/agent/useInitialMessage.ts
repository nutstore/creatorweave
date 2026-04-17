/**
 * useInitialMessage — handles sending an initial message on mount
 * with StrictMode safety (dedup via ref keys).
 */

import { useRef, useEffect } from 'react'
import { useConversationStore } from '@/store/conversation.store'

interface UseInitialMessageOptions {
  initialMessage: string | null | undefined
  convId: string | null
  isRunning: boolean
  sendMessage: (text: string) => void
  onConsumed?: () => void
}

export function useInitialMessage({
  initialMessage,
  convId,
  isRunning,
  sendMessage,
  onConsumed,
}: UseInitialMessageOptions) {
  const handled = useRef(false)
  const keyRef = useRef<string | null>(null)

  // Reset on conversation change
  useEffect(() => {
    handled.current = false
    keyRef.current = null
  }, [convId])

  useEffect(() => {
    if (!initialMessage || !convId || isRunning) return
    const key = `${convId}:${initialMessage}`
    if (keyRef.current === key || handled.current) return

    // StrictMode guard: check if already appended
    const currentConv = useConversationStore.getState().conversations.find((c) => c.id === convId)
    const lastMessage = currentConv?.messages[currentConv.messages.length - 1]
    if (lastMessage?.role === 'user' && lastMessage.content === initialMessage) {
      handled.current = true
      keyRef.current = key
      onConsumed?.()
      return
    }

    keyRef.current = key
    if (!handled.current) {
      handled.current = true
      sendMessage(initialMessage)
      onConsumed?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMessage, convId, isRunning])
}
