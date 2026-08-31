/**
 * Sync-to-Disk Tool — agent-initiated flush of pending OPFS changes to the
 * real disk, through the full authorization chain.
 *
 * This is the SAFE counterpart to what exec's auto-flush used to do silently
 * (removed in this PR — see exec.tool.ts): writing to the real disk is a
 * risk-bearing operation, so it must prompt via the policy engine.
 *
 * Guarantees (redesign doc §3.6):
 *   - Policy level 'prompt' → ToolAuthModal every time unless the user picked
 *     "Always allow for this conversation" (memoryKey is fixed).
 *   - forceOverwrite is FORCED to false and not exposed to the LLM; conflicting
 *     paths are skipped per-file and reported (second line of defense,
 *     independent from the modal).
 *   - Only 'create'/'modify' changes are eligible. Delete-type changes are
 *     stripped BEFORE syncing and surfaced in the result — deletion of real
 *     files stays in the manual Sync panel review flow.
 *   - Snapshot pipeline is reused (createApprovedSnapshotForPaths → syncToDisk
 *     → markSnapshotAsSynced) so synced files stay rollback-able.
 */

import type { ToolDefinition, ToolExecutor, ToolPromptDoc } from './tool-types'
import type { WorkspaceRuntime } from '@/opfs/workspace/workspace-runtime'
import { toolErrorJson, toolOkJson } from './tool-envelope'
import { authorize } from '../policy-engine'
import { partitionPathsByDiskEligibility } from '@/opfs/workspace/pending-disk-eligibility'

const TOOL_NAME = 'sync-to-disk'

export const syncToDiskDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: TOOL_NAME,
    description:
      'Write your pending changes (from write/edit tools) to the real disk so that subsequent ' +
      'shell commands can see them. Use this when a command result depends on the latest file ' +
      'content. Requires user approval each time unless the user grants "always allow" for this ' +
      'conversation. Never overwrites conflicting disk files, and never deletes files on disk — ' +
      'delete-type changes must be approved by the user in the Sync panel.',
    parameters: {
      type: 'object',
      properties: {
        paths: {
          type: 'array',
          description:
            'Pending change paths to sync (defaults to ALL pending create/modify changes). ' +
            'Examples: ["src/app.ts"] or ["creatorweave/src/a.ts", "creatorweave/src/b.ts"]. ' +
            'Multi-root paths include the root name prefix.',
          items: { type: 'string' },
        },
      },
    },
  },
}

interface SyncToDiskOutcome {
  synced: string[]
  skippedConflicts: string[]
  failed: number
  excludedDeletions: Array<{ path: string; type: 'delete' | 'unknown' }>
  snapshotId?: string
}

/**
 * Shared flush implementation (also used by exec's post-execution hint path —
 * actually NOT: exec no longer flushes; this helper is exclusive to this tool).
 * Mirrors the snapshot pipeline of autoApplyCompletedRunChanges.
 */
async function flushPendingToDisk(
  runtime: WorkspaceRuntime,
  requestedPaths: string[] | undefined,
): Promise<SyncToDiskOutcome> {
  const outcome: SyncToDiskOutcome = {
    synced: [],
    skippedConflicts: [],
    failed: 0,
    excludedDeletions: [],
  }

  // Filter the requested paths (or all pending) to create/modify BEFORE
  // passing onlyPaths to syncToDisk — delete-type changes must never reach
  // the disk pipeline (§3.9 constraint 8). Uses the SHARED eligibility rule
  // (pending-disk-eligibility.ts, same as run-level auto-apply).
  const requestedSet = requestedPaths?.length ? new Set(requestedPaths) : null
  const allPending = runtime.getPendingChanges()
  const candidatePaths = requestedSet
    ? allPending.filter((c) => requestedSet.has(c.path)).map((c) => c.path)
    : allPending.map((c) => c.path)
  const { eligible, excluded } = partitionPathsByDiskEligibility(candidatePaths, allPending)
  for (const e of excluded) {
    // Report deletions always; report not-pending paths only when the caller
    // explicitly asked for them (unrequested extras are just noise).
    if (e.reason === 'delete' || requestedSet?.has(e.path)) {
      outcome.excludedDeletions.push({
        path: e.path,
        type: e.reason === 'delete' ? 'delete' : 'unknown',
      })
    }
  }

  if (eligible.length === 0) {
    return outcome
  }

  // Snapshot FIRST (before/after contents for diff + rollback), mirroring
  // autoApplyCompletedRunChanges.
  const snapshot = await runtime.createApprovedSnapshotForPaths(
    eligible,
    `sync-to-disk (${eligible.length} file${eligible.length === 1 ? '' : 's'})`,
    null,
    null,
  )

  // Tool layer FORCES forceOverwrite: false — the parameter is not exposed.
  const result = await runtime.syncToDisk(null, eligible, false)

  if (result.conflicts.length > 0) {
    // Per-file conflicts are skipped (workspace-pending.ts semantics); the
    // snapshot remains as a record but conflicting files stay pending for the
    // manual review flow.
    outcome.skippedConflicts = result.conflicts.map((c) => c.path)
  }
  if (result.failed > 0) {
    outcome.failed = result.failed
  }
  const conflictSet = new Set(outcome.skippedConflicts)
  outcome.synced = eligible.filter((p) => !conflictSet.has(p))

  if (snapshot && outcome.synced.length > 0) {
    await runtime.markSnapshotAsSynced(snapshot.snapshotId)
  }
  outcome.snapshotId = snapshot?.snapshotId
  return outcome
}

