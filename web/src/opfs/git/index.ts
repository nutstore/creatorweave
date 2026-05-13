/**
 * OPFS Git - Browser-based Git implementation using FSOverlayRepository.
 *
 * Provides Git-like operations based on the existing change tracking and snapshot system:
 * - git_status: Shows pending changes (unstaged) and staged snapshots
 * - git_diff: Shows diff between working directory and snapshots
 * - git_log: Shows commit/snapshot history
 * - git_show: Shows details of a specific snapshot
 * - git_restore: Restores files from a snapshot or discards pending changes
 */

import { getSQLiteDB } from '@/sqlite'
import { getFSOverlayRepository } from '@/sqlite/repositories/fs-overlay.repository'
import type { SnapshotFileRecord, SnapshotRecord } from '@/sqlite/repositories/fs-overlay.repository'
import { structuredPatch } from 'diff'
import micromatch from 'micromatch'
import { getWorkspaceManager } from '@/opfs'
import { readFileFromNativeFSMultiRoot } from '@/opfs/utils/file-reader'

/** A single file change with sync/review metadata */
export interface FileChangeEntry {
  path: string
  type: 'create' | 'modify' | 'delete'
  /** Which phase this change is in */
  stage: 'pending' | 'approved' | 'failed'
  /** Human-readable error if stage === 'failed' */
  error?: string
}

export interface GitStatusResult {
  workspaceId: string
  branch: string
  /** Changes awaiting review (review_status = pending, not yet synced) */
  pending: FileChangeEntry[]
  /** Changes approved but not yet written to disk (review_status = approved, status = pending) */
  approved: FileChangeEntry[]
  /** Changes that failed to sync (status = failed) */
  conflicts: FileChangeEntry[]
  counts: { pending: number; approved: number; conflicts: number; total: number }
}

export interface GitDiffResult {
  workspaceId: string
  from: string | null
  to: string | null
  files: DiffFile[]
  summary: { filesChanged: number; insertions: number; deletions: number }
}

export interface GitDiffRenderOptions {
  nameOnly?: boolean
  nameStatus?: boolean
  stat?: boolean
  numstat?: boolean
  patch?: boolean
}

export interface GitLogResult {
  workspaceId: string
  head: string | null
  commits: SnapshotCommit[]
  hasMore: boolean
}

export interface SnapshotCommit {
  id: string
  summary: string | null
  source: string
  status: string
  createdAt: number
  committedAt: number | null
  opCount: number
  isCurrent?: boolean
}

export interface FileChange {
  path: string
  type: 'create' | 'modify' | 'delete'
  status?: string
}

export interface DiffFile {
  path: string
  kind: 'add' | 'delete' | 'modify'
  additions?: number
  deletions?: number
  hunks: DiffHunk[]
}

export interface DiffHunk {
  header: string
  lines: DiffLine[]
}

export interface DiffLine {
  type: 'add' | 'delete' | 'context'
  content: string
}

export interface GitShowResult {
  id: string
  summary: string | null
  source: string
  status: string
  createdAt: number
  committedAt: number | null
  opCount: number
  files: SnapshotFileInfo[]
  diff?: GitDiffResult
}

export interface SnapshotFileInfo {
  path: string
  opType: 'create' | 'modify' | 'delete'
  beforeSize?: number
  afterSize?: number
}

export interface GitRestoreResult {
  restored: number
  discarded: number
  unstaged?: number
  unresolved?: string[]
  unmatchedPatterns?: string[]
  message: string
}

//=============================================================================
// git_status - Working tree status
//=============================================================================

