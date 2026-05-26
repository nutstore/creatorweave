/**
 * Write Tool - Write file contents to workspace, agent, or assets VFS.
 *
 * Supports workspace relative paths and vfs:// URIs.
 * Integrated with staleness checks and pending change tracking.
 */

import type { ToolDefinition, ToolExecutor, ToolContext, ToolPromptDoc } from './tool-types'
import { useOPFSStore } from '@/store/opfs.store'
import { useRemoteStore } from '@/store/remote.store'
import { useConversationStore } from '@/store/conversation.store'
import type { AssetMeta } from '@/types/asset'
import { inferMimeType } from '@/types/asset'
import { resolveVfsTarget } from './vfs-resolver'
import { toolErrorJson, toolOkJson } from './tool-envelope'
import { rewritePythonMountPathForNonPythonTool } from './path-guards'
import { checkFileStaleness, refreshReadTimestamp } from './loop-guard'
import { resolveNativeDirectoryHandleForPath } from './tool-utils'
import { getResolvedPathForLoopGuard, formatToolErrorMessage } from './io-shared'

//=============================================================================
// Write Tool
//=============================================================================

export const writeDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'write',
    description:
      'Write content to a single file. Creates directories if needed. Returns confirmation. Supports workspace relative paths and vfs://workspace/... or vfs://agents/{id}/....',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'File path to write',
        },
        content: {
          type: 'string',
          description: 'Content to write',
        },
      },
      required: ['path', 'content'],
    },
  },
}

type PendingChangeType = 'create' | 'modify' | 'delete'
type PendingChangeLike = { path: string; type: PendingChangeType }

function normalizePendingComparePath(inputPath: string): string {
  let normalized = inputPath.replace(/\\/g, '/').trim()
  if (normalized.startsWith('/mnt/')) {
    normalized = normalized.slice('/mnt/'.length)
  } else if (normalized === '/mnt') {
    normalized = ''
  }
  return normalized.replace(/^\/+/, '')
}

function getPendingWriteTypeForPath(
  pendingChanges: PendingChangeLike[],
  path: string
): Exclude<PendingChangeType, 'delete'> | null {
  const target = normalizePendingComparePath(path)
  for (let i = pendingChanges.length - 1; i >= 0; i--) {
    const pending = pendingChanges[i]
    if (normalizePendingComparePath(pending.path) !== target) continue
    if (pending.type === 'delete') continue
    return pending.type
  }
  return null
}

export const writeExecutor: ToolExecutor = async (args, context) => {
  const path = args.path as string | undefined
  const content = args.content as string | undefined

  if (!path || content === undefined) {
    return toolErrorJson(
      'write',
      'invalid_arguments',
      'path and content are required'
    )
  }
  const rewrittenWritePath = rewritePythonMountPathForNonPythonTool(path)
  const effectiveWritePath = rewrittenWritePath?.rewritten ? rewrittenWritePath.rewrittenPath : path
  return executeSingleWrite(effectiveWritePath, content, context)
}

