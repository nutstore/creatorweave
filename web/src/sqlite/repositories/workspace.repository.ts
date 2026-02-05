/**
 * Workspace Repository
 *
 * SQLite-based storage for OPFS workspace metadata
 * (Actual file content still stored in OPFS directories)
 */

import {
  getSQLiteDB,
  type WorkspaceRow,
  type FileMetadataRow,
  type PendingChangeRow,
  type UndoRecordRow,
} from '../sqlite-database'

export interface Workspace {
  id: string
  rootDirectory: string
  name: string
  status: 'active' | 'archived'
  cacheSize: number
  pendingCount: number
  undoCount: number
  modifiedFiles: number
  createdAt: number
  lastAccessedAt: number
}

export interface FileMetadata {
  id: string
  workspaceId: string
  path: string
  mtime: number
  size: number
  contentType: 'text' | 'binary'
  hash?: string
  createdAt: number
  updatedAt: number
}

export interface PendingChange {
  id: string
  workspaceId: string
  path: string
  type: 'create' | 'modify' | 'delete'
  fsMtime: number
  agentMessageId?: string
  timestamp: number
}

export interface UndoRecord {
  id: string
  workspaceId: string
  path: string
  type: 'create' | 'modify' | 'delete'
  oldContentPath?: string
  newContentPath?: string
  timestamp: number
  undone: boolean
}

export interface WorkspaceStats {
  workspaceId: string
  fileCount: number
  totalFileSize: number
  pendingCount: number
  undoCount: number
}

//=============================================================================
// Workspace Repository
//=============================================================================

export class WorkspaceRepository {
  //===========================================================================
  // Workspace Operations
  //===========================================================================

  /**
   * Get all workspaces
   */
  async findAllWorkspaces(): Promise<Workspace[]> {
    const db = getSQLiteDB()
    const rows = await db.queryAll<WorkspaceRow>(
      'SELECT * FROM workspaces ORDER BY last_accessed_at DESC'
    )
    return rows.map((row) => this.rowToWorkspace(row))
  }

  /**
   * Find workspace by ID
   */
  async findWorkspaceById(id: string): Promise<Workspace | null> {
    const db = getSQLiteDB()
    const row = await db.queryFirst<WorkspaceRow>('SELECT * FROM workspaces WHERE id = ?', [id])
    return row ? this.rowToWorkspace(row) : null
  }

  /**
   * Find workspace by root directory
   */
  async findWorkspaceByRootDirectory(rootDirectory: string): Promise<Workspace | null> {
    const db = getSQLiteDB()
    const row = await db.queryFirst<WorkspaceRow>(
      'SELECT * FROM workspaces WHERE root_directory = ?',
      [rootDirectory]
    )
    return row ? this.rowToWorkspace(row) : null
  }

  /**
   * Get active workspace
   */
  async findActiveWorkspace(): Promise<Workspace | null> {
    const db = getSQLiteDB()
    const row = await db.queryFirst<WorkspaceRow>(
      `SELECT w.* FROM workspaces w
       JOIN active_workspace a ON w.id = a.workspace_id
       WHERE w.status = 'active'`
    )
    return row ? this.rowToWorkspace(row) : null
  }