export async function gitStatus(workspaceId: string): Promise<GitStatusResult> {
  const db = getSQLiteDB()

  // Query ALL active ops for this workspace, regardless of review_status.
  // This gives us a file-centric view of what's happening:
  //   - status='pending' + review_status='pending' → awaiting review
  //   - status='pending' + review_status='approved' → approved, waiting to sync to disk
  //   - status='failed'                             → sync conflict / error
  const rows = await db.queryAll<{
    path: string
    op_type: 'create' | 'modify' | 'delete'
    status: string
    review_status: string | null
    error_message: string | null
  }>(
    `SELECT path, op_type, status, review_status, error_message
     FROM fs_ops
     WHERE workspace_id = ?
       AND status IN ('pending', 'failed')
     ORDER BY path ASC`,
    [workspaceId]
  )

  const pending: FileChangeEntry[] = []
  const approved: FileChangeEntry[] = []
  const conflicts: FileChangeEntry[] = []

  for (const row of rows) {
    const entry: FileChangeEntry = {
      path: row.path,
      type: row.op_type,
      stage: 'pending',
      error: row.error_message || undefined,
    }

    if (row.status === 'failed') {
      entry.stage = 'failed'
      conflicts.push(entry)
    } else if (row.review_status === 'approved') {
      entry.stage = 'approved'
      approved.push(entry)
    } else {
      // status='pending' + review_status IN (null, 'pending')
      pending.push(entry)
    }
  }

  // Get current branch name (from workspaces table)
  const workspace = await db.queryFirst<{ name: string }>(
    `SELECT name FROM workspaces WHERE id = ? LIMIT 1`,
    [workspaceId]
  )
  const branch = workspace?.name || 'main'

  const total = pending.length + approved.length + conflicts.length
  return {
    workspaceId,
    branch,
    pending,
    approved,
    conflicts,
    counts: { pending: pending.length, approved: approved.length, conflicts: conflicts.length, total },
  }
}

export function formatGitStatus(status: GitStatusResult): string {
  const lines: string[] = []

  lines.push(`On branch ${status.branch}`)
  lines.push('')

  if (status.pending.length > 0) {
    lines.push(`Changes awaiting review (${status.counts.pending} files):`)
    for (const entry of status.pending) {
      const code = entry.type === 'create' ? 'A' : entry.type === 'modify' ? 'M' : 'D'
      lines.push(`  ${code} ${entry.path}`)
    }
    lines.push('')
  }

  if (status.approved.length > 0) {
    lines.push(`Changes approved, syncing to disk (${status.counts.approved} files):`)
    for (const entry of status.approved) {
      const code = entry.type === 'create' ? 'A' : entry.type === 'modify' ? 'M' : 'D'
      lines.push(`  ${code} ${entry.path}`)
    }
    lines.push('')
  }

  if (status.conflicts.length > 0) {
    lines.push(`Sync conflicts (${status.counts.conflicts} files):`)
    for (const entry of status.conflicts) {
      const code = entry.type === 'create' ? 'A' : entry.type === 'modify' ? 'M' : 'D'
      const err = entry.error ? ` — ${entry.error}` : ''
      lines.push(`  ${code} ${entry.path}${err}`)
    }
    lines.push('')
  }

  if (status.counts.total === 0) {
    lines.push('No changes to commit (working tree clean)')
  }

  return lines.join('\n')
}

//=============================================================================
// git_diff - Show changes
//=============================================================================

