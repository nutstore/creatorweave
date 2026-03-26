/**
 * OPFS Workspace Module
 *
 * Workspace-scoped architecture for browser file system operations.
 * Each workspace has isolated files/ and pending queue.
 *
 * Architecture:
 * - WorkspaceManager: Top-level manager for multiple workspace runtimes
 * - WorkspaceRuntime: Encapsulates single workspace's OPFS operations
 * - WorkspacePendingManager: Per-workspace pending sync queue management
 * - (Undo history is stored in SQLite undo_records table, not OPFS)
 */

export { WorkspaceManager } from './workspace-manager'
export { WorkspaceRuntime } from './workspace-runtime'
export { WorkspacePendingManager } from './workspace-pending'
export type { WorkspaceRuntime as WorkspaceFiles } from './workspace-runtime'

/**
 * Get or create the singleton manager instance (workspace-first).
 */
import { WorkspaceManager as WorkspaceManagerClass } from './workspace-manager'

let workspaceManagerInstance: WorkspaceManagerClass | null = null

export async function getWorkspaceManager(): Promise<WorkspaceManagerClass> {
  if (!workspaceManagerInstance) {
    const manager = new WorkspaceManagerClass()
    await manager.initialize()
    workspaceManagerInstance = manager
  }
  return workspaceManagerInstance
}

/**
 * Reset the workspace manager singleton (useful for testing).
 */
export function resetWorkspaceManager(): void {
  workspaceManagerInstance = null
}
