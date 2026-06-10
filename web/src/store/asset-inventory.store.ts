/**
 * Asset Inventory Store — scans and lists all files in the OPFS assets/ directory.
 *
 * Used by AssetsPopover to display the current workspace's asset files.
 * Separate from asset.store.ts which only manages pending uploads.
 */

import { create } from 'zustand'
import { getActiveConversation } from './conversation-context.store'
import { inferMimeType } from '@/types/asset'

/** A single asset file discovered in the OPFS assets/ directory */
export interface AssetInventoryItem {
  /** Workspace-relative path under assets (example: "downloads/file.txt") */
  path: string
  /** File name */
  name: string
  /** File size in bytes */
  size: number
  /** File last modified timestamp */
  lastModified: number
  /** MIME type inferred from file extension */
  mimeType: string
}

interface AssetInventoryState {
  /** List of discovered assets */
  items: AssetInventoryItem[]
  /** Whether we are currently scanning */
  loading: boolean
  /** Error message if scan failed */
  error: string | null
  /** Active workspace ID when items were loaded */
  loadedWorkspaceId: string | null

  /** Scan the OPFS assets/ directory and update items */
  refresh: () => Promise<void>
  /** Delete an asset file by relative path */
  deleteAsset: (path: string) => Promise<void>
  /** Delete all asset files */
  clearAll: () => Promise<void>
}

async function scanAssetsRecursively(
  dir: FileSystemDirectoryHandle,
  parentPath = ''
): Promise<AssetInventoryItem[]> {
  const items: AssetInventoryItem[] = []

  for await (const entry of dir.values()) {
    const fullPath = parentPath ? `${parentPath}/${entry.name}` : entry.name
    if (entry.kind === 'file') {
      const file = await entry.getFile()
      items.push({
        path: fullPath,
        name: entry.name,
        size: file.size,
        lastModified: file.lastModified,
        mimeType: inferMimeType(fullPath),
      })
      continue
    }

    if (entry.kind === 'directory') {
      const nested = await scanAssetsRecursively(entry, fullPath)
      items.push(...nested)
    }
  }

  return items
}

async function deleteAssetByPath(
  root: FileSystemDirectoryHandle,
  path: string
): Promise<void> {
  const parts = path.split('/').filter(Boolean)
  const fileName = parts.pop()
  if (!fileName) {
    throw new Error(`Invalid asset path: ${path}`)
  }

  let parent = root
  for (const segment of parts) {
    parent = await parent.getDirectoryHandle(segment)
  }

  await parent.removeEntry(fileName)
}

export const useAssetInventoryStore = create<AssetInventoryState>((set, _get) => ({
  items: [],
  loading: false,
  error: null,
  loadedWorkspaceId: null,

  refresh: async () => {
    set({ loading: true, error: null })
    try {
      const active = await getActiveConversation()
      if (!active) {
        set({ items: [], loading: false, loadedWorkspaceId: null })
        return
      }

      const assetsDir = await active.conversation.getAssetsDir()
      const items = await scanAssetsRecursively(assetsDir)

      // Sort by lastModified descending (newest first)
      items.sort((a, b) => b.lastModified - a.lastModified)

      set({ items, loading: false, loadedWorkspaceId: active.conversationId })
    } catch (err) {
      console.error('[AssetInventory] Failed to scan assets:', err)
      set({ error: String(err), loading: false })
    }
  },

  deleteAsset: async (path: string) => {
    try {
      const active = await getActiveConversation()
      if (!active) return

      const assetsDir = await active.conversation.getAssetsDir()
      await deleteAssetByPath(assetsDir, path)

      // Re-scan after deletion to avoid stale popover state.
      const items = await scanAssetsRecursively(assetsDir)
      items.sort((a, b) => b.lastModified - a.lastModified)
      set({ items })
    } catch (err) {
      console.error('[AssetInventory] Failed to delete asset:', err)
    }
  },

  clearAll: async () => {
    try {
      const active = await getActiveConversation()
      if (!active) return

      const assetsDir = await active.conversation.getAssetsDir()

      // Remove all entries in the root assets directory
      for await (const entry of assetsDir.values()) {
        await assetsDir.removeEntry(entry.name, { recursive: true })
      }

      set({ items: [] })
    } catch (err) {
      console.error('[AssetInventory] Failed to clear assets:', err)
    }
  },
}))
