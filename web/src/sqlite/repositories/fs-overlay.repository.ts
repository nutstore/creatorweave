import { getSQLiteDB } from '../sqlite-database'

type OpType = 'create' | 'modify' | 'delete'
type SyncItemStatus = 'success' | 'failed' | 'skipped'
type BatchStatus = 'running' | 'success' | 'failed' | 'partial'
type ReviewStatus = 'pending' | 'approved' | 'rejected'

export interface PendingOverlayOp {
  id: string
  workspaceId: string
  path: string
  type: OpType
  fsMtime: number
  timestamp: number
  snapshotId?: string
  snapshotStatus?: 'draft' | 'committed' | 'approved' | 'rolled_back'
  snapshotSummary?: string
  reviewStatus?: ReviewStatus
}

export interface OverlayOpRecord {
  id: string
  workspaceId: string
  snapshotId: string | null
  path: string
  type: OpType
  status: 'pending' | 'synced' | 'discarded' | 'failed'
  reviewStatus?: ReviewStatus
  fsMtime: number
  createdAt: number
  updatedAt: number
}

export interface SnapshotRecord {
  id: string
  projectId?: string
  workspaceId: string
  workspaceName?: string
  status: string
  summary: string | null
  source: string
  createdAt: number
  committedAt: number | null
  opCount: number
  isCurrent?: boolean
}

export interface SnapshotFileMetaRecord {
  path: string
  opType: OpType
  createdAt: number
  beforeContentKind: 'text' | 'binary' | 'none'
  beforeContentSize: number
  afterContentKind: 'text' | 'binary' | 'none'
  afterContentSize: number
}

export interface SnapshotFileUpsertInput {
  snapshotId: string
  workspaceId: string
  path: string
  opType: OpType
  beforeContent: string | ArrayBuffer | Uint8Array | null
  afterContent: string | ArrayBuffer | Uint8Array | null
}

export interface SnapshotFileRecord {
  snapshotId: string
  workspaceId: string
  path: string
  opType: OpType
  beforeContentKind: 'text' | 'binary' | 'none'
  beforeContentText: string | null
  beforeContentBlob: Uint8Array | null
  afterContentKind: 'text' | 'binary' | 'none'
  afterContentText: string | null
  afterContentBlob: Uint8Array | null
}

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

export class FSOverlayRepository {
  async listSnapshots(workspaceId: string, limit: number = 20): Promise<SnapshotRecord[]> {
    const db = getSQLiteDB()
    const rows = await db.queryAll<{
      id: string
      workspace_id: string
      status: string
      summary: string | null
      source: string
      created_at: number
      committed_at: number | null
      op_count: number
    }>(
      `SELECT c.id,
              c.workspace_id,
              c.status,
              c.summary,
              c.source,
              c.created_at,
              c.committed_at,
              COUNT(o.id) AS op_count
       FROM fs_changesets c
       LEFT JOIN fs_ops o
         ON o.changeset_id = c.id
        AND o.workspace_id = c.workspace_id
       WHERE c.workspace_id = ?
         AND c.status != 'draft'
       GROUP BY c.id
       ORDER BY COALESCE(c.committed_at, c.created_at) DESC
       LIMIT ?`,
      [workspaceId, limit]
    )

    return rows.map((row) => ({
      id: row.id,
      workspaceId: row.workspace_id,
      status: row.status,
      summary: row.summary,
      source: row.source,
      createdAt: row.created_at,
      committedAt: row.committed_at,
      opCount: Number(row.op_count || 0),
    }))
  }

  async listProjectSnapshots(projectId: string, limit: number = 200): Promise<SnapshotRecord[]> {
    const db = getSQLiteDB()
    const rows = await db.queryAll<{
      id: string
      project_id: string
      workspace_id: string
      workspace_name: string
      status: string
      summary: string | null
      source: string
      created_at: number
      committed_at: number | null
      op_count: number
      is_current: number
    }>(
      `SELECT c.id,
              w.project_id,
              c.workspace_id,
              w.name AS workspace_name,
              c.status,
              c.summary,
              c.source,
              c.created_at,
              c.committed_at,
              COUNT(o.id) AS op_count,
              CASE WHEN w.current_snapshot_id = c.id THEN 1 ELSE 0 END AS is_current
       FROM fs_changesets c
       JOIN workspaces w ON w.id = c.workspace_id
       LEFT JOIN fs_ops o
         ON o.changeset_id = c.id
        AND o.workspace_id = c.workspace_id
       WHERE w.project_id = ?
         AND c.status != 'draft'
       GROUP BY c.id
       ORDER BY COALESCE(c.committed_at, c.created_at) DESC
       LIMIT ?`,
      [projectId, limit]
    )

    return rows.map((row) => ({
      id: row.id,
      projectId: row.project_id,
      workspaceId: row.workspace_id,
      workspaceName: row.workspace_name,
      status: row.status,
      summary: row.summary,
      source: row.source,
      createdAt: row.created_at,
      committedAt: row.committed_at,
      opCount: Number(row.op_count || 0),
      isCurrent: row.is_current === 1,
    }))
  }