export async function gitDiff(
  workspaceId: string,
  options?: {
    mode?: 'working' | 'cached' | 'snapshot'
    snapshotId?: string
    path?: string
    directoryHandle?: FileSystemDirectoryHandle | null
    contextLines?: number
  }
): Promise<GitDiffResult> {
  const repo = getFSOverlayRepository()
  const db = getSQLiteDB()
  const mode = options?.mode || 'working'
  const targetSnapshotId = options?.snapshotId
  const contextLines = normalizeDiffContextLines(options?.contextLines)

  let from: string | null = null
  let to: string | null = null
  let ops: Awaited<ReturnType<typeof repo.listSnapshotOps>> = []

  if (mode === 'snapshot' && targetSnapshotId) {
    // Compare between two snapshots or show a specific snapshot
    const snapshots = await repo.listSnapshots(workspaceId, 50)
    const targetIdx = snapshots.findIndex((s) => s.id === targetSnapshotId)
    if (targetIdx >= 0 && targetIdx < snapshots.length - 1) {
      from = snapshots[targetIdx + 1].id
      to = targetSnapshotId
      ops = await repo.listSnapshotOps(workspaceId, to)
    } else if (targetIdx >= 0) {
      to = targetSnapshotId
      ops = await repo.listSnapshotOps(workspaceId, to)
    }
  } else if (mode === 'cached') {
    // Show staged changes from approved snapshots not yet synced to disk.
    const unsyncedSnapshots = await repo.getUnsyncedSnapshots(workspaceId)
    if (unsyncedSnapshots.length > 0) {
      to = unsyncedSnapshots[0].snapshotId
      from = await repo.getCurrentSnapshotId(workspaceId)

      const collected = await Promise.all(
        unsyncedSnapshots.map(async (snapshot) => repo.listSnapshotOps(workspaceId, snapshot.snapshotId))
      )
      const latestByPath = new Map<string, (typeof ops)[number]>()
      for (const snapshotOps of collected) {
        for (const op of snapshotOps) {
          if (!latestByPath.has(op.path)) {
            latestByPath.set(op.path, op)
          }
        }
      }
      ops = Array.from(latestByPath.values())
    }
  } else {
    // Show ALL active file changes (pending review, approved, or failed sync).
    // Unlike the old listPendingOps() which only returned review_status='pending',
    // this directly queries fs_ops so approved-but-not-yet-synced and failed files
    // are also included in the diff.
    const activeRows = await db.queryAll<{
      id: string
      changeset_id: string | null
      path: string
      op_type: 'create' | 'modify' | 'delete'
      status: string
      review_status: string | null
      fs_mtime: number
      created_at: number
      updated_at: number
    }>(
      `SELECT id, changeset_id, path, op_type, status, review_status, fs_mtime, created_at, updated_at
       FROM fs_ops
       WHERE workspace_id = ?
         AND status IN ('pending', 'failed')
       ORDER BY path ASC`,
      [workspaceId]
    )
    ops = activeRows.map((row) => ({
      id: row.id,
      workspaceId,
      snapshotId: row.changeset_id,
      path: row.path,
      type: row.op_type,
      status: row.status as 'pending' | 'synced' | 'discarded' | 'failed',
      reviewStatus: (row.review_status ?? undefined) as 'pending' | 'approved' | 'rejected' | undefined,
      fsMtime: row.fs_mtime,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }))
  }

  // Filter by path if specified
  let filteredOps = ops
  if (options?.path) {
    const prefix = options.path
    filteredOps = ops.filter((op) => op.path.startsWith(prefix))
  }

  // Convert ops to diff files
  const files: DiffFile[] = []
  let totalAdditions = 0
  let totalDeletions = 0

  for (const op of filteredOps) {
    const snapshotIdForDiff = op.snapshotId || to || targetSnapshotId || undefined
    let resolved: DiffFile | null = null

    if (snapshotIdForDiff) {
      const snapshotFile = await repo.getSnapshotFileContent(snapshotIdForDiff, op.path)
      if (snapshotFile) {
        resolved = buildDiffFileFromSnapshotContent(op.path, op.type, snapshotFile, contextLines)
      }
    }

    if (!resolved && mode === 'working') {
      resolved = await buildWorkingDiffFileFromCurrentState(
        workspaceId,
        op.path,
        op.type,
        options?.directoryHandle,
        contextLines
      )
    }

    const diffFile = resolved || buildFallbackDiffFile(op.path, op.type)
    totalAdditions += diffFile.additions || 0
    totalDeletions += diffFile.deletions || 0
    files.push(diffFile)
  }

  return {
    workspaceId,
    from,
    to,
    files,
    summary: {
      filesChanged: files.length,
      insertions: totalAdditions,
      deletions: totalDeletions,
    },
  }
}

export function formatGitDiff(diff: GitDiffResult, options?: GitDiffRenderOptions): string {
  if (diff.files.length === 0) {
    return 'No changes to show'
  }

  if (options?.nameOnly) {
    return diff.files.map((file) => file.path).join('\n')
  }

  if (options?.nameStatus) {
    return diff.files.map((file) => `${toGitStatusCode(file.kind)}\t${file.path}`).join('\n')
  }

  const rendered: string[] = []
  const includesStats = Boolean(options?.stat || options?.numstat)
  const renderPatch = options?.patch ?? !includesStats

  if (options?.numstat) {
    rendered.push(renderNumstat(diff.files))
  } else if (options?.stat) {
    rendered.push(renderDiffstat(diff.files))
  }

  if (renderPatch) {
    rendered.push(renderPatchDiff(diff))
  }

  return rendered.filter(Boolean).join('\n\n')
}

