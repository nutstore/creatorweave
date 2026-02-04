/**
 * Session Repository
 *
 * SQLite-based storage for OPFS session metadata
 * (Actual file content still stored in OPFS directories)
 */

import {
  getSQLiteDB,
  type SessionRow,
  type FileMetadataRow,
  type PendingChangeRow,
  type UndoRecordRow,
} from '../sqlite-database'

export interface Session {
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
  sessionId: string
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
  sessionId: string
  path: string
  type: 'create' | 'modify' | 'delete'
  fsMtime: number
  agentMessageId?: string
  timestamp: number
}

export interface UndoRecord {
  id: string
  sessionId: string
  path: string
  type: 'create' | 'modify' | 'delete'
  oldContentPath?: string
  newContentPath?: string
  timestamp: number
  undone: boolean
}

export interface SessionStats {
  sessionId: string
  fileCount: number
  totalFileSize: number
  pendingCount: number
  undoCount: number
}

//=============================================================================
// Session Repository
//=============================================================================

export class SessionRepository {
  //===========================================================================
  // Session Operations
  //===========================================================================

  /**
   * Get all sessions
   */
  async findAllSessions(): Promise<Session[]> {
    const db = getSQLiteDB()
    const rows = await db.queryAll<SessionRow>(
      'SELECT * FROM sessions ORDER BY last_accessed_at DESC'
    )
    return rows.map((row) => this.rowToSession(row))
  }

  /**
   * Find session by ID
   */
  async findSessionById(id: string): Promise<Session | null> {
    const db = getSQLiteDB()
    const row = await db.queryFirst<SessionRow>('SELECT * FROM sessions WHERE id = ?', [id])
    return row ? this.rowToSession(row) : null
  }

  /**
   * Find session by root directory
   */
  async findSessionByRootDirectory(rootDirectory: string): Promise<Session | null> {
    const db = getSQLiteDB()
    const row = await db.queryFirst<SessionRow>('SELECT * FROM sessions WHERE root_directory = ?', [
      rootDirectory,
    ])
    return row ? this.rowToSession(row) : null
  }

  /**
   * Get active session
   */
  async findActiveSession(): Promise<Session | null> {
    const db = getSQLiteDB()
    const row = await db.queryFirst<SessionRow>(
      `SELECT s.* FROM sessions s
       JOIN active_session a ON s.id = a.session_id
       WHERE s.status = 'active'`
    )
    return row ? this.rowToSession(row) : null
  }