  async getOrCreateDraftChangeset(workspaceId: string, source: string = 'tool'): Promise<string> {
    const db = getSQLiteDB()
    const existing = await db.queryFirst<{ id: string }>(
      `SELECT id
       FROM fs_changesets
       WHERE workspace_id = ? AND status = 'draft'
       ORDER BY created_at DESC
       LIMIT 1`,
      [workspaceId]
    )
    if (existing?.id) return existing.id

    const id = generateId('changeset')
    await db.execute(
      `INSERT INTO fs_changesets (id, workspace_id, source, status, created_at)
       VALUES (?, ?, ?, 'draft', ?)`,
      [id, workspaceId, source, Date.now()]
    )
    return id
  }

  async commitLatestDraftSnapshot(
    workspaceId: string,
    summary?: string
  ): Promise<{ snapshotId: string; opCount: number } | null> {
    const db = getSQLiteDB()
    const row = await db.queryFirst<{ id: string; op_count: number }>(
      `SELECT c.id as id, COUNT(o.id) as op_count
       FROM fs_changesets c
       LEFT JOIN fs_ops o
         ON o.changeset_id = c.id
        AND o.workspace_id = c.workspace_id
        AND o.status IN ('pending', 'failed')
       WHERE c.workspace_id = ? AND c.status = 'draft'
       GROUP BY c.id
       ORDER BY c.created_at DESC
       LIMIT 1`,
      [workspaceId]
    )

    if (!row?.id) return null
    const now = Date.now()
    await db.execute(
      `UPDATE fs_changesets
       SET status = 'committed',
           summary = COALESCE(?, summary),
           committed_at = ?
       WHERE id = ?`,
      [summary || null, now, row.id]
    )

    return { snapshotId: row.id, opCount: Number(row.op_count || 0) }
  }

  async listSnapshotPendingOps(
    workspaceId: string,
    snapshotId: string
  ): Promise<OverlayOpRecord[]> {
    const db = getSQLiteDB()
    const rows = await db.queryAll<{
      id: string
      workspace_id: string
      changeset_id: string | null
      path: string
      op_type: OpType
      status: 'pending' | 'synced' | 'discarded' | 'failed'
      review_status: ReviewStatus | null
      fs_mtime: number
      created_at: number
      updated_at: number
    }>(
      `SELECT id, workspace_id, changeset_id, path, op_type, status, review_status, fs_mtime, created_at, updated_at
       FROM fs_ops
       WHERE workspace_id = ?
         AND changeset_id = ?
         AND status IN ('pending', 'failed')
       ORDER BY updated_at DESC`,
      [workspaceId, snapshotId]
    )

    return rows.map((row) => ({
      id: row.id,
      workspaceId: row.workspace_id,
      snapshotId: row.changeset_id,
      path: row.path,
      type: row.op_type,
      status: row.status,
      reviewStatus: row.review_status || undefined,
      fsMtime: row.fs_mtime,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }))
  }

  async listSnapshotOps(workspaceId: string, snapshotId: string): Promise<OverlayOpRecord[]> {
    const db = getSQLiteDB()
    const rows = await db.queryAll<{
      id: string
      workspace_id: string
      changeset_id: string | null
      path: string
      op_type: OpType
      status: 'pending' | 'synced' | 'discarded' | 'failed'
      review_status: ReviewStatus | null
      fs_mtime: number
      created_at: number
      updated_at: number
    }>(
      `SELECT id, workspace_id, changeset_id, path, op_type, status, review_status, fs_mtime, created_at, updated_at
       FROM fs_ops
       WHERE workspace_id = ?
         AND changeset_id = ?
       ORDER BY updated_at DESC`,
      [workspaceId, snapshotId]
    )

    return rows.map((row) => ({
      id: row.id,
      workspaceId: row.workspace_id,
      snapshotId: row.changeset_id,
      path: row.path,
      type: row.op_type,
      status: row.status,
      reviewStatus: row.review_status || undefined,
      fsMtime: row.fs_mtime,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }))
  }

