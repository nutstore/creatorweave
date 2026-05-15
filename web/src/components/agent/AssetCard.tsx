/**
 * AssetCard — renders a single asset file as a downloadable card.
 * For image assets, shows an inline thumbnail preview.
 *
 * All preview actions delegate to `onPreview` callback so the parent
 * can route them to a shared FilePreview panel.
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import { FileText, Image, Download, X, Eye, Loader2 } from 'lucide-react'
import type { AssetMeta } from '@/types/asset'
import { inferMimeType } from '@/types/asset'
import { getActiveConversation } from '@/store/conversation-context.store'
import { useT } from '@/i18n'

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Check if a MIME type is an image */
function isImageMime(mime: string): boolean {
  return mime.startsWith('image/')
}

/** Format file size for display */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Read an asset file from OPFS and return a Blob.
 * Returns null if the file cannot be found or read.
 */
async function readAssetBlob(assetName: string): Promise<Blob | null> {
  try {
    const active = await getActiveConversation()
    if (!active) return null
    const assetsDir = await active.conversation.getAssetsDir()
    const fileHandle = await assetsDir.getFileHandle(assetName)
    const file = await fileHandle.getFile()
    return file
  } catch {
    return null
  }
}

/**
 * Download an asset file by reading it from OPFS and triggering a browser download.
 */
