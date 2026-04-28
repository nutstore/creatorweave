/**
 * delete tool - Soft delete file(s) through OPFS pending pipeline.
 *
 * This tool does NOT delete files from native filesystem immediately.
 * It marks files as pending deletion in OPFS workspace. Actual deletion
 * happens when user triggers sync-to-disk.
 */

import type { ToolDefinition, ToolExecutor } from './tool-types'
import { useOPFSStore } from '@/store/opfs.store'
import { useRemoteStore } from '@/store/remote.store'
import { isProtectedAgentCoreFile, resolveVfsTarget, withVfsAgentIdHint } from './vfs-resolver'

export const deleteDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'delete',
    description:
      'Soft delete file(s). Marks files as pending deletion in OPFS workspace. ' +
      'Use path for single file, or paths for batch. ' +
      'IMPORTANT: Files are not removed from real disk until sync is executed. ' +
      'Supports vfs://workspace/..., vfs://agents/{id}/..., and vfs://assets/... paths.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Single file path to delete (soft delete)',
        },
        paths: {
          type: 'array',
          description: 'Multiple file paths to delete (batch soft delete)',
          items: { type: 'string' },
        },
        dry_run: {
          type: 'boolean',
          description: 'Preview deletion targets without marking pending changes. Default: false',
          default: false,
        },
      },
    },
  },
}

function normalizeTargetPath(raw: string): string {
  const normalized = raw.trim().replace(/\\/g, '/').replace(/^\.\//, '')
  if (!normalized) throw new Error('Path cannot be empty')

  if (normalized.startsWith('vfs://')) {
    const suffix = normalized.slice('vfs://'.length)
    const parts = suffix.split('/').filter(Boolean)
    if (parts.some((part) => part === '..')) {
      throw new Error('Path cannot include ".."')
    }
    return `vfs://${parts.join('/')}`
  }

  const parts = normalized.split('/').filter(Boolean)
  if (parts.some((part) => part === '..')) {
    throw new Error('Path cannot include ".."')
  }
  return parts.join('/')
}

function dedupePaths(rawPaths: string[]): string[] {
  const unique = new Set<string>()
  for (const raw of rawPaths) {
    const normalized = normalizeTargetPath(raw)
    unique.add(normalized)
  }
  return Array.from(unique)
}

export const deleteExecutor: ToolExecutor = async (args, context) => {
  const path = args.path as string | undefined
  const paths = args.paths as string[] | undefined
  const dryRun = args.dry_run === true

  const requestedTargets = paths && Array.isArray(paths) && paths.length > 0 ? paths : path ? [path] : []

  if (requestedTargets.length === 0) {
    return JSON.stringify({ error: 'Either path or paths must be provided' })
  }

  let targets: string[]
  try {
    targets = dedupePaths(requestedTargets)
  } catch (error) {
    return JSON.stringify({
      error: `Invalid path: ${error instanceof Error ? error.message : String(error)}`,
    })
  }

  if (dryRun) {
    return JSON.stringify({
      success: true,
      dryRun: true,
      total: targets.length,
      targets,
      message: `Dry run: ${targets.length} file(s) would be marked for deletion.`,
    })
  }

  const deleted: string[] = []
  const failed: Array<{ path: string; error: string }> = []

  for (const target of targets) {
    try {
      const resolved = await resolveVfsTarget(target, context, 'delete')

      if (resolved.kind === 'agent' && isProtectedAgentCoreFile(resolved.path)) {
        throw new Error(`Protected agent file cannot be deleted: ${resolved.path}`)
      }

      await resolved.backend.deleteFile(resolved.path)

      const session = useRemoteStore.getState().session
      if (session) {
        session.broadcastFileChange(target, 'delete', `Deleted: ${target}`)
      }

      deleted.push(target)
    } catch (error) {
      failed.push({
        path: target,
        error: withVfsAgentIdHint(error instanceof Error ? error.message : String(error)),
      })
    }
  }

  const pendingChanges = useOPFSStore.getState().getPendingChanges()

  return JSON.stringify({
    success: failed.length === 0,
    total: targets.length,
    deleted,
    failed,
    status: 'pending',
    pendingCount: pendingChanges.length,
    message:
      failed.length === 0
        ? `${deleted.length} file(s) marked for deletion. ${pendingChanges.length} change(s) pending review.`
        : `${deleted.length} file(s) marked for deletion, ${failed.length} failed. ${pendingChanges.length} change(s) pending review.`,
  })
}