  async listSnapshotFiles(snapshotId: string): Promise<SnapshotFileMetaRecord[]> {
    const db = getSQLiteDB()
    const rows = await db.queryAll<{
      path: string
      op_type: OpType
      created_at: number
      before_content_kind: 'text' | 'binary' | 'none'
      before_content_size: number
      after_content_kind: 'text' | 'binary' | 'none'
      after_content_size: number
    }>(
      `SELECT path,
              op_type,
              created_at,
              before_content_kind,
              CASE
                WHEN before_content_kind = 'binary' THEN COALESCE(length(before_content_blob), 0)
                WHEN before_content_kind = 'text' THEN COALESCE(length(before_content_text), 0)
                ELSE 0
              END AS before_content_size,
              after_content_kind,
              CASE
                WHEN after_content_kind = 'binary' THEN COALESCE(length(after_content_blob), 0)
                WHEN after_content_kind = 'text' THEN COALESCE(length(after_content_text), 0)
                ELSE 0
              END AS after_content_size
       FROM fs_snapshot_files
       WHERE snapshot_id = ?
       ORDER BY path ASC`,
      [snapshotId]
    )

    return rows.map((row) => ({
      path: row.path,
      opType: row.op_type,
      createdAt: row.created_at,
      beforeContentKind: row.before_content_kind,
      beforeContentSize: Number(row.before_content_size || 0),
      afterContentKind: row.after_content_kind,
      afterContentSize: Number(row.after_content_size || 0),
    }))
  }

  async listPendingOps(workspaceId: string): Promise<PendingOverlayOp[]> {
    const db = getSQLiteDB()
    const rows = await db.queryAll<{
      id: string
      workspace_id: string
      changeset_id: string | null
      path: string
      op_type: OpType
      fs_mtime: number
      updated_at: number
      snapshot_status: 'draft' | 'committed' | 'approved' | 'rolled_back' | null
      snapshot_summary: string | null
      review_status: ReviewStatus | null
    }>(
      `SELECT o.id,
              o.workspace_id,
              o.changeset_id,
              o.path,
              o.op_type,
              o.fs_mtime,
              o.updated_at,
              o.review_status,
              c.status AS snapshot_status,
              c.summary AS snapshot_summary
       FROM fs_ops o
       LEFT JOIN fs_changesets c ON c.id = o.changeset_id
       WHERE o.workspace_id = ? AND o.status = 'pending'
       ORDER BY updated_at ASC`,
      [workspaceId]
    )
    return rows.map((row) => ({
      id: row.id,
      workspaceId: row.workspace_id,
      path: row.path,
      type: row.op_type,
      fsMtime: row.fs_mtime,
      timestamp: row.updated_at,
      snapshotId: row.changeset_id || undefined,
      snapshotStatus: row.snapshot_status || undefined,
      snapshotSummary: row.snapshot_summary || undefined,
      reviewStatus: row.review_status || undefined,
    }))
  }

  async upsertPendingOp(
    workspaceId: string,
    path: string,
    type: OpType,
    fsMtime?: number
  ): Promise<PendingOverlayOp> {
    const db = getSQLiteDB()
    const now = Date.now()
    const requestedFsMtime = typeof fsMtime === 'number' && Number.isFinite(fsMtime) ? fsMtime : 0
    const changesetId = await this.getOrCreateDraftChangeset(workspaceId)
    const existing = await db.queryFirst<{ id: string; fs_mtime: number }>(
      `SELECT id, fs_mtime
       FROM fs_ops
       WHERE workspace_id = ? AND path = ? AND status = 'pending'
       ORDER BY updated_at DESC
       LIMIT 1`,
      [workspaceId, path]
    )

    if (existing?.id) {
      const baselineFsMtime = existing.fs_mtime > 0 ? existing.fs_mtime : requestedFsMtime
      await db.execute(
        `UPDATE fs_ops
         SET changeset_id = ?, op_type = ?, fs_mtime = ?, updated_at = ?, error_message = NULL, review_status = 'pending'
         WHERE id = ?`,
        [changesetId, type, baselineFsMtime, now, existing.id]
      )
      return {
        id: existing.id,
        workspaceId,
        path,
        type,
        fsMtime: baselineFsMtime,
        timestamp: now,
        snapshotId: changesetId,
        snapshotStatus: 'draft',
      }
    }

    const id = generateId('op')
    await db.execute(
      `INSERT INTO fs_ops
       (id, workspace_id, changeset_id, path, op_type, status, review_status, fs_mtime, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'pending', 'pending', ?, ?, ?)`,
      [id, workspaceId, changesetId, path, type, requestedFsMtime, now, now]
    )
    return {
      id,
      workspaceId,
      path,
      type,
      fsMtime: requestedFsMtime,
      timestamp: now,
      snapshotId: changesetId,
      snapshotStatus: 'draft',
    }
  }

