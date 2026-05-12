/**
 * useInitialMessage — handles sending an initial message on mount
 * with StrictMode safety (dedup via ref keys).
 *
 * All logic lives in a single useEffect to avoid StrictMode double-mount
 * races where a separate "reset on convId change" effect could clear the
 * handled flag before the main effect re-fires.
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
  const lastConvIdRef = useRef<string | null>(null)

  useEffect(() => {
    // Reset handled flag when conversation changes
    if (convId !== lastConvIdRef.current) {
      lastConvIdRef.current = convId
      handled.current = false
    }

    if (!initialMessage || !convId || isRunning) return
    if (handled.current) return

    // StrictMode guard: check if message already appended to conversation
    const currentConv = useConversationStore.getState().conversations.find((c) => c.id === convId)
    const lastMessage = currentConv?.messages[currentConv.messages.length - 1]
    if (lastMessage?.role === 'user' && lastMessage.content === initialMessage) {
      handled.current = true
      onConsumed?.()
      return
    }

    handled.current = true
    sendMessage(initialMessage)
    onConsumed?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMessage, convId, isRunning])
}
