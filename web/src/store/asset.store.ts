/**
 * Asset Upload Store — manages pending file uploads before they are sent.
 *
 * Flow:
 * 1. User selects/drops files → stored as PendingAsset objects
 * 2. UI shows preview bar with thumbnails and remove buttons
 * 3. On send: files are written to OPFS assets/, converted to AssetMeta[],
 *    attached to the user message, then pending state is cleared.
 */

import { create } from 'zustand'

/** A file awaiting upload, held in browser memory. */
export interface PendingAsset {
  /** Unique ID for React keys */
  id: string
  /** Original file name */
  name: string
  /** File size in bytes */
  size: number
  /** MIME type (from File object) */
  mimeType: string
  /** The actual File/Blob data, held in memory until send */
  file: File
  /** Optional object URL for image preview (set lazily) */
  previewUrl?: string
}

interface AssetStore {
  /** Files staged for upload with the next message */
  pendingAssets: PendingAsset[]

  /** Add files from a FileList or File array */
  addFiles: (files: File[]) => void

  /** Remove a pending asset by ID */
  removeAsset: (id: string) => void

  /** Clear all pending assets (called after successful send) */
  clearAll: () => void

  /** Get a preview URL for an asset (creates one lazily for images) */
  getPreviewUrl: (id: string) => string | undefined
}

let nextId = 0
function genId(): string {
  return `pending-${Date.now()}-${++nextId}`
}

/** Check if a MIME type is a previewable image */
function isImageMime(mime: string): boolean {
  return mime.startsWith('image/')
}

export const useAssetStore = create<AssetStore>((set, get) => ({
  pendingAssets: [],

  addFiles: (files: File[]) => {
    const newAssets: PendingAsset[] = files.map((file) => {
      const asset: PendingAsset = {
        id: genId(),
        name: file.name,
        size: file.size,
        mimeType: file.type || 'application/octet-stream',
        file,
      }
      // Eagerly create preview URL for images
      if (isImageMime(asset.mimeType)) {
        asset.previewUrl = URL.createObjectURL(file)
      }
      return asset
    })
    set((state) => ({
      pendingAssets: [...state.pendingAssets, ...newAssets],
    }))
  },

  removeAsset: (id: string) => {
    set((state) => {
      const asset = state.pendingAssets.find((a) => a.id === id)
      if (asset?.previewUrl) {
        URL.revokeObjectURL(asset.previewUrl)
      }
      return {
        pendingAssets: state.pendingAssets.filter((a) => a.id !== id),
      }
    })
  },

  clearAll: () => {
    const { pendingAssets } = get()
    for (const asset of pendingAssets) {
      if (asset.previewUrl) {
        URL.revokeObjectURL(asset.previewUrl)
      }
    }
    set({ pendingAssets: [] })
  },

  getPreviewUrl: (id: string) => {
    return get().pendingAssets.find((a) => a.id === id)?.previewUrl
  },
}))