  async discardPendingPath(workspaceId: string, path: string): Promise<void> {
    const db = getSQLiteDB()
    await db.execute(
      `UPDATE fs_ops
       SET status = 'discarded', review_status = 'rejected', updated_at = ?
       WHERE workspace_id = ? AND path = ? AND status = 'pending'`,
      [Date.now(), workspaceId, path]
    )
  }

  async createApprovedSnapshotForPaths(
    workspaceId: string,
    paths: string[],
    summary?: string
  ): Promise<{ snapshotId: string; opCount: number } | null> {
    if (paths.length === 0) return null
    const db = getSQLiteDB()
    const placeholders = paths.map(() => '?').join(', ')
    const existing = await db.queryAll<{ id: string }>(
      `SELECT id
       FROM fs_ops
       WHERE workspace_id = ? AND status = 'pending' AND path IN (${placeholders})`,
      [workspaceId, ...paths]
    )
    const opCount = existing.length
    if (opCount === 0) return null

    const snapshotId = generateId('changeset')
    const now = Date.now()
    await db.execute(
      `INSERT INTO fs_changesets (id, workspace_id, source, status, summary, created_at, committed_at, synced_at)
       VALUES (?, ?, 'review', 'approved', ?, ?, ?, ?)`,
      [snapshotId, workspaceId, summary || null, now, now, null] // synced_at 默认为 null，表示未同步到磁盘
    )

    await db.execute(
      `UPDATE fs_ops
       SET changeset_id = ?, review_status = 'approved', approved_at = ?, updated_at = ?
       WHERE workspace_id = ? AND status = 'pending' AND path IN (${placeholders})`,
      [snapshotId, now, now, workspaceId, ...paths]
    )

    return { snapshotId, opCount }
  }

  /**
   * Mark a snapshot as synced to disk
   */
  async markSnapshotAsSynced(snapshotId: string): Promise<void> {
    const db = getSQLiteDB()
    const now = Date.now()
    await db.execute(
      `UPDATE fs_changesets SET synced_at = ? WHERE id = ?`,
      [now, snapshotId]
    )
  }

  /**
   * Get unsynced snapshots for a workspace
   * Returns snapshots that are approved but not yet synced to disk
   */
  async getUnsyncedSnapshots(workspaceId: string): Promise<
    Array<{
      snapshotId: string
      summary: string | null
      createdAt: number
      opCount: number
    }>
  > {
    const db = getSQLiteDB()
    const rows = await db.queryAll<
      {
        snapshot_id: string
        summary: string | null
        created_at: number
        op_count: number
      }
    >(
      `SELECT c.id AS snapshot_id, c.summary, c.created_at, COUNT(o.id) AS op_count
       FROM fs_changesets c
       LEFT JOIN fs_ops o ON o.changeset_id = c.id
       WHERE c.workspace_id = ?
         AND c.status = 'approved'
         AND c.synced_at IS NULL
       GROUP BY c.id
       ORDER BY c.created_at DESC`,
      [workspaceId]
    )
    return rows.map((row) => ({
      snapshotId: row.snapshot_id,
      summary: row.summary,
      createdAt: row.created_at,
      opCount: row.op_count,
    }))
  }

