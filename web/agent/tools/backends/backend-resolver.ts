/**
 * backend-resolver — Lightweight path → backend resolver for write.tool.ts
 *
 * Used by FormatWriteContext.readWorkspaceFile to resolve an arbitrary
 * workspace-relative path into the appropriate VfsBackend + normalized path.
 *
 * This is a simplified subset of vfs-resolver.ts: it only handles workspace
 * files (no agent/assets namespaces) and returns null for unresolvable paths
 * instead of throwing.
 */

import type { VfsBackend } from '../vfs-backend'
import { WorkspaceBackend } from './workspace-backend'

export interface ResolvedBackendPath {
  backend: VfsBackend
  path: string
}

/**
 * Normalize a raw file path to a workspace-relative path.
 * Handles: leading slashes, backslashes, /mnt/ prefix, query strings.
 */
function normalizeWorkspacePath(rawPath: string): string | null {
  const normalized = rawPath.replace(/\\/g, '/').trim()
  const withoutQuery = normalized.split('?')[0]

  // Strip /mnt/ prefix if present
  const withoutMnt = withoutQuery.startsWith('/mnt/')
    ? withoutQuery.slice('/mnt/'.length)
    : withoutQuery === '/mnt'
      ? ''
      : withoutQuery

  const withoutLeading = withoutMnt.replace(/^\/+/, '')
  const parts = withoutLeading.split('/').filter(Boolean)

  if (parts.length === 0) return null
  if (parts.some((part) => part === '.' || part === '..')) return null

  return parts.join('/')
}

/**
 * Resolve a file path to a VfsBackend + normalized path.
 *
 * Returns `{ backend, path }` for workspace files, or `null` if the path
 * cannot be resolved.
 */
export function resolveBackendAndPath(
  filePath: string,
  workspaceId?: string | null,
): ResolvedBackendPath | null {
  // Only handle plain workspace paths (no vfs:// namespace)
  if (filePath.startsWith('vfs://')) return null

  const normalized = normalizeWorkspacePath(filePath)
  if (!normalized) return null

  return {
    backend: new WorkspaceBackend(workspaceId),
    path: normalized,
  }
}
