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

export interface GitStatusResult {
  workspaceId: string
  branch: string
  staged: SnapshotCommit[]
  unstaged: FileChange[]
  untracked: FileChange[]
  counts: { staged: number; unstaged: number; untracked: number }
}

export interface GitDiffResult {
  workspaceId: string
  from: string | null
  to: string | null
  files: DiffFile[]
  summary: { filesChanged: number; insertions: number; deletions: number }
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
  const repo = getFSOverlayRepository()
  const db = getSQLiteDB()

  // Get pending ops (unstaged changes)
  const pendingOps = await repo.listPendingOps(workspaceId)

  // Get committed snapshots (staged changes)
  const snapshots = await repo.listSnapshots(workspaceId, 20)
  const staged = snapshots.filter((s) => s.status === 'committed' || s.status === 'approved')

  // Pending ops returned here are review-pending records, which map to unstaged.
  const unstaged: FileChange[] = []
  const untracked: FileChange[] = []

  for (const op of pendingOps) {
    unstaged.push({
      path: op.path,
      type: op.type,
      status: 'unstaged',
    })
  }

  // Get current branch name (from workspaces table)
  const workspace = await db.queryFirst<{ name: string }>(
    `SELECT name FROM workspaces WHERE id = ? LIMIT 1`,
    [workspaceId]
  )
  const branch = workspace?.name || 'main'

  return {
    workspaceId,
    branch,
    staged: staged.map(mapSnapshotToCommit),
    unstaged,
    untracked,
    counts: {
      staged: staged.length,
      unstaged: unstaged.length,
      untracked: untracked.length,
    },
  }
}

export function formatGitStatus(status: GitStatusResult): string {
  const lines: string[] = []

  lines.push(`On branch ${status.branch}`)
  lines.push('')

  if (status.staged.length > 0) {
    lines.push(`Staged changes (${status.counts.staged} snapshots):`)
    for (const commit of status.staged) {
      lines.push(`  [${commit.id.slice(0, 8)}] ${commit.summary || 'No message'} (${commit.opCount} ops)`)
    }
    lines.push('')
  }

  if (status.unstaged.length > 0) {
    lines.push(`Unstaged changes (${status.counts.unstaged} files):`)
    for (const change of status.unstaged) {
      const statusStr = change.type === 'create' ? 'A' : change.type === 'modify' ? 'M' : 'D'
      lines.push(`  ${statusStr} ${change.path}`)
    }
    lines.push('')
  }

  if (status.untracked.length > 0) {
    lines.push(`Untracked files (${status.counts.untracked}):`)
    for (const change of status.untracked) {
      lines.push(`  ? ${change.path}`)
    }
    lines.push('')
  }

  if (status.counts.staged === 0 && status.counts.unstaged === 0 && status.counts.untracked === 0) {
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
  }
): Promise<GitDiffResult> {
  const repo = getFSOverlayRepository()
  const mode = options?.mode || 'working'
  const targetSnapshotId = options?.snapshotId

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
    // Show working directory pending changes
    const pending = await repo.listPendingOps(workspaceId)
    ops = pending.map((op) => ({
      id: op.id,
      workspaceId: op.workspaceId,
      snapshotId: op.snapshotId || null,
      path: op.path,
      type: op.type,
      status: 'pending' as const,
      reviewStatus: op.reviewStatus as 'pending' | 'approved' | 'rejected' | undefined,
      fsMtime: op.fsMtime,
      createdAt: op.timestamp,
      updatedAt: op.timestamp,
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
        resolved = buildDiffFileFromSnapshotContent(op.path, op.type, snapshotFile)
      }
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

export function formatGitDiff(diff: GitDiffResult): string {
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

  if (diff.files.length === 0) {
    return 'No changes to show'
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
  snapshotFile: SnapshotFileRecord
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
    context: 3,
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
