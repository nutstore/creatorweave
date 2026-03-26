/**
 * Conversation components exports (naming migration layer)
 *
 * Re-exports legacy session/workspace components with conversation-first names.
 */

export { ConversationBadge } from '@/components/session/SessionBadge'
export { ConversationStorageBadge } from '@/components/session/SessionBadgeWithStorage'
export { ConversationSwitcher } from '@/components/session/SessionSwitcher'

export type { ConversationBadgeProps } from '@/components/session/SessionBadge'
export type { ConversationStorageBadgeProps } from '@/components/session/SessionBadgeWithStorage'
export type { ConversationSwitcherProps } from '@/components/session/SessionSwitcher'
