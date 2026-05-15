/**
 * ConversationActionContext — provides conversation action callbacks
 * to deeply nested components without prop drilling.
 *
 * Currently exposes:
 * - setInput: set the conversation input text (for "follow up" from selection)
 */

import { createContext, useContext } from 'react'

export interface ConversationActionContextValue {
  /** Set the conversation input text */
  setInput: (text: string) => void
}

export const ConversationActionContext = createContext<ConversationActionContextValue | null>(null)

/**
 * Hook to access conversation actions from context.
 * Throws if used outside of ConversationActionContext.Provider.
 */
export function useConversationActions(): ConversationActionContextValue {
  const ctx = useContext(ConversationActionContext)
  if (!ctx) {
    throw new Error('useConversationActions must be used within ConversationActionContext.Provider')
  }
  return ctx
}
