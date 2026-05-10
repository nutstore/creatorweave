import { useState, useEffect, useCallback, memo } from 'react'
import { ChevronDown } from 'lucide-react'
import { useT } from '@/i18n'

interface ScrollToBottomButtonProps {
  scrollContainerRef: React.RefObject<HTMLDivElement | null>
  messagesEndRef: React.RefObject<HTMLDivElement | null>
  isUserAtBottomRef: React.RefObject<boolean>
  convId: string | undefined
}

/**
 * Isolated scroll-to-bottom button.
 *
 * Manages its own `showScrollToBottom` state via a scroll listener so that
 * scroll events do **not** cause ConversationView (and therefore
 * AgentRichInput) to re-render.
 */
export const ScrollToBottomButton = memo(function ScrollToBottomButton({
  scrollContainerRef,
  messagesEndRef,
  isUserAtBottomRef,
  convId,
}: ScrollToBottomButtonProps) {
  const t = useT()
  const [show, setShow] = useState(false)

  useEffect(() => {
    const el = scrollContainerRef.current
    if (!el) return
    const handleScroll = () => {
      const threshold = 80
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < threshold
      isUserAtBottomRef.current = atBottom
      setShow(!atBottom)
    }
    el.addEventListener('scroll', handleScroll, { passive: true })
    return () => el.removeEventListener('scroll', handleScroll)
  }, [convId, scrollContainerRef, isUserAtBottomRef])

  const handleClick = useCallback(() => {
    isUserAtBottomRef.current = true
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messagesEndRef, isUserAtBottomRef])

  if (!show) return null

  return (
    <button
      type="button"
      onClick={handleClick}
      className="absolute bottom-3 right-4 rounded-full bg-neutral-800/70 p-2 text-white shadow-lg backdrop-blur-sm transition-opacity hover:bg-neutral-700/80 dark:bg-neutral-200/70 dark:text-neutral-900 dark:hover:bg-neutral-200/90"
      title={t('conversation.buttons.scrollToBottom')}
    >
      <ChevronDown className="h-4 w-4" />
    </button>
  )
})
