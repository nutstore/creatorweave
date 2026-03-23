/**
 * OPFS Session Module
 *
 * Multi-session workspace architecture for browser file system operations.
 * Each conversation/session has isolated files/ and pending queue.
 *
 * Architecture:
 * - SessionManager: Top-level manager for multiple session workspaces
 * - SessionWorkspace: Encapsulates single session's OPFS operations
 * - SessionPendingManager: Per-session pending sync queue management
 * - (Undo history is stored in SQLite undo_records table, not OPFS)
 */

export { SessionManager } from './session-manager'
export { SessionWorkspace } from './session-workspace'
export { SessionPendingManager } from './session-pending'

/**
 * Get or create the singleton SessionManager instance
 */
import { SessionManager as SessionManagerClass } from './session-manager'

let sessionManagerInstance: SessionManagerClass | null = null

export async function getSessionManager(): Promise<SessionManagerClass> {
  if (!sessionManagerInstance) {
    const manager = new SessionManagerClass()
    await manager.initialize()
    sessionManagerInstance = manager
  }
  return sessionManagerInstance
}

/**
 * Reset the session manager singleton (useful for testing)
 */
export function resetSessionManager(): void {
  sessionManagerInstance = null
}