  async upsertSnapshotFileContent(input: SnapshotFileUpsertInput): Promise<void> {
    const db = getSQLiteDB()
    const now = Date.now()
    const id = generateId('snapshotfile')

    const encodeContent = (
      value: string | ArrayBuffer | Uint8Array | null
    ): { kind: 'text' | 'binary' | 'none'; text: string | null; blob: Uint8Array | null } => {
      if (typeof value === 'string') {
        return { kind: 'text', text: value, blob: null }
      }
      if (value instanceof ArrayBuffer) {
        return { kind: 'binary', text: null, blob: new Uint8Array(value) }
      }
      if (value instanceof Uint8Array) {
        return { kind: 'binary', text: null, blob: value }
      }
      return { kind: 'none', text: null, blob: null }
    }

    const before = encodeContent(input.beforeContent)
    const after = encodeContent(input.afterContent)

    await db.execute(
      `INSERT INTO fs_snapshot_files
       (id, snapshot_id, workspace_id, path, op_type,
        before_content_kind, before_content_text, before_content_blob,
        after_content_kind, after_content_text, after_content_blob,
        content_kind, content_text, content_blob, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(snapshot_id, path) DO UPDATE SET
         op_type = excluded.op_type,
         before_content_kind = excluded.before_content_kind,
         before_content_text = excluded.before_content_text,
         before_content_blob = excluded.before_content_blob,
         after_content_kind = excluded.after_content_kind,
         after_content_text = excluded.after_content_text,
         after_content_blob = excluded.after_content_blob,
         content_kind = excluded.content_kind,
         content_text = excluded.content_text,
         content_blob = excluded.content_blob,
         created_at = excluded.created_at`,
      [
        id,
        input.snapshotId,
        input.workspaceId,
        input.path,
        input.opType,
        before.kind,
        before.text,
        before.blob,
        after.kind,
        after.text,
        after.blob,
        after.kind,
        after.text,
        after.blob,
        now,
      ]
    )
  }

  async getSnapshotFileContent(
    snapshotId: string,
    path: string
  ): Promise<SnapshotFileRecord | null> {
    const db = getSQLiteDB()
    const row = await db.queryFirst<{
      snapshot_id: string
      workspace_id: string
      path: string
      op_type: OpType
      before_content_kind: 'text' | 'binary' | 'none'
      before_content_text: string | null
      before_content_blob: Uint8Array | null
      after_content_kind: 'text' | 'binary' | 'none'
      after_content_text: string | null
      after_content_blob: Uint8Array | null
    }>(
      `SELECT snapshot_id, workspace_id, path, op_type,
              before_content_kind, before_content_text, before_content_blob,
              after_content_kind, after_content_text, after_content_blob
       FROM fs_snapshot_files
       WHERE snapshot_id = ? AND path = ?
       LIMIT 1`,
      [snapshotId, path]
    )

    if (!row) return null
    return {
      snapshotId: row.snapshot_id,
      workspaceId: row.workspace_id,
      path: row.path,
      opType: row.op_type,
      beforeContentKind: row.before_content_kind,
      beforeContentText: row.before_content_text,
      beforeContentBlob: row.before_content_blob,
      afterContentKind: row.after_content_kind,
      afterContentText: row.after_content_text,
      afterContentBlob: row.after_content_blob,
    }
  }

  async markSnapshotRolledBack(workspaceId: string, snapshotId: string): Promise<void> {
    const db = getSQLiteDB()
    await db.execute(
      `UPDATE fs_changesets
       SET status = 'rolled_back'
       WHERE workspace_id = ? AND id = ?`,
      [workspaceId, snapshotId]
    )
  }

  async markSnapshotActive(workspaceId: string, snapshotId: string): Promise<void> {
    const db = getSQLiteDB()
    await db.execute(
      `UPDATE fs_changesets
       SET status = CASE
         WHEN status = 'rolled_back' THEN 'approved'
         ELSE status
       END
       WHERE workspace_id = ? AND id = ?`,
      [workspaceId, snapshotId]
    )
  }

  async getCurrentSnapshotId(workspaceId: string): Promise<string | null> {
    const db = getSQLiteDB()
    const row = await db.queryFirst<{ current_snapshot_id: string | null }>(
      `SELECT current_snapshot_id FROM workspaces WHERE id = ? LIMIT 1`,
      [workspaceId]
    )
    return row?.current_snapshot_id || null
  }

  async setCurrentSnapshotId(workspaceId: string, snapshotId: string | null): Promise<void> {
    const db = getSQLiteDB()
    await db.execute(
      `UPDATE workspaces
       SET current_snapshot_id = ?
       WHERE id = ?`,
      [snapshotId, workspaceId]
    )
  }