function toGitStatusCode(kind: DiffFile['kind']): 'A' | 'D' | 'M' {
  if (kind === 'add') return 'A'
  if (kind === 'delete') return 'D'
  return 'M'
}

function isBinaryDiffFile(file: DiffFile): boolean {
  return file.hunks.some((hunk) => hunk.lines.some((line) => line.content === '[binary files differ]'))
}

function renderNumstat(files: DiffFile[]): string {
  return files
    .map((file) => {
      if (isBinaryDiffFile(file)) {
        return `-\t-\t${file.path}`
      }
      return `${file.additions || 0}\t${file.deletions || 0}\t${file.path}`
    })
    .join('\n')
}

function renderDiffstat(files: DiffFile[]): string {
  const maxBarWidth = 40
  return files
    .map((file) => {
      if (isBinaryDiffFile(file)) {
        return `${file.path} | Bin`
      }
      const additions = file.additions || 0
      const deletions = file.deletions || 0
      const total = additions + deletions
      if (total === 0) {
        return `${file.path} | 0`
      }
      const plusCount = Math.max(0, Math.round((additions / total) * Math.min(total, maxBarWidth)))
      const minusCount = Math.max(0, Math.min(Math.min(total, maxBarWidth) - plusCount, maxBarWidth))
      const bar = `${'+'.repeat(plusCount)}${'-'.repeat(minusCount)}`
      return `${file.path} | ${total} ${bar}`
    })
    .join('\n')
}

function renderPatchDiff(diff: GitDiffResult): string {
  const lines: string[] = []

  if (diff.from || diff.to) {
    lines.push(`diff --git ${diff.from || 'null'} ${diff.to || 'null'}`)
  }

  for (const file of diff.files) {
    if (file.kind === 'add') {
      lines.push(`diff --git a/${file.path} b/${file.path}`)
      lines.push(`new file mode`)
      lines.push(`--- /dev/null`)
      lines.push(`+++ b/${file.path}`)
    } else if (file.kind === 'delete') {
      lines.push(`diff --git a/${file.path} b/${file.path}`)
      lines.push(`deleted file mode`)
      lines.push(`--- a/${file.path}`)
      lines.push(`+++ /dev/null`)
    } else {
      lines.push(`diff --git a/${file.path} b/${file.path}`)
      lines.push(`--- a/${file.path}`)
      lines.push(`+++ b/${file.path}`)
    }

    for (const hunk of file.hunks) {
      lines.push(hunk.header)
      for (const line of hunk.lines) {
        const prefix = line.type === 'add' ? '+' : line.type === 'delete' ? '-' : ' '
        lines.push(`${prefix}${line.content}`)
      }
    }
    lines.push('')
  }

  return lines.join('\n')
}

//=============================================================================
// git_log - Show commit history
//=============================================================================

export async function gitLog(
  workspaceId: string,
  options?: {
    limit?: number
    path?: string
    status?: 'committed' | 'approved' | 'rolled_back'
  }
): Promise<GitLogResult> {
  const repo = getFSOverlayRepository()
  const limit = options?.limit || 10
  const hasFilter = Boolean(options?.status || options?.path)
  const fetchLimit = hasFilter ? Math.max(limit * 20, 200) : limit + 1
  const snapshots = await repo.listSnapshots(workspaceId, fetchLimit)

  let filtered = snapshots

  if (options?.status) {
    filtered = filtered.filter((snapshot) => snapshot.status === options.status)
  }

  if (options?.path) {
    const prefix = options.path
    const matched = await Promise.all(
      filtered.map(async (snapshot) => {
        const ops = await repo.listSnapshotOps(workspaceId, snapshot.id)
        return ops.some((op) => op.path.startsWith(prefix)) ? snapshot : null
      })
    )
    filtered = matched.filter((snapshot): snapshot is SnapshotRecord => snapshot !== null)
  }

  const hasMore = filtered.length > limit
  const commits = filtered.slice(0, limit).map(mapSnapshotToCommit)

  // Get HEAD commit (most recent)
  const head = commits.length > 0 ? commits[0].id : null

  return {
    workspaceId,
    head,
    commits,
    hasMore,
  }
}

