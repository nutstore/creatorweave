/**
 * ConversationSwitcher - dropdown menu for switching between OPFS conversations.
 */

import React, { useState, useCallback, useMemo } from 'react'
import { useConversationContextStore } from '@/store/conversation-context.store'
import { ChevronDown, Check, Clock, Trash2, Plus } from 'lucide-react'
import { useT } from '@/i18n'

export interface ConversationSwitcherProps {
  /** Callback when conversation is switched */
  onConversationSwitch?: (conversationId: string) => void
  /** Show create new conversation button */
  showCreate?: boolean
  /** Show delete conversation button */
  showDelete?: boolean
}

/** @deprecated Use ConversationSwitcherProps */
export type SessionSwitcherProps = ConversationSwitcherProps

export const ConversationSwitcher: React.FC<ConversationSwitcherProps> = ({
  onConversationSwitch,
  showCreate = false,
  showDelete = false,
}) => {
  const t = useT()
  const [open, setOpen] = useState(false)
  const {
    activeWorkspaceId: activeConversationId,
    workspaces: conversations,
    switchWorkspace,
    deleteWorkspace,
    isLoading,
  } = useConversationContextStore()

  // Sort conversations: active first, then by lastActiveAt
  const sortedConversations = useMemo(() => {
    return [...conversations].sort((a, b) => {
      if (a.id === activeConversationId) return -1
      if (b.id === activeConversationId) return 1
      return (b.lastActiveAt || 0) - (a.lastActiveAt || 0)
    })
  }, [conversations, activeConversationId])

  const handleSwitch = useCallback(
    async (conversationId: string) => {
      try {
        await switchWorkspace(conversationId)
        onConversationSwitch?.(conversationId)
        setOpen(false)
      } catch (error) {
        console.error('[ConversationSwitcher] Failed to switch conversation:', error)
      }
    },
    [switchWorkspace, onConversationSwitch]
  )

  const handleDelete = useCallback(
    async (e: React.MouseEvent, conversationId: string) => {
      e.stopPropagation() // Prevent triggering switch

      if (!confirm(t('session.conversationSwitcher.deleteConfirm'))) {
        return
      }

      try {
        await deleteWorkspace(conversationId)
      } catch (error) {
        console.error('[ConversationSwitcher] Failed to delete conversation:', error)
      }
    },
    [deleteWorkspace]
  )

  const activeConversation = useMemo(() => {
    return conversations.find((w) => w.id === activeConversationId)
  }, [conversations, activeConversationId])

  const displayName = useMemo(() => {
    if (!activeConversation) return t('session.conversationSwitcher.selectConversation')
    return activeConversation.name || activeConversationId?.slice(0, 8) || t('session.conversationSwitcher.unknownConversation')
  }, [activeConversation, activeConversationId, t])

  return (
    <div className="relative">
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        disabled={isLoading || conversations.length === 0}
        className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50 dark:border-border dark:bg-card dark:hover:bg-muted"
      >
        <span className="max-w-[120px] truncate text-secondary dark:text-muted">{displayName}</span>
        {conversations.length > 0 && (
          <span className="text-xs text-tertiary">({conversations.length})</span>
        )}
        <ChevronDown
          className={`h-4 w-4 text-tertiary transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Dropdown menu */}
      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden="true" />

          {/* Menu */}
          <div className="absolute right-0 top-full z-20 mt-1 w-72 rounded-md border bg-white shadow-lg dark:border-border dark:bg-card">
            {/* Header */}
            <div className="border-b border px-3 py-2 dark:border-border">
              <span className="text-xs font-medium text-secondary dark:text-muted">
                {t('session.conversationSwitcher.conversationList', { count: conversations.length })}
              </span>
            </div>

            {/* Conversation list */}
            <div className="custom-scrollbar max-h-80 overflow-y-auto">
              {sortedConversations.length === 0 ? (
                <div className="px-3 py-4 text-center text-xs text-tertiary dark:text-muted">{t('session.conversationSwitcher.noConversations')}</div>
              ) : (
                <ul>
                  {sortedConversations.map((conversation) => {
                    const isActive = conversation.id === activeConversationId
                    const hasPending = conversation.pendingCount > 0

                    return (
                      <li
                        key={conversation.id}
                        className={`flex items-center gap-2 px-3 py-2 hover:bg-muted dark:hover:bg-muted ${
                          isActive ? 'bg-primary-50 dark:bg-primary-950/30' : ''
                        }`}
                      >
                        {/* Conversation selector */}
                        <button
                          type="button"
                          onClick={() => handleSwitch(conversation.id)}
                          className="flex flex-1 items-center gap-2 text-left"
                        >
                          {/* Active indicator */}
                          {isActive && <Check className="h-4 w-4 shrink-0 text-primary-600" />}
                          {!isActive && <span className="h-4 w-4 shrink-0" />}

                          {/* Conversation info */}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="truncate text-xs font-medium text-secondary dark:text-muted">
                                {conversation.name || conversation.id.slice(0, 8)}
                              </span>
                            </div>

                            {/* Status badges */}
                            <div className="mt-0.5 flex items-center gap-2">
                              {/* Pending count */}
                              {hasPending && (
                                <span
                                  className="flex items-center gap-0.5 rounded-full bg-warning-bg px-1.5 text-[10px] text-warning"
                                  title={t('session.conversationSwitcher.pendingSync', { count: conversation.pendingCount })}
                                >
                                  <Clock className="h-2.5 w-2.5" />
                                  {conversation.pendingCount}
                                </span>
                              )}

                              {/* No changes */}
                              {!hasPending && (
                                <span className="text-[10px] text-tertiary">{t('session.conversationSwitcher.noChanges')}</span>
                              )}
                            </div>
                          </div>
                        </button>

                        {/* Delete button */}
                        {showDelete && !isActive && (
                          <button
                            type="button"
                            onClick={(e) => handleDelete(e, conversation.id)}
                            className="shrink-0 rounded p-1 text-tertiary hover:bg-red-50 hover:text-red-500"
                            title={t('session.conversationSwitcher.deleteCache')}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            {/* Footer - Create new conversation */}
            {showCreate && (
              <div className="border-t border p-2">
                <button
                  type="button"
                  className="flex w-full items-center justify-center gap-2 rounded-md px-3 py-2 text-xs font-medium text-secondary hover:bg-muted"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {t('session.conversationSwitcher.newConversation')}
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

/** @deprecated Use ConversationSwitcher */
export const SessionSwitcher = ConversationSwitcher