async function executeSingleWrite(
  path: string,
  content: string,
  context: ToolContext
): Promise<string> {
  const { getPendingChanges, hasCachedFile } = useOPFSStore.getState()

  try {
    const target = await resolveVfsTarget(path, context, 'write')
    const resolvedPath = getResolvedPathForLoopGuard(target)

    // Staleness check: warn if file was modified externally since last read
    let stalenessWarning: string | null = null
    if (target.backend.label === 'workspace') {
      try {
        const { handle: nativeHandle, nativePath } = await resolveNativeDirectoryHandleForPath(
          target.path, context.directoryHandle, context.workspaceId
        )
        if (nativeHandle) {
          const fileHandle = await nativeHandle
            .getFileHandle(nativePath.split('/').pop()!, { create: false })
            .catch(() => null)
          if (fileHandle) {
            // getFile() returns a File object with lastModified
            const file = await fileHandle.getFile()
            stalenessWarning = checkFileStaleness(context, resolvedPath, file.lastModified)
          }
        }
      } catch {
        // Staleness check is best-effort — proceed with write if it fails
      }
    }

    let isNew = false
    let pendingCount = 0
    let status: 'pending' | 'saved' = 'saved'
    let message = ''

    const buildMeta = (extra?: Record<string, unknown>) => ({
      ...(stalenessWarning ? { _warning: stalenessWarning } : {}),
      ...extra,
    })

    // ── Pre-write: determine isNew for non-workspace backends ──
    const source = target.backend.label
    if (source !== 'workspace') {
      isNew = !(await target.backend.exists?.(target.path) ?? true)
    }

    // ── Unified backend write ──
    await target.backend.writeFile(target.path, content)

    // Collect asset metadata for assets backend (so UI shows AssetCard)
    if (source === 'assets') {
      collectAssetsFromWrite(target.path, content.length, isNew, context.workspaceId)
    }

    // Post-write metadata: workspace needs pending tracking
    if (source === 'workspace') {
      const pendingChanges = getPendingChanges()
      pendingCount = pendingChanges.length
      const pendingType = getPendingWriteTypeForPath(pendingChanges, target.path)
      const wasCachedBeforeWrite = hasCachedFile(target.path)
      isNew = pendingType ? pendingType === 'create' : !wasCachedBeforeWrite
      status = 'pending'
      message = isNew
        ? `File "${path}" created. ${pendingCount} change(s) pending review.`
        : `File "${path}" updated. ${pendingCount} change(s) pending review.`
    } else {
      // Agent / Assets backends: isNew was already determined before write
      pendingCount = getPendingChanges().length
      status = 'saved'
      message = isNew ? `File "${path}" created.` : `File "${path}" updated.`
    }

    const session = useRemoteStore.getState().session
    if (session) {
      const preview = isNew ? `New file: ${path}` : `Modified: ${path} (${content.length} bytes)`
      session.broadcastFileChange(path, isNew ? 'create' : 'modify', preview)
    }

    // Refresh timestamp after successful write to avoid false staleness on consecutive edits
    refreshReadTimestamp(context, resolvedPath, Date.now())

    return toolOkJson(
      'write',
      {
        path,
        action: isNew ? 'create' : 'modify',
        size: content.length,
        status,
        pendingCount,
        message,
      },
      buildMeta()
    )
  } catch (error) {
    return toolErrorJson(
      'write',
      'internal_error',
      `Failed to write file: ${formatToolErrorMessage(error)}`,
      { retryable: true }
    )
  }
}

//-----------------------------------------------------------------------------
// Prompt doc
//-----------------------------------------------------------------------------

export const writePromptDoc: ToolPromptDoc = {
  category: 'file-ops',
  section: '### File Operations',
  lines: [
    '- `write(path, content)` - Create new files or completely replace a file (supports `vfs://workspace/...`, `vfs://agents/{id}/...`)',
  ],
}

/**
 * Collect an asset generated by write/edit into the conversation store.
 * This mirrors the snapshot-diff logic in execute.tool.ts but works
 * for direct vfs://assets/ writes where we already know the file details.
 */
export function collectAssetsFromWrite(
  assetPath: string,
  size: number,
  isNew: boolean,
  contextWorkspaceId?: string | null,
): void {
  // Only collect for new files to avoid duplicate entries on edits
  if (!isNew) return

  const fileName = assetPath.split('/').pop() || assetPath
  const asset: AssetMeta = {
    id: crypto.randomUUID(),
    name: fileName,
    size,
    mimeType: inferMimeType(fileName),
    direction: 'generated',
    createdAt: Date.now(),
  }

  // Prefer the workspace ID from the tool context (correct for parallel/subagent scenarios)
  // Do NOT fall back to the global activeConversationId — if context doesn't have one,
  // we simply skip asset collection rather than risk attaching to the wrong conversation.
  const targetId = contextWorkspaceId
  if (targetId) {
    useConversationStore.getState().collectAssets(targetId, [asset])
  }
}