export function formatGitLog(log: GitLogResult): string {
  const lines: string[] = []

  for (const commit of log.commits) {
    const date = new Date(commit.createdAt).toLocaleString()
    const isCurrent = commit.isCurrent ? ' (current)' : ''
    lines.push(`commit ${commit.id}${isCurrent}`)
    lines.push(`Date:   ${date}`)
    if (commit.summary) {
      lines.push('')
      lines.push(`    ${commit.summary}`)
    }
    lines.push('')
  }

  if (log.hasMore) {
    lines.push(`... and more commits`)
  }

  if (log.commits.length === 0) {
    return 'No commits yet'
  }

  return lines.join('\n')
}

export function formatGitLogOneline(log: GitLogResult): string {
  const lines: string[] = []

  for (const commit of log.commits) {
    const shortId = commit.id.slice(0, 8)
    const summary = commit.summary || '(no message)'
    const isCurrent = commit.isCurrent ? ' *' : ''
    lines.push(`${shortId} ${summary}${isCurrent}`)
  }

  if (log.hasMore) {
    lines.push(`... and more commits`)
  }

  if (log.commits.length === 0) {
    return 'No commits yet'
  }

  return lines.join('\n')
}

//=============================================================================
// git_show - Show commit details
//=============================================================================

export async function gitShow(
  workspaceId: string,
  snapshotId?: string,
  options?: {
    includeDiff?: boolean
    path?: string
  }
): Promise<GitShowResult | null> {
  const repo = getFSOverlayRepository()
  let snapshot: SnapshotRecord | null = null
  let targetId: string

  if (snapshotId) {
    snapshot = await repo.getSnapshotById(workspaceId, snapshotId)
    if (!snapshot) return null
    targetId = snapshot.id
  } else {
    const snapshots = await repo.listSnapshots(workspaceId, 1)
    if (snapshots.length === 0) return null
    snapshot = snapshots[0]
    targetId = snapshot.id
  }

  const files = await repo.listSnapshotFiles(snapshot.id)
  let diff: GitDiffResult | undefined
  if (options?.includeDiff) {
    diff = await gitDiff(workspaceId, {
      mode: 'snapshot',
      snapshotId: targetId,
      path: options.path,
    })
  }

  return {
    id: snapshot.id,
    summary: snapshot.summary,
    source: snapshot.source,
    status: snapshot.status,
    createdAt: snapshot.createdAt,
    committedAt: snapshot.committedAt,
    opCount: snapshot.opCount,
    files: files.map((f) => ({
      path: f.path,
      opType: f.opType,
      beforeSize: f.beforeContentSize,
      afterSize: f.afterContentSize,
    })),
    diff,
  }
}

export function formatGitShow(data: GitShowResult): string {
  const date = new Date(data.createdAt).toLocaleString()

  const lines: string[] = []
  lines.push(`commit ${data.id}`)
  lines.push(`Date:   ${date}`)
  lines.push(`Status: ${data.status}`)
  lines.push('')
  if (data.summary) {
    lines.push(`    ${data.summary}`)
  }
  lines.push('')
  lines.push(`Changed files (${data.files.length}):`)
  for (const file of data.files) {
    const sizeStr =
      file.beforeSize !== undefined && file.afterSize !== undefined
        ? ` (${file.beforeSize} -> ${file.afterSize})`
        : ''
    lines.push(`  ${file.opType}: ${file.path}${sizeStr}`)
  }

  if (data.diff) {
    lines.push('')
    lines.push('Diff:')
    lines.push(formatGitDiff(data.diff))
  }

  return lines.join('\n')
}

//=============================================================================
// git_restore - Restore files
//=============================================================================

