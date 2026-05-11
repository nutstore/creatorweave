/**
 * MessageNavBar — slim progress rail with hover-expand dot navigation.
 *
 * Default state: a thin vertical progress line hugging the right edge
 * of the message content column (max-w-3xl centered).
 *
 * On hover: the rail expands to reveal clickable dots for each user
 * message, with tooltip previews. Clicking a dot scrolls to that message.
 */

import { memo, useCallback, useEffect, useState } from 'react'
import { useT } from '@/i18n'
import type { ConversationMessagesHandle } from './ConversationMessages'

interface UserNavItem {
  turnIndex: number
  preview: string
  number: number
}

interface MessageNavBarProps {
  messagesHandle: React.RefObject<ConversationMessagesHandle | null>
  scrollContainerRef: React.RefObject<HTMLDivElement | null>
  messageCount: number
}

const DENSE_THRESHOLD = 20

export const MessageNavBar = memo(function MessageNavBar({
  messagesHandle,
  scrollContainerRef,
  messageCount,
}: MessageNavBarProps) {
  const t = useT()
  const [activeIndex, setActiveIndex] = useState(-1)
  const [userItems, setUserItems] = useState<UserNavItem[]>([])

  // ── Read nav items from handle (after commit, so ref is set) ──
  useEffect(() => {
    const readItems = () => {
      const handle = messagesHandle.current
      if (handle) {
        setUserItems(handle.getUserNavItems())
        return true
      }
      return false
    }
    if (!readItems()) {
      const id = requestAnimationFrame(readItems)
      return () => cancelAnimationFrame(id)
    }
  }, [messagesHandle, messageCount])

  const isDense = userItems.length > DENSE_THRESHOLD

  // ── Track active dot on scroll ──
  useEffect(() => {
    const el = scrollContainerRef.current
    if (!el || userItems.length <= 1) return

    const onScroll = () => {
      const scrollTop = el.scrollTop
      const triggerLine = scrollTop + el.clientHeight * 0.33
      let newActive = -1
      for (let i = 0; i < userItems.length; i++) {
        const node = el.querySelector(`[data-turn-index="${userItems[i].turnIndex}"]`)
        if (node) {
          const top = node.getBoundingClientRect().top - el.getBoundingClientRect().top + scrollTop
          if (top <= triggerLine) newActive = i
        }
      }
      setActiveIndex(newActive)
    }

    el.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => el.removeEventListener('scroll', onScroll)
  }, [userItems, scrollContainerRef])

  const handleClick = useCallback(
    (turnIndex: number) => { messagesHandle.current?.scrollToTurnIndex(turnIndex, 'start') },
    [messagesHandle],
  )

  if (userItems.length <= 1) return null

  const fillRatio = activeIndex >= 0 && userItems.length > 1 ? activeIndex / (userItems.length - 1) : 0

  return (
    // Outer wrapper matches the message content column layout (max-w-3xl mx-auto)
    // so the rail aligns with the right edge of the message column.
    <div className="pointer-events-none absolute inset-x-0 top-0 bottom-0 z-10 hidden sm:block">
      <div className="mx-auto h-full max-w-3xl px-4">
        <div className="relative h-full">
          {/* Rail container — positioned just outside the content right edge */}
          <nav
            className="msg-nav-rail pointer-events-auto absolute -right-8 top-8 bottom-8 flex w-4 flex-col items-center overflow-visible"
            role="navigation"
            aria-label={t('conversation.nav.label', { defaultValue: 'Message navigation' })}
          >
            {/* Track + fill line (always visible) */}
            <div className="relative flex flex-1 w-full">
              {/* Background line */}
              <div className="absolute left-1/2 w-px -translate-x-1/2 bg-neutral-200/70 dark:bg-neutral-800/70" style={{ top: 0, bottom: 0 }} />
              {/* Fill line */}
              <div
                className="absolute left-1/2 w-px -translate-x-1/2 bg-primary-400 dark:bg-primary-600"
                style={{
                  top: 0,
                  height: fillRatio > 0 ? `${fillRatio * 100}%` : 0,
                  transition: 'height 0.35s cubic-bezier(0.4,0,0.2,1)',
                }}
              />
            </div>

            {/* Dots — hidden by default, shown on hover */}
            <div className="msg-nav-dots absolute inset-0 flex flex-col items-center justify-between opacity-0 transition-opacity duration-200">
              {userItems.map((item, i) => (
                <div
                  key={item.turnIndex}
                  className="group/dot relative z-[2] cursor-pointer"
                  style={{ padding: isDense ? '1px 0' : '2px 0' }}
                  role="button"
                  tabIndex={0}
                  aria-label={`#${item.number} ${item.preview}`}
                  aria-current={i === activeIndex ? 'true' : undefined}
                  onClick={() => handleClick(item.turnIndex)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClick(item.turnIndex) } }}
                >
                  <div
                    className={[
                      'rounded-full transition-all duration-200',
                      i === activeIndex ? 'bg-primary-500' : 'bg-neutral-300 hover:bg-primary-400',
                      'dark:bg-[#2E4245] hover:dark:bg-primary-400',
                      i === activeIndex && 'dark:bg-[#6B999D]',
                    ].filter(Boolean).join(' ')}
                    style={{ width: i === activeIndex ? 6 : 5, height: i === activeIndex ? 6 : 5 }}
                  />
                  {/* Tooltip — appears to the left */}
                  <div className="pointer-events-none absolute right-[calc(100%+8px)] top-1/2 z-50 -translate-y-1/2 whitespace-nowrap rounded border border-neutral-200 bg-white px-2 py-1 text-xs text-neutral-600 opacity-0 shadow-sm transition-opacity group-hover/dot:opacity-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400">
                    <span className="text-neutral-400 dark:text-neutral-500">#{item.number}</span> {item.preview}
                  </div>
                </div>
              ))}
            </div>
          </nav>
        </div>
      </div>
    </div>
  )
})
