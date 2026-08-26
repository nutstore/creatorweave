/**
 * Conversation Context Store (naming migration layer)
 *
 * Canonical naming for local runtime file-context is "workspace".
 * This module keeps conversation aliases for compatibility.
 */

import type { WorkspaceFiles } from '@/opfs'
import {
  getActiveWorkspace,
  useWorkspaceStore,
  type WorkspaceState,
  type WorkspaceWithStats,
} from './workspace.store'

export type ConversationContextState = WorkspaceState
export type ConversationWithStats = WorkspaceWithStats

/**
 * Compatibility alias for conversation-oriented callsites.
 */
export const useConversationContextStore = useWorkspaceStore

/**
 * Compatibility alias for the active runtime file context getter.
 */
export async function getActiveConversation(): Promise<
  { conversation: WorkspaceFiles; conversationId: string } | undefined
> {
  const active = await getActiveWorkspace()
  if (!active) return undefined
  return {
    conversation: active.workspace,
    conversationId: active.workspaceId,
  }
}