export async function gitRestore(
  workspaceId: string,
  options?: {
    paths?: string[]
    staged?: boolean
    worktree?: boolean
    snapshotId?: string
    directoryHandle?: FileSystemDirectoryHandle | null
  }
): Promise<GitRestoreResult> {
  const repo = getFSOverlayRepository()
  const db = getSQLiteDB()
  const paths = options?.paths || []
  const hasPathFilter = paths.length > 0
  const staged = options?.staged || false
  const worktree = options?.worktree !== false

  let restored = 0
  let discarded = 0
  let unstaged = 0
  let total = hasPathFilter ? paths.length : 0
  let usedSnapshotRestore = false
  let usedWorktreeDiscard = false
  const unresolved: string[] = []
  const matchedPaths = new Set<string>()

  if (staged) {
    // Unstage approved pending ops by moving them back to draft/pending review.
    const approvedRows = await db.queryAll<{ id: string; path: string }>(
      `SELECT id, path
       FROM fs_ops
       WHERE workspace_id = ?
         AND status = 'pending'
         AND review_status = 'approved'`,
      [workspaceId]
    )
    const matched = hasPathFilter ? selectPathMatchedItems(approvedRows, paths) : approvedRows
    if (!hasPathFilter) total = approvedRows.length
    if (matched.length > 0) {
      const draftChangesetId = await repo.getOrCreateDraftChangeset(workspaceId, 'tool')
      const now = Date.now()
      for (const item of matched) {
        matchedPaths.add(item.path)
        await db.execute(
          `UPDATE fs_ops
           SET changeset_id = ?,
               review_status = 'pending',
               approved_at = NULL,
               updated_at = ?
           WHERE id = ?`,
          [draftChangesetId, now, item.id]
        )
        unstaged++
      }
    }
  } else if (worktree) {
    // Restore from snapshot or discard pending changes
    const targetSnapshotId = options?.snapshotId

    if (targetSnapshotId) {
      usedSnapshotRestore = true
      // Restore specific files from a snapshot
      const manager = await getWorkspaceManager()
      const workspace = await manager.getWorkspace(workspaceId)
      if (!workspace) {
        throw new Error(`Workspace ${workspaceId} not found`)
      }

      const ops = await repo.listSnapshotOps(workspaceId, targetSnapshotId)
      const targetOps = hasPathFilter ? selectPathMatchedItems(ops, paths) : ops
      if (!hasPathFilter) total = ops.length
      for (const op of targetOps) matchedPaths.add(op.path)

      for (const op of targetOps) {
        if (op.type === 'delete') {
          await workspace.deleteFile(op.path, options?.directoryHandle)
          restored++
          continue
        }

        const snapshotFile = await repo.getSnapshotFileContent(targetSnapshotId, op.path)
        const content = resolveSnapshotAfterContent(snapshotFile)
        if (content === null) {
          unresolved.push(op.path)
          continue
        }
        await workspace.writeFile(op.path, content, options?.directoryHandle)
        restored++
      }
    } else {
      usedWorktreeDiscard = true
      // Discard pending changes
      const pending = await repo.listPendingOps(workspaceId)
      const targetPending = hasPathFilter ? selectPathMatchedItems(pending, paths) : pending
      if (!hasPathFilter) total = pending.length
      if (targetPending.length > 0) {
        const manager = await getWorkspaceManager()
        const workspace = await manager.getWorkspace(workspaceId)
        if (!workspace) {
          throw new Error(`Workspace ${workspaceId} not found`)
        }

        if (!hasPathFilter) {
          await workspace.discardAllPendingChanges()
          for (const change of targetPending) matchedPaths.add(change.path)
          discarded = targetPending.length
        } else {
          for (const change of targetPending) {
            matchedPaths.add(change.path)
            await workspace.discardPendingPath(change.path)
            discarded++
          }
        }
      }
    }
  }

  const unmatchedPatterns = hasPathFilter
    ? paths.filter((pattern) => !Array.from(matchedPaths).some((path) => isPathPatternMatch(path, pattern)))
    : []

  return {
    restored,
    discarded,
    ...(unstaged > 0 ? { unstaged } : {}),
    ...(unresolved.length > 0 ? { unresolved } : {}),
    ...(unmatchedPatterns.length > 0 ? { unmatchedPatterns } : {}),
    message: formatRestoreMessage({
      staged,
      restored,
      discarded,
      unstaged,
      unresolved: unresolved.length,
      total,
      usedSnapshotRestore,
      usedWorktreeDiscard,
    }),
  }
}

export function formatGitRestore(result: GitRestoreResult): string {
  return result.message
}

//=============================================================================
// Helpers
//=============================================================================

function mapSnapshotToCommit(snapshot: SnapshotRecord): SnapshotCommit {
  return {
    id: snapshot.id,
    summary: snapshot.summary,
    source: snapshot.source,
    status: snapshot.status,
    createdAt: snapshot.createdAt,
    committedAt: snapshot.committedAt,
    opCount: snapshot.opCount,
    isCurrent: snapshot.isCurrent,
  }
}

