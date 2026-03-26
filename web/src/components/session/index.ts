/**
 * Legacy session/workspace component exports.
 *
 * New call sites should import from `@/components/conversation`.
 */

export { ConversationBadge, SessionBadge } from './SessionBadge'
export { ConversationStorageBadge } from './SessionBadgeWithStorage'
export { ConversationSwitcher, SessionSwitcher } from './SessionSwitcher'

export type { ConversationBadgeProps, SessionBadgeProps } from './SessionBadge'
export type { ConversationStorageBadgeProps } from './SessionBadgeWithStorage'
export type { ConversationSwitcherProps, SessionSwitcherProps } from './SessionSwitcher'