  async deleteSnapshot(snapshotId: string): Promise<void> {
    const db = getSQLiteDB()
    const target = await db.queryFirst<{ workspace_id: string }>(
      `SELECT workspace_id FROM fs_changesets WHERE id = ? LIMIT 1`,
      [snapshotId]
    )
    if (!target?.workspace_id) return

    await db.execute(`DELETE FROM fs_changesets WHERE id = ?`, [snapshotId])
    await this.reconcileWorkspaceCurrentSnapshot(target.workspace_id)
  }

  async clearProjectSnapshots(projectId: string): Promise<number> {
    const db = getSQLiteDB()
    const rows = await db.queryAll<{ id: string; workspace_id: string }>(
      `SELECT c.id, c.workspace_id
       FROM fs_changesets c
       JOIN workspaces w ON w.id = c.workspace_id
       WHERE w.project_id = ?`,
      [projectId]
    )
    if (rows.length === 0) return 0

    const ids = rows.map((r) => r.id)
    const placeholders = ids.map(() => '?').join(', ')
    await db.execute(`DELETE FROM fs_changesets WHERE id IN (${placeholders})`, ids)

    const workspaceIds = Array.from(new Set(rows.map((r) => r.workspace_id)))
    for (const workspaceId of workspaceIds) {
      await this.reconcileWorkspaceCurrentSnapshot(workspaceId)
    }

    return ids.length
  }

  private async reconcileWorkspaceCurrentSnapshot(workspaceId: string): Promise<void> {
    const db = getSQLiteDB()
    const row = await db.queryFirst<{ id: string }>(
      `SELECT id
       FROM fs_changesets
       WHERE workspace_id = ?
         AND status IN ('approved', 'committed')
       ORDER BY COALESCE(committed_at, created_at) DESC
       LIMIT 1`,
      [workspaceId]
    )
    await db.execute(
      `UPDATE workspaces
       SET current_snapshot_id = ?
       WHERE id = ?`,
      [row?.id || null, workspaceId]
    )
  }

  async createSyncBatch(workspaceId: string, totalOps: number): Promise<string> {
    const db = getSQLiteDB()
    const id = generateId('syncbatch')
    await db.execute(
      `INSERT INTO fs_sync_batches
       (id, workspace_id, status, total_ops, success_count, failed_count, skipped_count, started_at)
       VALUES (?, ?, 'running', ?, 0, 0, 0, ?)`,
      [id, workspaceId, totalOps, Date.now()]
    )
    return id
  }

  async recordSyncItem(
    batchId: string,
    opId: string,
    path: string,
    status: SyncItemStatus,
    errorMessage?: string
  ): Promise<void> {
    const db = getSQLiteDB()
    await db.execute(
      `INSERT INTO fs_sync_items
       (id, batch_id, op_id, path, status, error_message, synced_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [generateId('syncitem'), batchId, opId, path, status, errorMessage || null, Date.now()]
    )
  }

  async markOpSynced(opId: string): Promise<void> {
    const db = getSQLiteDB()
    const now = Date.now()
    await db.execute(
      `UPDATE fs_ops
       SET status = 'synced',
           review_status = 'approved',
           approved_at = COALESCE(approved_at, ?),
           updated_at = ?,
           error_message = NULL
       WHERE id = ?`,
      [now, now, opId]
    )
  }

  async markOpFailed(opId: string, errorMessage: string): Promise<void> {
    const db = getSQLiteDB()
    await db.execute(
      `UPDATE fs_ops SET status = 'failed', updated_at = ?, error_message = ? WHERE id = ?`,
      [Date.now(), errorMessage, opId]
    )
  }

  async keepOpPending(opId: string, errorMessage?: string): Promise<void> {
    const db = getSQLiteDB()
    await db.execute(
      `UPDATE fs_ops SET status = 'pending', updated_at = ?, error_message = ? WHERE id = ?`,
      [Date.now(), errorMessage || null, opId]
    )
  }

  async finalizeSyncBatch(
    batchId: string,
    status: BatchStatus,
    successCount: number,
    failedCount: number,
    skippedCount: number
  ): Promise<void> {
    const db = getSQLiteDB()
    await db.execute(
      `UPDATE fs_sync_batches
       SET status = ?, success_count = ?, failed_count = ?, skipped_count = ?, completed_at = ?
       WHERE id = ?`,
      [status, successCount, failedCount, skippedCount, Date.now(), batchId]
    )
  }
}

let instance: FSOverlayRepository | null = null

export function getFSOverlayRepository(): FSOverlayRepository {
  if (!instance) {
    instance = new FSOverlayRepository()
  }
  return instance
}
