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
  /** Delete an asset file by name */
  deleteAsset: (name: string) => Promise<void>
}

export const useAssetInventoryStore = create<AssetInventoryState>((set, get) => ({
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
      const items: AssetInventoryItem[] = []

      // @ts-expect-error entries() is supported in modern browsers
      for await (const entry of assetsDir.values()) {
        if (entry.kind === 'file') {
          const file = await entry.getFile()
          items.push({
            name: entry.name,
            size: file.size,
            lastModified: file.lastModified,
            mimeType: inferMimeType(entry.name),
          })
        }
      }

      // Sort by lastModified descending (newest first)
      items.sort((a, b) => b.lastModified - a.lastModified)

      set({ items, loading: false, loadedWorkspaceId: active.conversationId })
    } catch (err) {
      console.error('[AssetInventory] Failed to scan assets:', err)
      set({ error: String(err), loading: false })
    }
  },

  deleteAsset: async (name: string) => {
    try {
      const active = await getActiveConversation()
      if (!active) return

      const assetsDir = await active.conversation.getAssetsDir()
      await assetsDir.removeEntry(name)

      // Remove from local state without re-scanning
      set((state) => ({
        items: state.items.filter((item) => item.name !== name),
      }))
    } catch (err) {
      console.error('[AssetInventory] Failed to delete asset:', err)
    }
  },
}))