function normalizeDiffContextLines(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 3
  }
  const normalized = Math.trunc(value)
  if (normalized < 0) return 0
  if (normalized > 100) return 100
  return normalized
}

function formatRestoreMessage(params: {
  staged: boolean
  restored: number
  discarded: number
  unstaged: number
  unresolved: number
  total: number
  usedSnapshotRestore: boolean
  usedWorktreeDiscard: boolean
}): string {
  const { staged, restored, discarded, unstaged, unresolved, total, usedSnapshotRestore, usedWorktreeDiscard } =
    params
  if (staged) {
    return `Unstaged ${unstaged} of ${total} path(s)`
  }
  if (usedWorktreeDiscard) {
    return `Discarded ${discarded} of ${total} file(s) from working tree`
  }
  if (restored > 0 && discarded > 0) {
    return `Restored ${restored}, discarded ${discarded} of ${total} file(s)`
  }
  if (unresolved > 0) {
    return `Restored ${restored} of ${total} file(s), ${unresolved} unresolved`
  }
  if (usedSnapshotRestore) {
    return `Restored ${restored} of ${total} file(s) from snapshot`
  }
  return `Restored ${restored} of ${total} file(s) from snapshot`
}

function normalizeGitPath(path: string): string {
  let normalized = path.replace(/\\/g, '/')
  if (normalized.startsWith('/mnt/')) normalized = normalized.slice(5)
  else if (normalized.startsWith('/')) normalized = normalized.slice(1)
  return normalized
}

function hasGlobPattern(path: string): boolean {
  return /[*?[{\]}()!+@]/.test(path)
}

function isPathPatternMatch(path: string, pattern: string): boolean {
  const normalizedPath = normalizeGitPath(path)
  const normalizedPattern = normalizeGitPath(pattern)
  if (hasGlobPattern(normalizedPattern)) {
    return micromatch.isMatch(normalizedPath, normalizedPattern)
  }
  return normalizedPath === normalizedPattern
}

function selectPathMatchedItems<T extends { path: string }>(items: T[], patterns: string[]): T[] {
  return items.filter((item) => patterns.some((pattern) => isPathPatternMatch(item.path, pattern)))
}

function resolveSnapshotAfterContent(snapshotFile: SnapshotFileRecord | null): string | ArrayBuffer | null {
  if (!snapshotFile) return null
  if (snapshotFile.afterContentKind === 'text') {
    return snapshotFile.afterContentText || ''
  }
  if (snapshotFile.afterContentKind === 'binary' && snapshotFile.afterContentBlob) {
    return snapshotFile.afterContentBlob.slice().buffer
  }
  return null
}

function buildFallbackDiffFile(path: string, opType: 'create' | 'modify' | 'delete'): DiffFile {
  const additions = opType === 'create' ? 1 : opType === 'delete' ? 0 : 1
  const deletions = opType === 'delete' ? 1 : opType === 'create' ? 0 : 1
  return {
    path,
    kind: opType === 'create' ? 'add' : opType === 'delete' ? 'delete' : 'modify',
    additions,
    deletions,
    hunks: [
      {
        header: `@@ -1 +1 @@ ${opType}: ${path}`,
        lines: [
          {
            type: 'context',
            content: `... ${path} (${opType})`,
          },
        ],
      },
    ],
  }
}