  /**
   * Create a new session
   */
  async createSession(session: Omit<Session, 'createdAt' | 'lastAccessedAt'>): Promise<void> {
    const db = getSQLiteDB()
    const now = Date.now()
    const newSession: Session = {
      ...session,
      createdAt: now,
      lastAccessedAt: now,
    }

    await db.execute(
      `INSERT INTO sessions (id, root_directory, name, status, cache_size, pending_count, undo_count, modified_files, created_at, last_accessed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newSession.id,
        newSession.rootDirectory,
        newSession.name,
        newSession.status,
        newSession.cacheSize,
        newSession.pendingCount,
        newSession.undoCount,
        newSession.modifiedFiles,
        newSession.createdAt,
        newSession.lastAccessedAt,
      ]
    )
  }

  /**
   * Update session
   */
  async updateSession(session: Session): Promise<void> {
    const db = getSQLiteDB()
    await db.execute(
      `UPDATE sessions
       SET root_directory = ?, name = ?, status = ?, cache_size = ?, pending_count = ?,
           undo_count = ?, modified_files = ?, last_accessed_at = ?
       WHERE id = ?`,
      [
        session.rootDirectory,
        session.name,
        session.status,
        session.cacheSize,
        session.pendingCount,
        session.undoCount,
        session.modifiedFiles,
        session.lastAccessedAt,
        session.id,
      ]
    )
  }

  /**
   * Update session name
   */
  async updateSessionName(id: string, name: string): Promise<void> {
    const db = getSQLiteDB()
    await db.execute('UPDATE sessions SET name = ? WHERE id = ?', [name, id])
  }

  /**
   * Update session root directory
   */
  async updateSessionRootDirectory(id: string, rootDirectory: string): Promise<void> {
    const db = getSQLiteDB()
    await db.execute('UPDATE sessions SET root_directory = ? WHERE id = ?', [rootDirectory, id])
  }

  /**
   * Update session status
   */
  async updateSessionStatus(id: string, status: 'active' | 'archived'): Promise<void> {
    const db = getSQLiteDB()
    await db.execute('UPDATE sessions SET status = ? WHERE id = ?', [status, id])
  }

  /**
   * Update session access time
   */
  async updateSessionAccessTime(id: string): Promise<void> {
    const db = getSQLiteDB()
    await db.execute('UPDATE sessions SET last_accessed_at = ? WHERE id = ?', [Date.now(), id])
  }

  /**
   * Set active session
   */
  async setActiveSession(sessionId: string): Promise<void> {
    const db = getSQLiteDB()
    await db.execute(
      `INSERT INTO active_session (singleton_id, session_id, last_modified)
       VALUES (0, ?, ?)
       ON CONFLICT(singleton_id) DO UPDATE SET session_id = excluded.session_id, last_modified = excluded.last_modified`,
      [sessionId, Date.now()]
    )
  }

  /**
   * Clear active session
   */
  async clearActiveSession(): Promise<void> {
    const db = getSQLiteDB()
    await db.execute('DELETE FROM active_session WHERE singleton_id = 0')
  }

  /**
   * Delete session
   */
  async deleteSession(id: string): Promise<void> {
    const db = getSQLiteDB()
    // Cascade delete will handle related records
    await db.execute('DELETE FROM sessions WHERE id = ?', [id])
    // Also clear active session if this was the active one
    await db.execute('DELETE FROM active_session WHERE session_id = ?', [id])
  }

  /**
   * Get session count
   */
  async getSessionCount(): Promise<number> {
    const db = getSQLiteDB()
    const row = await db.queryFirst<{ count: number }>('SELECT COUNT(*) as count FROM sessions')
    return row?.count || 0
  }

  /**
   * Get session stats
   */
  async getSessionStats(sessionId: string): Promise<SessionStats | null> {
    const db = getSQLiteDB()

    const fileCountRow = await db.queryFirst<{ count: number }>(
      'SELECT COUNT(*) as count FROM file_metadata WHERE session_id = ?',
      [sessionId]
    )
    const fileSizeRow = await db.queryFirst<{ total: number }>(
      'SELECT SUM(size) as total FROM file_metadata WHERE session_id = ?',
      [sessionId]
    )
    const pendingRow = await db.queryFirst<{ count: number }>(
      'SELECT COUNT(*) as count FROM pending_changes WHERE session_id = ?',
      [sessionId]
    )
    const undoRow = await db.queryFirst<{ count: number }>(
      'SELECT COUNT(*) as count FROM undo_records WHERE session_id = ? AND undone = 0',
      [sessionId]
    )

    if (!fileCountRow) return null

    return {
      sessionId,
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
   * Get all file metadata for a session
   */
  async findFileMetadataBySession(sessionId: string): Promise<FileMetadata[]> {
    const db = getSQLiteDB()
    const rows = await db.queryAll<FileMetadataRow>(
      'SELECT * FROM file_metadata WHERE session_id = ? ORDER BY path',
      [sessionId]
    )
    return rows.map((row) => this.rowToFileMetadata(row))
  }

  /**
   * Find file metadata by path
   */
  async findFileMetadata(sessionId: string, path: string): Promise<FileMetadata | null> {
    const db = getSQLiteDB()
    const row = await db.queryFirst<FileMetadataRow>(
      'SELECT * FROM file_metadata WHERE session_id = ? AND path = ?',
      [sessionId, path]
    )
    return row ? this.rowToFileMetadata(row) : null
  }

  /**
   * Save file metadata
   */
  async saveFileMetadata(metadata: FileMetadata): Promise<void> {
    const db = getSQLiteDB()
    await db.execute(
      `INSERT INTO file_metadata (id, session_id, path, mtime, size, content_type, hash, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(session_id, path) DO UPDATE SET
         mtime = excluded.mtime,
         size = excluded.size,
         content_type = excluded.content_type,
         hash = excluded.hash,
         updated_at = excluded.updated_at`,
      [
        metadata.id,
        metadata.sessionId,
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
  async deleteFileMetadata(sessionId: string, path: string): Promise<void> {
    const db = getSQLiteDB()
    await db.execute('DELETE FROM file_metadata WHERE session_id = ? AND path = ?', [
      sessionId,
      path,
    ])
  }

  /**
   * Delete all file metadata for a session
   */
  async deleteAllFileMetadata(sessionId: string): Promise<void> {
    const db = getSQLiteDB()
    await db.execute('DELETE FROM file_metadata WHERE session_id = ?', [sessionId])
  }

  //===========================================================================
  // Pending Changes Operations
  //===========================================================================

  /**
   * Get all pending changes for a session
   */
  async findPendingChangesBySession(sessionId: string): Promise<PendingChange[]> {
    const db = getSQLiteDB()
    const rows = await db.queryAll<PendingChangeRow>(
      'SELECT * FROM pending_changes WHERE session_id = ? ORDER BY timestamp',
      [sessionId]
    )
    return rows.map((row) => this.rowToPendingChange(row))
  }

  /**
   * Save pending change
   */
  async savePendingChange(change: PendingChange): Promise<void> {
    const db = getSQLiteDB()
    await db.execute(
      `INSERT INTO pending_changes (id, session_id, path, type, fs_mtime, agent_message_id, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         path = excluded.path,
         type = excluded.type,
         fs_mtime = excluded.fs_mtime,
         agent_message_id = excluded.agent_message_id,
         timestamp = excluded.timestamp`,
      [
        change.id,
        change.sessionId,
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
   * Delete all pending changes for a session
   */
  async deleteAllPendingChanges(sessionId: string): Promise<void> {
    const db = getSQLiteDB()
    await db.execute('DELETE FROM pending_changes WHERE session_id = ?', [sessionId])
  }

  //===========================================================================
  // Undo Records Operations
  //===========================================================================

  /**
   * Get all undo records for a session
   */
  async findUndoRecordsBySession(
    sessionId: string,
    includeUndone: boolean = false
  ): Promise<UndoRecord[]> {
    const db = getSQLiteDB()
    const sql = includeUndone
      ? 'SELECT * FROM undo_records WHERE session_id = ? ORDER BY timestamp DESC'
      : 'SELECT * FROM undo_records WHERE session_id = ? AND undone = 0 ORDER BY timestamp DESC'
    const rows = await db.queryAll<UndoRecordRow>(sql, [sessionId])
    return rows.map((row) => this.rowToUndoRecord(row))
  }

  /**
   * Save undo record
   */
  async saveUndoRecord(record: UndoRecord): Promise<void> {
    const db = getSQLiteDB()
    await db.execute(
      `INSERT INTO undo_records (id, session_id, path, type, old_content_path, new_content_path, timestamp, undone)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         path = excluded.path,
         type = excluded.type,
         old_content_path = excluded.old_content_path,
         new_content_path = excluded.new_content_path,
         undone = excluded.undone`,
      [
        record.id,
        record.sessionId,
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
   * Delete all undo records for a session
   */
  async deleteAllUndoRecords(sessionId: string): Promise<void> {
    const db = getSQLiteDB()
    await db.execute('DELETE FROM undo_records WHERE session_id = ?', [sessionId])
  }

  //===========================================================================
  // Batch Operations for Migration
  //===========================================================================

  /**
   * Get all session stats (for session list display)
   */
  async getAllSessionStats(): Promise<SessionStats[]> {
    const db = getSQLiteDB()
    const rows = await db.queryAll<{
      session_id: string
      file_count: number
      total_file_size: number
      pending_count: number
      undo_count: number
    }>(
      `SELECT
        s.id as session_id,
        COUNT(DISTINCT f.id) as file_count,
        COALESCE(SUM(f.size), 0) as total_file_size,
        s.pending_count as pending_count,
        s.undo_count as undo_count
       FROM sessions s
       LEFT JOIN file_metadata f ON f.session_id = s.id
       GROUP BY s.id
       ORDER BY s.last_accessed_at DESC`
    )
    return rows.map((row) => ({
      sessionId: row.session_id,
      fileCount: row.file_count,
      totalFileSize: row.total_file_size,
      pendingCount: row.pending_count,
      undoCount: row.undo_count,
    }))
  }

  /**
   * Find active sessions
   */
  async findActiveSessions(): Promise<Session[]> {
    const db = getSQLiteDB()
    const rows = await db.queryAll<SessionRow>(
      "SELECT * FROM sessions WHERE status = 'active' ORDER BY last_accessed_at DESC"
    )
    return rows.map((row) => this.rowToSession(row))
  }

  /**
   * Find inactive sessions (not accessed for specified days)
   */
  async findInactiveSessions(days: number): Promise<Session[]> {
    const db = getSQLiteDB()
    const cutoffTime = Date.now() - days * 24 * 60 * 60 * 1000
    const rows = await db.queryAll<SessionRow>(
      'SELECT * FROM sessions WHERE last_accessed_at < ? ORDER BY last_accessed_at ASC',
      [cutoffTime]
    )
    return rows.map((row) => this.rowToSession(row))
  }

  /**
   * Batch update session stats (for synchronization)
   */
  async updateSessionStats(
    sessionId: string,
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

    values.push(sessionId)
    await db.execute(`UPDATE sessions SET ${updates.join(', ')} WHERE id = ?`, values)
  }

  /**
   * Archive old sessions (mark as archived instead of deleting)
   */
  async archiveInactiveSessions(days: number): Promise<number> {
    const db = getSQLiteDB()
    const cutoffTime = Date.now() - days * 24 * 60 * 60 * 1000
    await db.execute(
      "UPDATE sessions SET status = 'archived' WHERE last_accessed_at < ? AND status = 'active'",
      [cutoffTime]
    )
    // Query to get count of affected rows
    const countRow = await db.queryFirst<{ count: number }>('SELECT changes() as count')
    return countRow?.count || 0
  }

  //===========================================================================
  // Helpers
  //===========================================================================

  private rowToSession(row: SessionRow): Session {
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
      sessionId: row.session_id,
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
      sessionId: row.session_id,
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
      sessionId: row.session_id,
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

let sessionRepoInstance: SessionRepository | null = null

export function getSessionRepository(): SessionRepository {
  if (!sessionRepoInstance) {
    sessionRepoInstance = new SessionRepository()
  }
  return sessionRepoInstance
}
