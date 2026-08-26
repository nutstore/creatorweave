/**
 * Shared OPFS asset utilities for reading and downloading files
 * from the conversation's assets directory, plus fallback resolution
 * for workspace files referenced by relative paths (e.g. markdown images).
 */

import { getActiveConversation } from '@/store/conversation-context.store'
import { getWorkspaceManager } from '@/opfs'
import { useWorkspaceStore } from '@/store/workspace.store'
import { getRuntimeHandlesForProject } from '@/native-fs'

/**
 * Read an asset file from OPFS and return a Blob.
 * Handles nested paths like "images/20260605_a3f2k1.png".
 */
export async function readAssetBlob(assetPath: string): Promise<Blob | null> {
  try {
    const active = await getActiveConversation()
    if (!active) return null
    const assetsDir = await active.conversation.getAssetsDir()
    const parts = assetPath.split('/').filter(Boolean)
    const fileName = parts.pop()
    if (!fileName) return null

    let currentDir = assetsDir
    for (const segment of parts) {
      currentDir = await currentDir.getDirectoryHandle(segment)
    }

    const fileHandle = await currentDir.getFileHandle(fileName)
    const file = await fileHandle.getFile()
    return file
  } catch {
    return null
  }
}

/**
 * Convert an OPFS read result into a Blob (or null on empty/invalid content).
 */
function contentToBlob(content: unknown): Blob | null {
  if (content instanceof Blob) return content
  if (content instanceof ArrayBuffer) return new Blob([content])
  if (typeof content === 'string') return new Blob([content])
  return null
}

/**
 * Try reading a workspace file via the workspace runtime directly
 * (bypassing the OPFS store to avoid noisy `error` state updates when
 * probing multiple candidate paths). Returns null on any error.
 */
async function tryReadWorkspaceFile(path: string): Promise<Blob | null> {
  try {
    const workspaceId = useWorkspaceStore.getState().activeWorkspaceId
    if (!workspaceId) return null
    const manager = await getWorkspaceManager()
    const workspace = await manager.getWorkspace(workspaceId)
    if (!workspace) return null
    const result = await workspace.readFile(path, null, { policy: 'auto' })
    return contentToBlob(result.content)
  } catch {
    return null
  }
}

/**
 * Read a workspace file as a Blob via the workspace runtime.
 *
 * Used as a fallback for markdown images that reference a file by its
 * workspace-relative path (e.g. `![alt](byd_2026_05_sales.png)` or
 * `![alt](creatorweave/byd_2026_05_sales.png)`).
 *
 * Resolution strategy:
 * - If the path's first segment already matches a known rootName, read it
 *   as-is (it's already a fully-qualified workspace path).
 * - Otherwise (bare/relative path with no rootName prefix), prepend each
 *   known rootName in turn and try `rootName/path`. This is necessary
 *   because the runtime requires a rootName prefix in multi-root workspaces.
 *
 * @param path workspace path, optionally prefixed with a rootName
 * @returns Blob if the file exists in the workspace, null otherwise
 */
export async function readWorkspaceFileBlob(path: string): Promise<Blob | null> {
  const normalized = path.replace(/^\/+/, '')
  if (!normalized) return null

  // Enumerate known root names for the active project.
  let rootNames: string[] = []
  try {
    const { getProjectRepository } = await import('@/sqlite/repositories/project.repository')
    const projectId = (await getProjectRepository().findActiveProject())?.id
    if (projectId) {
      rootNames = Array.from(getRuntimeHandlesForProject(projectId).keys())
    }
  } catch {
    // ignore — root enumeration is best-effort
  }

  const firstSegment = normalized.split('/')[0]
  const alreadyPrefixed = rootNames.includes(firstSegment)

  if (alreadyPrefixed) {
    // Path starts with a known rootName — read it directly.
    return await tryReadWorkspaceFile(normalized)
  }

  // No rootName prefix — try each root as `rootName/path`.
  for (const rootName of rootNames) {
    const blob = await tryReadWorkspaceFile(`${rootName}/${normalized}`)
    if (blob) return blob
  }

  return null
}

/**
 * Download an asset file by reading it from OPFS and triggering a browser download.
 */
export async function downloadAssetBlob(assetPath: string, fallbackName: string): Promise<void> {
  const blob = await readAssetBlob(assetPath)
  if (!blob) return
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fallbackName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