function buildDiffFileFromSnapshotContent(
  path: string,
  opType: 'create' | 'modify' | 'delete',
  snapshotFile: SnapshotFileRecord,
  contextLines: number = 3
): DiffFile {
  const kind: DiffFile['kind'] = opType === 'create' ? 'add' : opType === 'delete' ? 'delete' : 'modify'

  if (snapshotFile.beforeContentKind === 'binary' || snapshotFile.afterContentKind === 'binary') {
    return {
      path,
      kind,
      additions: 0,
      deletions: 0,
      hunks: [
        {
          header: '@@ binary @@',
          lines: [{ type: 'context', content: '[binary files differ]' }],
        },
      ],
    }
  }

  const beforeText = snapshotFile.beforeContentKind === 'text' ? (snapshotFile.beforeContentText || '') : ''
  const afterText = snapshotFile.afterContentKind === 'text' ? (snapshotFile.afterContentText || '') : ''

  const patch = structuredPatch(path, path, beforeText, afterText, '', '', {
    context: contextLines,
  })

  let additions = 0
  let deletions = 0

  const hunks: DiffHunk[] = patch.hunks.map((hunk) => {
    const lines: DiffLine[] = hunk.lines.map((rawLine) => {
      if (rawLine.startsWith('+')) {
        additions += 1
        return { type: 'add', content: rawLine.slice(1) }
      }
      if (rawLine.startsWith('-')) {
        deletions += 1
        return { type: 'delete', content: rawLine.slice(1) }
      }
      if (rawLine.startsWith(' ')) {
        return { type: 'context', content: rawLine.slice(1) }
      }
      return { type: 'context', content: rawLine }
    })

    return {
      header: `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`,
      lines,
    }
  })

  if (hunks.length === 0) {
    hunks.push({
      header: '@@ -0,0 +0,0 @@',
      lines: [{ type: 'context', content: '[no textual changes]' }],
    })
  }

  return {
    path,
    kind,
    additions,
    deletions,
    hunks,
  }
}

async function buildWorkingDiffFileFromCurrentState(
  workspaceId: string,
  path: string,
  opType: 'create' | 'modify' | 'delete',
  directoryHandle?: FileSystemDirectoryHandle | null,
  contextLines: number = 3
): Promise<DiffFile | null> {
  const manager = await getWorkspaceManager()
  const workspace = await manager.getWorkspace(workspaceId)
  if (!workspace) return null

  const afterText = await readWorkingAfterText(workspace, path, opType, directoryHandle)
  const beforeText = await readWorkingBeforeText(workspace, path, opType, directoryHandle)

  if (opType === 'create' && afterText === null) return null
  if (opType === 'delete' && beforeText === null) return null
  if (opType === 'modify' && (beforeText === null || afterText === null)) return null

  return buildDiffFileFromText(path, opType, beforeText || '', afterText || '', contextLines)
}

type WorkingDiffWorkspace = {
  readCachedFile: (path: string) => Promise<unknown>
  readFile: (
    path: string,
    directoryHandle?: FileSystemDirectoryHandle | null
  ) => Promise<{ content: unknown }>
  readBaselineFile: (path: string) => Promise<unknown>
}

async function readWorkingAfterText(
  workspace: WorkingDiffWorkspace,
  path: string,
  opType: 'create' | 'modify' | 'delete',
  directoryHandle?: FileSystemDirectoryHandle | null
): Promise<string | null> {
  if (opType === 'delete') return null

  try {
    const cached = await workspace.readCachedFile(path)
    if (typeof cached === 'string') return cached
  } catch {
    // Ignore and try broader workspace read.
  }

  try {
    const fromWorkspace = await workspace.readFile(path, directoryHandle)
    if (typeof fromWorkspace.content === 'string') return fromWorkspace.content
  } catch {
    return null
  }

  return null
}

async function readWorkingBeforeText(
  workspace: WorkingDiffWorkspace,
  path: string,
  opType: 'create' | 'modify' | 'delete',
  directoryHandle?: FileSystemDirectoryHandle | null
): Promise<string | null> {
  if (opType === 'create') return null

  if (directoryHandle) {
    const native = await readFileFromNativeFSMultiRoot(directoryHandle, path)
    if (typeof native === 'string') return native
  }

  try {
    const baseline = await workspace.readBaselineFile(path)
    if (typeof baseline === 'string') return baseline
  } catch {
    return null
  }

  return null
}

function buildDiffFileFromText(
  path: string,
  opType: 'create' | 'modify' | 'delete',
  beforeText: string,
  afterText: string,
  contextLines: number = 3
): DiffFile {
  const snapshotLike: SnapshotFileRecord = {
    snapshotId: 'working',
    workspaceId: 'working',
    path,
    opType,
    beforeContentKind: 'text',
    beforeContentText: beforeText,
    beforeContentBlob: null,
    afterContentKind: 'text',
    afterContentText: afterText,
    afterContentBlob: null,
  }

  return buildDiffFileFromSnapshotContent(path, opType, snapshotLike, contextLines)
}