async function downloadAsset(asset: AssetMeta): Promise<void> {
  const blob = await readAssetBlob(asset.name)
  if (!blob) {
    console.error(`[AssetCard] Failed to read asset: ${asset.name}`)
    return
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = asset.name
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/** Icon to show based on MIME type */
function AssetIcon({ mimeType }: { mimeType: string }) {
  if (isImageMime(mimeType)) {
    return <Image className="h-4 w-4 text-blue-500" />
  }
  return <FileText className="h-4 w-4 text-neutral-400" />
}

// ─── AssetCard ──────────────────────────────────────────────────────────────

interface AssetCardProps {
  asset: AssetMeta
  /** Whether to show a compact inline style (for user messages) */
  compact?: boolean
  /** Optional remove callback (for pending uploads) */
  onRemove?: () => void
  /** Open the shared FilePreview drawer with a pre-loaded blob */
  onPreview?: (name: string, blob: Blob) => void
}

export function AssetCard({ asset, compact = false, onRemove, onPreview }: AssetCardProps) {
  const t = useT()
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const mime = asset.mimeType || inferMimeType(asset.name)
  const isImage = isImageMime(mime)

  const imageUrlRef = useRef<string | null>(null)

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (imageUrlRef.current) {
        URL.revokeObjectURL(imageUrlRef.current)
      }
    }
  }, [])

  // Auto-load image thumbnails on mount
  useEffect(() => {
    if (!isImage || imageUrlRef.current) return
    let cancelled = false
    readAssetBlob(asset.name).then((blob) => {
      if (blob && !cancelled) {
        const url = URL.createObjectURL(blob)
        imageUrlRef.current = url
        setImageUrl(url)
      }
    })
    return () => { cancelled = true }
  }, [isImage, asset.name])

  const handlePreview = useCallback(async () => {
    if (loading || !onPreview) return
    setLoading(true)
    try {
      const blob = await readAssetBlob(asset.name)
      if (blob) onPreview(asset.name, blob)
    } finally {
      setLoading(false)
    }
  }, [asset.name, onPreview, loading])

  const handleDownload = useCallback(() => {
    downloadAsset(asset)
  }, [asset])

  if (compact) {
    return (
      <div className="inline-flex items-center gap-1.5 rounded-md bg-neutral-100 px-2 py-1 text-xs text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300">
        <AssetIcon mimeType={mime} />
        <span className="max-w-[120px] truncate">{asset.name}</span>
        <span className="text-neutral-400">({formatFileSize(asset.size)})</span>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="ml-0.5 rounded p-0.5 hover:bg-neutral-200 dark:hover:bg-neutral-600"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="group inline-flex flex-col rounded-lg border border-neutral-200 bg-white shadow-sm dark:border-neutral-700 dark:bg-neutral-800 overflow-hidden max-w-[280px]">
      {/* Image thumbnail — clickable to preview */}
      {isImage && imageUrl && (
        <div
          className="w-full aspect-video bg-neutral-50 dark:bg-neutral-900 overflow-hidden cursor-pointer"
          onClick={onPreview ? handlePreview : undefined}
          role={onPreview ? 'button' : undefined}
          tabIndex={onPreview ? 0 : undefined}
          onKeyDown={(e) => { if (e.key === 'Enter' && onPreview) handlePreview() }}
          title="Click to preview"
        >
          <img
            src={imageUrl}
            alt={asset.name}
            className="w-full h-full object-contain transition-transform hover:scale-105"
            loading="lazy"
          />
        </div>
      )}

      {/* File info row */}
      <div className="flex items-center gap-2 px-3 py-2">
        <AssetIcon mimeType={mime} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-neutral-700 dark:text-neutral-200">
            {asset.name}
          </div>
          <div className="text-xs text-neutral-400">
            {formatFileSize(asset.size)}
            {asset.direction === 'upload' ? ' • uploaded' : ' • generated'}
          </div>
        </div>
        {/* Preview button */}
        {onPreview && (
          <button
            type="button"
            onClick={handlePreview}
            disabled={loading}
            className="rounded-md p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-700 dark:hover:text-neutral-300 disabled:opacity-50"
            title={t('filePreview.preview', { defaultValue: 'Preview' })}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
        )}
        <button
          type="button"
          onClick={handleDownload}
          className="rounded-md p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-700 dark:hover:text-neutral-300"
          title="Download"
        >
          <Download className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

/** Render a list of assets as cards */
export function AssetList({ assets, compact, onPreview }: { assets: AssetMeta[]; compact?: boolean; onPreview?: (name: string, blob: Blob) => void }) {
  if (!assets || assets.length === 0) return null
  return (
    <div className="flex flex-wrap gap-2">
      {assets.map((asset) => (
        <AssetCard key={asset.id} asset={asset} compact={compact} onPreview={onPreview} />
      ))}
    </div>
  )
}

/**
 * AssetCompactList — compact one-line-per-file list for agent-generated assets.
 * Images get a small thumbnail; clicking opens preview via onPreview callback.
 * Collapses when there are more than 3 files.
 */
export function AssetCompactList({ assets, onPreview }: { assets: AssetMeta[]; onPreview?: (name: string, blob: Blob) => void }) {
  if (!assets || assets.length === 0) return null

  const FOLD_THRESHOLD = 3
  const [expanded, setExpanded] = useState(false)
  const needsFold = assets.length > FOLD_THRESHOLD
  const visibleAssets = (needsFold && !expanded) ? assets.slice(0, FOLD_THRESHOLD) : assets
  const hiddenCount = assets.length - FOLD_THRESHOLD

  return (
    <div className="rounded-lg border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-800 overflow-hidden divide-y divide-neutral-100 dark:divide-neutral-700">
      {visibleAssets.map((asset) => (
        <AssetCompactRow key={asset.id} asset={asset} onPreview={onPreview} />
      ))}
      {needsFold && !expanded && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="w-full px-3 py-1.5 text-xs text-neutral-500 hover:bg-neutral-50 hover:text-neutral-700 dark:hover:bg-neutral-700/50 dark:hover:text-neutral-300 transition-colors"
        >
          展开剩余 {hiddenCount} 个文件 ▾
        </button>
      )}
      {needsFold && expanded && (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="w-full px-3 py-1.5 text-xs text-neutral-500 hover:bg-neutral-50 hover:text-neutral-700 dark:hover:bg-neutral-700/50 dark:hover:text-neutral-300 transition-colors"
        >
          收起 ▴
        </button>
      )}
    </div>
  )
}

/** Single row in the compact list */
function AssetCompactRow({ asset, onPreview }: { asset: AssetMeta; onPreview?: (name: string, blob: Blob) => void }) {
  const t = useT()
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const mime = asset.mimeType || inferMimeType(asset.name)
  const isImage = isImageMime(mime)

  // Load thumbnail for images
  useEffect(() => {
    if (!isImage) return
    let cancelled = false
    readAssetBlob(asset.name).then((blob) => {
      if (blob && !cancelled) {
        setImageUrl(URL.createObjectURL(blob))
      }
    })
    return () => { cancelled = true }
  }, [isImage, asset.name])

  const handleDownload = useCallback(() => {
    downloadAsset(asset)
  }, [asset])

  const handlePreview = useCallback(async () => {
    if (loading || !onPreview) return
    setLoading(true)
    try {
      const blob = await readAssetBlob(asset.name)
      if (blob) onPreview(asset.name, blob)
    } finally {
      setLoading(false)
    }
  }, [asset.name, onPreview, loading])

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-700/50">
      {/* Thumbnail or icon */}
      {isImage && imageUrl ? (
        <button
          type="button"
          onClick={onPreview ? handlePreview : undefined}
          className="flex-shrink-0 h-6 w-6 rounded overflow-hidden bg-neutral-100 dark:bg-neutral-900 cursor-pointer"
        >
          <img src={imageUrl} alt={asset.name} className="h-full w-full object-cover" />
        </button>
      ) : (
        <span className="flex-shrink-0">
          <AssetIcon mimeType={mime} />
        </span>
      )}

      {/* File name + size */}
      <span className="min-w-0 flex-1 truncate text-neutral-700 dark:text-neutral-200">
        {asset.name}
      </span>
      <span className="flex-shrink-0 text-xs text-neutral-400">
        {formatFileSize(asset.size)}
      </span>

      {/* Preview button */}
      {onPreview && (
        <button
          type="button"
          onClick={handlePreview}
          disabled={loading}
          className="flex-shrink-0 rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-600 dark:hover:text-neutral-300 disabled:opacity-50"
          title={t('filePreview.preview', { defaultValue: 'Preview' })}
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Eye className="h-3.5 w-3.5" />
          )}
        </button>
      )}

      {/* Download button */}
      <button
        type="button"
        onClick={handleDownload}
        className="flex-shrink-0 rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-600 dark:hover:text-neutral-300"
        title="Download"
      >
        <Download className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