  /**
   * Create a new workspace
   */
  async createWorkspace(workspace: Omit<Workspace, 'createdAt' | 'lastAccessedAt'>): Promise<void> {
    const db = getSQLiteDB()
    const now = Date.now()
    const newWorkspace: Workspace = {
      ...workspace,
      createdAt: now,
      lastAccessedAt: now,
    }

    await db.execute(
      `INSERT INTO workspaces (id, root_directory, name, status, cache_size, pending_count, undo_count, modified_files, created_at, last_accessed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newWorkspace.id,
        newWorkspace.rootDirectory,
        newWorkspace.name,
        newWorkspace.status,
        newWorkspace.cacheSize,
        newWorkspace.pendingCount,
        newWorkspace.undoCount,
        newWorkspace.modifiedFiles,
        newWorkspace.createdAt,
        newWorkspace.lastAccessedAt,
      ]
    )
  }

  /**
   * Update workspace
   */
  async updateWorkspace(workspace: Workspace): Promise<void> {
    const db = getSQLiteDB()
    await db.execute(
      `UPDATE workspaces
       SET root_directory = ?, name = ?, status = ?, cache_size = ?, pending_count = ?,
           undo_count = ?, modified_files = ?, last_accessed_at = ?
       WHERE id = ?`,
      [
        workspace.rootDirectory,
        workspace.name,
        workspace.status,
        workspace.cacheSize,
        workspace.pendingCount,
        workspace.undoCount,
        workspace.modifiedFiles,
        workspace.lastAccessedAt,
        workspace.id,
      ]
    )
  }

  /**
   * Update workspace name
   */
  async updateWorkspaceName(id: string, name: string): Promise<void> {
    const db = getSQLiteDB()
    await db.execute('UPDATE workspaces SET name = ? WHERE id = ?', [name, id])
  }

  /**
   * Update workspace root directory
   */
  async updateWorkspaceRootDirectory(id: string, rootDirectory: string): Promise<void> {
    const db = getSQLiteDB()
    await db.execute('UPDATE workspaces SET root_directory = ? WHERE id = ?', [rootDirectory, id])
  }

  /**
   * Update workspace status
   */
  async updateWorkspaceStatus(id: string, status: 'active' | 'archived'): Promise<void> {
    const db = getSQLiteDB()
    await db.execute('UPDATE workspaces SET status = ? WHERE id = ?', [status, id])
  }

  /**
   * Update workspace access time
   */
  async updateWorkspaceAccessTime(id: string): Promise<void> {
    const db = getSQLiteDB()
    await db.execute('UPDATE workspaces SET last_accessed_at = ? WHERE id = ?', [Date.now(), id])
  }

  /**
   * Set active workspace
   */
  async setActiveWorkspace(workspaceId: string): Promise<void> {
    const db = getSQLiteDB()
    await db.execute(
      `INSERT INTO active_workspace (singleton_id, workspace_id, last_modified)
       VALUES (0, ?, ?)
       ON CONFLICT(singleton_id) DO UPDATE SET workspace_id = excluded.workspace_id, last_modified = excluded.last_modified`,
      [workspaceId, Date.now()]
    )
  }

  /**
   * Clear active workspace
   */
  async clearActiveWorkspace(): Promise<void> {
    const db = getSQLiteDB()
    await db.execute('DELETE FROM active_workspace WHERE singleton_id = 0')
  }

  /**
   * Delete workspace
   */
  async deleteWorkspace(id: string): Promise<void> {
    const db = getSQLiteDB()
    // Cascade delete will handle related records
    await db.execute('DELETE FROM workspaces WHERE id = ?', [id])
    // Also clear active workspace if this was the active one
    await db.execute('DELETE FROM active_workspace WHERE workspace_id = ?', [id])
  }

  /**
   * Get workspace count
   */
  async getWorkspaceCount(): Promise<number> {
    const db = getSQLiteDB()
    const row = await db.queryFirst<{ count: number }>('SELECT COUNT(*) as count FROM workspaces')
    return row?.count || 0
  }

  /**
   * Get workspace stats
   */
  async getWorkspaceStats(workspaceId: string): Promise<WorkspaceStats | null> {
    const db = getSQLiteDB()

    const fileCountRow = await db.queryFirst<{ count: number }>(
      'SELECT COUNT(*) as count FROM file_metadata WHERE workspace_id = ?',
      [workspaceId]
    )
    const fileSizeRow = await db.queryFirst<{ total: number }>(
      'SELECT SUM(size) as total FROM file_metadata WHERE workspace_id = ?',
      [workspaceId]
    )
    const pendingRow = await db.queryFirst<{ count: number }>(
      'SELECT COUNT(*) as count FROM pending_changes WHERE workspace_id = ?',
      [workspaceId]
    )
    const undoRow = await db.queryFirst<{ count: number }>(
      'SELECT COUNT(*) as count FROM undo_records WHERE workspace_id = ? AND undone = 0',
      [workspaceId]
    )

    if (!fileCountRow) return null

    return {
      workspaceId,
      fileCount: fileCountRow.count,
      totalFileSize: fileSizeRow?.total || 0,
      pendingCount: pendingRow?.count || 0,
      undoCount: undoRow?.count || 0,
    }
  }

  //===========================================================================
  // File Metadata Operations
  //===========================================================================

  /**
   * Get all file metadata for a workspace
   */
  async findFileMetadataByWorkspace(workspaceId: string): Promise<FileMetadata[]> {
    const db = getSQLiteDB()
    const rows = await db.queryAll<FileMetadataRow>(
      'SELECT * FROM file_metadata WHERE workspace_id = ? ORDER BY path',
      [workspaceId]
    )
    return rows.map((row) => this.rowToFileMetadata(row))
  }

  /**
   * Find file metadata by path
   */
  async findFileMetadata(workspaceId: string, path: string): Promise<FileMetadata | null> {
    const db = getSQLiteDB()
    const row = await db.queryFirst<FileMetadataRow>(
      'SELECT * FROM file_metadata WHERE workspace_id = ? AND path = ?',
      [workspaceId, path]
    )
    return row ? this.rowToFileMetadata(row) : null
  }

  /**
   * Save file metadata
   */
  async saveFileMetadata(metadata: FileMetadata): Promise<void> {
    const db = getSQLiteDB()
    await db.execute(
      `INSERT INTO file_metadata (id, workspace_id, path, mtime, size, content_type, hash, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(workspace_id, path) DO UPDATE SET
         mtime = excluded.mtime,
         size = excluded.size,
         content_type = excluded.content_type,
         hash = excluded.hash,
         updated_at = excluded.updated_at`,
      [
        metadata.id,
        metadata.workspaceId,
        metadata.path,
        metadata.mtime,
        metadata.size,
        metadata.contentType,
        metadata.hash || null,
        metadata.createdAt,
        metadata.updatedAt,
      ]
    )
  }

  /**
   * Delete file metadata
   */
  async deleteFileMetadata(workspaceId: string, path: string): Promise<void> {
    const db = getSQLiteDB()
    await db.execute('DELETE FROM file_metadata WHERE workspace_id = ? AND path = ?', [
      workspaceId,
      path,
    ])
  }

  /**
   * Delete all file metadata for a workspace
   */
  async deleteAllFileMetadata(workspaceId: string): Promise<void> {
    const db = getSQLiteDB()
    await db.execute('DELETE FROM file_metadata WHERE workspace_id = ?', [workspaceId])
  }

  //===========================================================================
  // Pending Changes Operations
  //===========================================================================

  /**
   * Get all pending changes for a workspace
   */
  async findPendingChangesByWorkspace(workspaceId: string): Promise<PendingChange[]> {
    const db = getSQLiteDB()
    const rows = await db.queryAll<PendingChangeRow>(
      'SELECT * FROM pending_changes WHERE workspace_id = ? ORDER BY timestamp',
      [workspaceId]
    )
    return rows.map((row) => this.rowToPendingChange(row))
  }

  /**
   * Save pending change
   */
  async savePendingChange(change: PendingChange): Promise<void> {
    const db = getSQLiteDB()
    await db.execute(
      `INSERT INTO pending_changes (id, workspace_id, path, type, fs_mtime, agent_message_id, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         path = excluded.path,
         type = excluded.type,
         fs_mtime = excluded.fs_mtime,
         agent_message_id = excluded.agent_message_id,
         timestamp = excluded.timestamp`,
      [
        change.id,
        change.workspaceId,
        change.path,
        change.type,
        change.fsMtime,
        change.agentMessageId || null,
        change.timestamp,
      ]
    )
  }

  /**
   * Delete pending change
   */
  async deletePendingChange(id: string): Promise<void> {
    const db = getSQLiteDB()
    await db.execute('DELETE FROM pending_changes WHERE id = ?', [id])
  }

  /**
   * Delete all pending changes for a workspace
   */
  async deleteAllPendingChanges(workspaceId: string): Promise<void> {
    const db = getSQLiteDB()
    await db.execute('DELETE FROM pending_changes WHERE workspace_id = ?', [workspaceId])
  }

  //===========================================================================
  // Undo Records Operations
  //===========================================================================

  /**
   * Get all undo records for a workspace
   */
  async findUndoRecordsByWorkspace(
    workspaceId: string,
    includeUndone: boolean = false
  ): Promise<UndoRecord[]> {
    const db = getSQLiteDB()
    const sql = includeUndone
      ? 'SELECT * FROM undo_records WHERE workspace_id = ? ORDER BY timestamp DESC'
      : 'SELECT * FROM undo_records WHERE workspace_id = ? AND undone = 0 ORDER BY timestamp DESC'
    const rows = await db.queryAll<UndoRecordRow>(sql, [workspaceId])
    return rows.map((row) => this.rowToUndoRecord(row))
  }

  /**
   * Save undo record
   */
  async saveUndoRecord(record: UndoRecord): Promise<void> {
    const db = getSQLiteDB()
    await db.execute(
      `INSERT INTO undo_records (id, workspace_id, path, type, old_content_path, new_content_path, timestamp, undone)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         path = excluded.path,
         type = excluded.type,
         old_content_path = excluded.old_content_path,
         new_content_path = excluded.new_content_path,
         undone = excluded.undone`,
      [
        record.id,
        record.workspaceId,
        record.path,
        record.type,
        record.oldContentPath || null,
        record.newContentPath || null,
        record.timestamp,
        record.undone ? 1 : 0,
      ]
    )
  }

  /**
   * Mark undo record as undone
   */
  async markUndoRecordUndone(id: string): Promise<void> {
    const db = getSQLiteDB()
    await db.execute('UPDATE undo_records SET undone = 1 WHERE id = ?', [id])
  }

  /**
   * Delete undo record
   */
  async deleteUndoRecord(id: string): Promise<void> {
    const db = getSQLiteDB()
    await db.execute('DELETE FROM undo_records WHERE id = ?', [id])
  }

  /**
   * Delete all undo records for a workspace
   */
  async deleteAllUndoRecords(workspaceId: string): Promise<void> {
    const db = getSQLiteDB()
    await db.execute('DELETE FROM undo_records WHERE workspace_id = ?', [workspaceId])
  }

  //===========================================================================
  // Batch Operations for Migration
  //===========================================================================

  /**
   * Get all workspace stats (for workspace list display)
   */
  async getAllWorkspaceStats(): Promise<WorkspaceStats[]> {
    const db = getSQLiteDB()
    const rows = await db.queryAll<{
      workspace_id: string
      file_count: number
      total_file_size: number
      pending_count: number
      undo_count: number
    }>(
      `SELECT
        w.id as workspace_id,
        COUNT(DISTINCT f.id) as file_count,
        COALESCE(SUM(f.size), 0) as total_file_size,
        w.pending_count as pending_count,
        w.undo_count as undo_count
       FROM workspaces w
       LEFT JOIN file_metadata f ON f.workspace_id = w.id
       GROUP BY w.id
       ORDER BY w.last_accessed_at DESC`
    )
    return rows.map((row) => ({
      workspaceId: row.workspace_id,
      fileCount: row.file_count,
      totalFileSize: row.total_file_size,
      pendingCount: row.pending_count,
      undoCount: row.undo_count,
    }))
  }

  /**
   * Find active workspaces
   */
  async findActiveWorkspaces(): Promise<Workspace[]> {
    const db = getSQLiteDB()
    const rows = await db.queryAll<WorkspaceRow>(
      "SELECT * FROM workspaces WHERE status = 'active' ORDER BY last_accessed_at DESC"
    )
    return rows.map((row) => this.rowToWorkspace(row))
  }

  /**
   * Find inactive workspaces (not accessed for specified days)
   */
  async findInactiveWorkspaces(days: number): Promise<Workspace[]> {
    const db = getSQLiteDB()
    const cutoffTime = Date.now() - days * 24 * 60 * 60 * 1000
    const rows = await db.queryAll<WorkspaceRow>(
      'SELECT * FROM workspaces WHERE last_accessed_at < ? ORDER BY last_accessed_at ASC',
      [cutoffTime]
    )
    return rows.map((row) => this.rowToWorkspace(row))
  }

  /**
   * Batch update workspace stats (for synchronization)
   */
  async updateWorkspaceStats(
    workspaceId: string,
    stats: {
      cacheSize?: number
      pendingCount?: number
      undoCount?: number
      modifiedFiles?: number
    }
  ): Promise<void> {
    const db = getSQLiteDB()
    const updates: string[] = []
    const values: (number | string)[] = []

    if (stats.cacheSize !== undefined) {
      updates.push('cache_size = ?')
      values.push(stats.cacheSize)
    }
    if (stats.pendingCount !== undefined) {
      updates.push('pending_count = ?')
      values.push(stats.pendingCount)
    }
    if (stats.undoCount !== undefined) {
      updates.push('undo_count = ?')
      values.push(stats.undoCount)
    }
    if (stats.modifiedFiles !== undefined) {
      updates.push('modified_files = ?')
      values.push(stats.modifiedFiles)
    }

    if (updates.length === 0) return

    values.push(workspaceId)
    await db.execute(`UPDATE workspaces SET ${updates.join(', ')} WHERE id = ?`, values)
  }

  /**
   * Archive old workspaces (mark as archived instead of deleting)
   */
  async archiveInactiveWorkspaces(days: number): Promise<number> {
    const db = getSQLiteDB()
    const cutoffTime = Date.now() - days * 24 * 60 * 60 * 1000
    await db.execute(
      "UPDATE workspaces SET status = 'archived' WHERE last_accessed_at < ? AND status = 'active'",
      [cutoffTime]
    )
    // Query to get count of affected rows
    const countRow = await db.queryFirst<{ count: number }>('SELECT changes() as count')
    return countRow?.count || 0
  }

  //===========================================================================
  // Helpers
  //===========================================================================

  private rowToWorkspace(row: WorkspaceRow): Workspace {
    return {
      id: row.id,
      rootDirectory: row.root_directory,
      name: row.name,
      status: row.status,
      cacheSize: row.cache_size,
      pendingCount: row.pending_count,
      undoCount: row.undo_count,
      modifiedFiles: row.modified_files,
      createdAt: row.created_at,
      lastAccessedAt: row.last_accessed_at,
    }
  }

  private rowToFileMetadata(row: FileMetadataRow): FileMetadata {
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      path: row.path,
      mtime: row.mtime,
      size: row.size,
      contentType: row.content_type,
      hash: row.hash || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  private rowToPendingChange(row: PendingChangeRow): PendingChange {
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      path: row.path,
      type: row.type,
      fsMtime: row.fs_mtime,
      agentMessageId: row.agent_message_id || undefined,
      timestamp: row.timestamp,
    }
  }

  private rowToUndoRecord(row: UndoRecordRow): UndoRecord {
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      path: row.path,
      type: row.type,
      oldContentPath: row.old_content_path || undefined,
      newContentPath: row.new_content_path || undefined,
      timestamp: row.timestamp,
      undone: row.undone !== 0,
    }
  }
}

//=============================================================================
// Singleton Instance
//=============================================================================

let workspaceRepoInstance: WorkspaceRepository | null = null

export function getWorkspaceRepository(): WorkspaceRepository {
  if (!workspaceRepoInstance) {
    workspaceRepoInstance = new WorkspaceRepository()
  }
  return workspaceRepoInstance
}
