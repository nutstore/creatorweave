/**
 * ConversationBadge - displays current OPFS conversation status.
 */

import React, { useCallback, useMemo } from 'react'
import { useConversationContextStore } from '@/store/conversation-context.store'
import { Clock, AlertCircle } from 'lucide-react'
import { useT } from '@/i18n'

export interface ConversationBadgeProps {
  /** Optional click handler */
  onClick?: () => void
  /** Compact mode (show only counts) */
  compact?: boolean
}

/** @deprecated Use ConversationBadgeProps */
export type SessionBadgeProps = ConversationBadgeProps

export const ConversationBadge: React.FC<ConversationBadgeProps> = ({ onClick, compact = false }) => {
  const { activeWorkspaceId: activeConversationId, workspaces: conversations, currentPendingCount, initialized } =
    useConversationContextStore()
  const t = useT()

  // Get current conversation info
  const currentConversation = useMemo(() => {
    if (!activeConversationId) return null
    return conversations.find((w) => w.id === activeConversationId)
  }, [activeConversationId, conversations])

  const displayName = useMemo(() => {
    if (!currentConversation) return t('session.notInitialized')
    return currentConversation.name || activeConversationId?.slice(0, 8) || t('session.unknownSession')
  }, [currentConversation, activeConversationId, t])

  const hasPending = currentPendingCount > 0

  const handleClick = useCallback(() => {
    onClick?.()
  }, [onClick])

  // Not initialized yet
  if (!initialized) {
    return (
      <div className="flex items-center gap-2 text-xs text-tertiary dark:text-muted">
        <AlertCircle className="h-3.5 w-3.5" />
        <span>{t('session.initializing')}</span>
      </div>
    )
  }

  // No active conversation
  if (!activeConversationId || !currentConversation) {
    return (
      <div className="flex items-center gap-2 text-xs text-tertiary dark:text-muted">
        <AlertCircle className="h-3.5 w-3.5" />
        <span>{t('session.noSession')}</span>
      </div>
    )
  }

  // Compact mode - show only status dots
  if (compact) {
    return (
      <button
        type="button"
        onClick={handleClick}
        className="flex items-center gap-2 rounded-md border px-2 py-1 text-xs hover:bg-muted dark:hover:bg-muted"
        title={displayName}
      >
        <span className="max-w-[80px] truncate">{displayName}</span>
        {hasPending && (
          <span
            className="flex h-5 items-center gap-1 rounded-full bg-warning-bg px-1.5 text-warning"
            title={t('session.pendingCount', { count: currentPendingCount })}
          >
            <Clock className="h-3 w-3" />
            <span className="text-[10px] font-medium">{currentPendingCount}</span>
          </span>
        )}
      </button>
    )
  }

  // Full mode
  return (
    <button
      type="button"
      onClick={handleClick}
      className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-muted dark:hover:bg-muted"
      title={`${t('session.current')}: ${displayName}`}
    >
      {/* Session name */}
      <span className="max-w-[120px] truncate text-secondary dark:text-muted">{displayName}</span>

      {/* Pending count */}
      {hasPending && (
        <span
          className="flex h-5 items-center gap-1 rounded-full bg-warning-bg px-1.5 text-warning"
          title={t('session.pendingChanges', { count: currentPendingCount })}
        >
          <Clock className="h-3 w-3" />
          <span className="text-[10px] font-medium">{currentPendingCount}</span>
        </span>
      )}

      {/* No changes indicator */}
      {!hasPending && (
        <span className="text-xs text-tertiary dark:text-muted">{t('session.noChanges')}</span>
      )}
    </button>
  )
}

/** @deprecated Use ConversationBadge */
export const SessionBadge = ConversationBadge