export const syncToDiskExecutor: ToolExecutor = async (args, context) => {
  const requestedPaths = Array.isArray(args.paths)
    ? (args.paths as unknown[]).map((p) => String(p ?? '').trim()).filter(Boolean)
    : undefined

  // Resolve workspace runtime (same pattern as sync-opfs).
  let runtime: WorkspaceRuntime | null = null
  try {
    if (context.workspaceId) {
      const { getWorkspaceManager } = await import('@/opfs')
      const manager = await getWorkspaceManager()
      runtime = (await manager.getWorkspace(context.workspaceId)) ?? null
    }
  } catch {
    runtime = null
  }
  if (!runtime) {
    return toolErrorJson(
      TOOL_NAME,
      'no_workspace',
      'No active workspace available for sync-to-disk.',
      {
        // Redesign §3.6: guide the agent toward the user-side recovery flow
        // instead of a dead end — directory access is granted by the USER.
        hint:
          'No directory is authorized for this conversation yet. Ask the user to authorize a ' +
          'local folder for this conversation first (folder authorization happens through the ' +
          'directory access prompt), then retry sync-to-disk.',
      },
    )
  }

  // Pre-compute scope for the authorization modal BEFORE prompting.
  const pending = runtime.getPendingChanges()
  const requestedSet = requestedPaths?.length ? new Set(requestedPaths) : null
  const eligibleCount = pending.filter(
    (c) =>
      (c.type === 'create' || c.type === 'modify') &&
      (!requestedSet || requestedSet.has(c.path)),
  ).length

  if (eligibleCount === 0 && pending.length === 0) {
    return toolOkJson(TOOL_NAME, {
      synced: [],
      message: 'No pending changes to sync.',
    })
  }

  // --- Authorization (prompt level; "always allow" = fixed memory key) ------
  const auth = await authorize({
    toolName: TOOL_NAME,
    args: { count: eligibleCount },
    conversationId: context.workspaceId,
    signal: context.abortSignal,
  })
  if (auth.decision === 'deny') {
    return toolErrorJson(TOOL_NAME, 'AUTH_DENIED_BY_USER', auth.reason, {
      retryable: false,
    })
  }
  // Stale-approval guard (executor layer).
  if (context.abortSignal?.aborted) {
    return toolErrorJson(
      TOOL_NAME,
      'AUTH_STALE_APPROVAL',
      'Approval arrived after the run was aborted; not syncing.',
      { retryable: false },
    )
  }

  try {
    const outcome = await flushPendingToDisk(runtime, requestedPaths?.length ? requestedPaths : undefined)

    const deletedPending = outcome.excludedDeletions.filter((e) => e.type === 'delete')
    const hints: string[] = []
    if (deletedPending.length > 0) {
      hints.push(
        `${deletedPending.length} delete-type change(s) were NOT synced — deletions on disk require ` +
          `manual user approval in the Sync panel: ${deletedPending.map((d) => d.path).join(', ')}`,
      )
    }
    if (outcome.skippedConflicts.length > 0) {
      hints.push(
        `${outcome.skippedConflicts.length} path(s) skipped — the disk version changed since the ` +
          `baseline (no force overwrite): ${outcome.skippedConflicts.join(', ')}`,
      )
    }
    if (outcome.failed > 0) {
      hints.push(`${outcome.failed} path(s) failed to write.`)
    }

    return toolOkJson(
      TOOL_NAME,
      {
        synced: outcome.synced,
        synced_count: outcome.synced.length,
        skipped_conflicts: outcome.skippedConflicts,
        excluded_deletions: deletedPending.map((d) => d.path),
        snapshot_id: outcome.snapshotId,
      },
      // Success envelopes have no hint field — advisory notes ride in meta
      // so the LLM still sees the deletions/conflicts explanation.
      { meta: hints.length > 0 ? { hint: hints.join(' ') } : undefined },
    )
  } catch (err) {
    return toolErrorJson(
      TOOL_NAME,
      'sync_failed',
      `Failed to sync pending changes to disk: ${err instanceof Error ? err.message : String(err)}`,
      { retryable: true },
    )
  }
}

export const syncToDiskPromptDoc: ToolPromptDoc = {
  category: 'file-ops',
  section: '### File Sync (OPFS → disk)',
  lines: [
    '- `sync-to-disk(paths?)` - Write your pending changes to the real disk (requires user approval each time unless remembered). Use BEFORE running a shell command whose result depends on the latest file content. Never overwrites conflicting disk files; never applies delete-type changes (those need manual user approval in the Sync panel).',
  ],
}
