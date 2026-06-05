/**
 * Shared OPFS asset utilities for reading and downloading files
 * from the conversation's assets directory.
 */

import { getActiveConversation } from '@/store/conversation-context.store'

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
