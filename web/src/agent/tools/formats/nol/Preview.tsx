/**
 * NolPreview - Render .nol outline notes as an interactive tree view.
 *
 * .nol files are ZIP archives containing a `data` JSON file with:
 *   - rootNodeIds: string[]
 *   - nodes: Record<string, { content, childrenIds, ... }>
 *   - media/: optional embedded images
 *
 * This component unzips the blob, parses the node tree,
 * and renders a collapsible outline with indentation.
 */

import { useState, useEffect, Fragment, useCallback, useMemo } from 'react'
import { ChevronRight, ChevronDown, Check, FileText, Image, List, Minus } from 'lucide-react'
import { formatBytes } from '@/lib/utils'

// ── Types ──────────────────────────────────────────────────────────────────

interface NolNode {
  id: string
  content: string
  childrenIds: string[]
  expanded?: number
  completed?: number
  images?: Array<{
    type: string
    data?: {
      relativePath?: string
      bundled?: boolean
      src?: string
    }
    width?: number
  }>
}

interface NolData {
  version?: number
  nodes: Record<string, NolNode>
  rootNodeIds: string[]
}

// ── HTML content rendering ─────────────────────────────────────────────────

/**
 * Render node content as HTML, splitting on <br> tags to preserve line breaks
 * while rendering inline formatting (bold, italic, color, etc.) via
 * dangerouslySetInnerHTML.
 */
function renderHtmlContent(html: string): React.ReactNode[] {
  const parts = html.split(/<br\s*\/?>/gi)
  return parts.map((part, i) => (
    <Fragment key={i}>
      {i > 0 && <br />}
      <span dangerouslySetInnerHTML={{ __html: part || '&nbsp;' }} />
    </Fragment>
  ))
}

// ── Zip entry extraction (using fflate) ────────────────────────────────────

async function unzipNol(blob: Blob): Promise<{
  data: NolData
  mediaFiles: string[]
  mediaData: Record<string, Uint8Array>
  totalEntries: number
}> {
  const { unzipSync } = await import('fflate')
  const buffer = new Uint8Array(await blob.arrayBuffer())
  const entries = unzipSync(buffer)

  const mediaFiles: string[] = []
  const mediaData: Record<string, Uint8Array> = {}
  let data: NolData | null = null

  for (const [name, content] of Object.entries(entries)) {
    if (name.endsWith('/')) continue
    if (name === 'data') {
      const raw = new TextDecoder('utf-8', { fatal: false }).decode(content)
      data = JSON.parse(raw)
    } else if (name.startsWith('media/')) {
      mediaFiles.push(name)
      mediaData[name] = content
    }
  }

  if (!data || !data.nodes || !data.rootNodeIds) {
    throw new Error('Invalid .nol file: missing data/nodes/rootNodeIds')
  }

  return { data, mediaFiles, mediaData, totalEntries: Object.keys(entries).length }
}

// ── Indent guide ───────────────────────────────────────────────────────────

/** Vertical guide line for each indent level */
function IndentGuides({ depth }: { depth: number }) {
  if (depth === 0) return null
  return (
    <span className="flex shrink-0" style={{ width: `${depth * 20}px` }}>
      {Array.from({ length: depth }, (_, i) => (
        <span
          key={i}
          className="inline-block h-full w-5 border-l border-neutral-100 dark:border-neutral-800"
        />
      ))}
    </span>
  )
}

// ── Lightbox overlay ───────────────────────────────────────────────────────

function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/80 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div className="flex items-center justify-between bg-black/40 px-4 py-3 text-white">
        <span className="truncate pr-3 text-sm">Image Preview</span>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-white/30 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-white/10"
        >
          Close
        </button>
      </div>
      <div
        className="flex flex-1 items-center justify-center p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <img src={src} alt="Preview" className="max-h-full max-w-full rounded-md object-contain shadow-2xl" />
      </div>
    </div>
  )
}

// ── Node Tree Item ─────────────────────────────────────────────────────────

interface TreeNodeProps {
  node: NolNode
  allNodes: Record<string, NolNode>
  depth: number
  defaultExpanded: boolean
  imageUrls: Record<string, string>
  isRoot: boolean
  onImageClick?: (url: string) => void
}

function TreeNode({ node, allNodes, depth, defaultExpanded, imageUrls, isRoot, onImageClick }: TreeNodeProps) {
  const [collapsed, setCollapsed] = useState(!defaultExpanded)
  const hasChildren = node.childrenIds && node.childrenIds.length > 0
  const isCompleted = node.completed === 1

  const nodeImages: string[] = useMemo(() => {
    if (!node.images) return []
    return node.images
      .map((img) => {
        const relPath = img.data?.relativePath
        if (!relPath) return null
        const mediaPath = relPath.replace(/^\.\.\//, '')
        return imageUrls[mediaPath] ?? null
      })
      .filter((url): url is string => url !== null)
  }, [node.images, imageUrls])

  const toggle = useCallback(() => setCollapsed((c) => !c), [])

  // Root node: render as a prominent header
  if (isRoot) {
    return (
      <li className="select-none">
        <div className="border-b border-neutral-100 px-4 py-3 dark:border-neutral-800">
          <div className="flex items-center gap-2">
            <List className="h-4 w-4 shrink-0 text-blue-500 dark:text-blue-400" />
            <h2 className="min-w-0 flex-1 text-sm font-semibold leading-snug text-neutral-900 dark:text-neutral-100">
              {renderHtmlContent(node.content || 'Untitled')}
            </h2>
            {hasChildren && (
              <button
                type="button"
                onClick={toggle}
                className="rounded p-0.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
              >
                {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </button>
            )}
          </div>
          {nodeImages.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {nodeImages.map((url, i) => (
                <img
                  key={i}
                  src={url}
                  alt={`image-${i}`}
                  onClick={() => onImageClick?.(url)}
                  className="max-h-40 cursor-zoom-in rounded-md border border-neutral-200 object-contain shadow-sm transition-shadow hover:shadow-md dark:border-neutral-700"
                />
              ))}
            </div>
          )}
        </div>

        {hasChildren && !collapsed && (
          <ul className="m-0 list-none p-0">
            {node.childrenIds.map((childId) => {
              const child = allNodes[childId]
              if (!child) return null
              return (
                <TreeNode
                  key={childId}
                  node={child}
                  allNodes={allNodes}
                  depth={0}
                  defaultExpanded={defaultExpanded}
                  imageUrls={imageUrls}
                  isRoot={false}
                  onImageClick={onImageClick}
                />
              )
            })}
          </ul>
        )}
      </li>
    )
  }

  // Non-root nodes: tree items with indent guides
  const isParent = hasChildren

  return (
    <li className="select-none">
      <div
        className={`
          group flex items-start gap-1.5 rounded-md px-2 py-1
          transition-colors duration-75
          hover:bg-neutral-50 dark:hover:bg-neutral-800/50
          ${isParent ? 'cursor-default' : ''}
        `}
      >
        {/* Indent guides */}
        <IndentGuides depth={depth} />

        {/* Toggle button */}
        <button
          type="button"
          className={`
            mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded
            transition-colors duration-75
            ${hasChildren
              ? 'text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 dark:text-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-neutral-300'
              : 'text-transparent'
            }
          `}
          onClick={toggle}
          tabIndex={hasChildren ? 0 : -1}
        >
          {hasChildren ? (
            collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
          ) : (
            <span className="h-3 w-3" />
          )}
        </button>

        {/* Status icon */}
        {isCompleted ? (
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
            <Check className="h-3.5 w-3.5 text-emerald-500" />
          </span>
        ) : isParent ? (
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
            <Minus className="h-3 w-3 text-neutral-300 dark:text-neutral-600" />
          </span>
        ) : (
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
            <span className="h-1 w-1 rounded-full bg-neutral-300 dark:bg-neutral-600" />
          </span>
        )}

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className={`
            text-[13px] leading-relaxed
            ${isParent
              ? 'font-medium text-neutral-900 dark:text-neutral-100'
              : 'text-neutral-700 dark:text-neutral-300'
            }
            ${isCompleted ? 'text-neutral-400 line-through dark:text-neutral-500' : ''}
          `}>
            {renderHtmlContent(node.content || '')}
          </div>
          {nodeImages.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-2">
              {nodeImages.map((url, i) => (
                <img
                  key={i}
                  src={url}
                  alt={`image-${i}`}
                  onClick={() => onImageClick?.(url)}
                  className="max-h-36 max-w-[240px] cursor-zoom-in rounded-md border border-neutral-200 object-contain shadow-sm transition-shadow hover:shadow-md dark:border-neutral-700"
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {hasChildren && !collapsed && (
        <ul className="m-0 list-none p-0">
          {node.childrenIds.map((childId) => {
            const child = allNodes[childId]
            if (!child) return null
            return (
              <TreeNode
                key={childId}
                node={child}
                allNodes={allNodes}
                depth={depth + 1}
                defaultExpanded={defaultExpanded}
                imageUrls={imageUrls}
                isRoot={false}
                onImageClick={onImageClick}
              />
            )
          })}
        </ul>
      )}
    </li>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────

export function NolPreview({ blob, fileName, fileSize }: { blob: Blob; fileName: string; fileSize: number }) {
  const [data, setData] = useState<NolData | null>(null)
  const [mediaFiles, setMediaFiles] = useState<string[]>([])
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({})
  const [totalEntries, setTotalEntries] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandAll, setExpandAll] = useState(false)
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)

  const handleImageClick = useCallback((url: string) => {
    setLightboxSrc(url)
  }, [])

  useEffect(() => {
    let cancelled = false
    const createdUrls: string[] = []

    unzipNol(blob)
      .then((result) => {
        if (cancelled) return
        setData(result.data)
        setMediaFiles(result.mediaFiles)
        setTotalEntries(result.totalEntries)

        const urls: Record<string, string> = {}
        for (const [path, content] of Object.entries(result.mediaData)) {
          const ext = path.split('.').pop()?.toLowerCase() ?? ''
          const mimes: Record<string, string> = {
            jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
            gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
            bmp: 'image/bmp', ico: 'image/x-icon',
          }
          const mime = mimes[ext] ?? 'application/octet-stream'
          const blobUrl = URL.createObjectURL(new Blob([content], { type: mime }))
          urls[path] = blobUrl
          createdUrls.push(blobUrl)
        }
        setImageUrls(urls)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
      for (const url of createdUrls) {
        URL.revokeObjectURL(url)
      }
    }
  }, [blob])

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-neutral-200 border-t-blue-500" />
          <p className="text-xs text-neutral-400">Loading outline...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-50 dark:bg-red-950/30">
          <FileText className="h-5 w-5 text-red-400" />
        </div>
        <div className="text-center">
          <p className="text-xs font-medium text-red-600 dark:text-red-400">Failed to load outline</p>
          <p className="mt-0.5 text-[11px] text-neutral-400">{error}</p>
        </div>
      </div>
    )
  }

  if (!data) return null

  const nodeCount = Object.keys(data.nodes).length

  return (
    <div className="flex h-full flex-col bg-white dark:bg-neutral-950">
      {/* Header bar */}
      <div className="flex items-center gap-3 border-b border-neutral-100 px-4 py-2 dark:border-neutral-800">
        <div className="flex items-center gap-1.5">
          <List className="h-3.5 w-3.5 text-neutral-400" />
          <span className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">Outline</span>
        </div>

        <span className="text-[10px] text-neutral-300 dark:text-neutral-700">|</span>

        <span className="text-[10px] tabular-nums text-neutral-400">
          {nodeCount} nodes · {formatBytes(fileSize)}
        </span>

        {mediaFiles.length > 0 && (
          <>
            <span className="text-[10px] text-neutral-300 dark:text-neutral-700">·</span>
            <span className="flex items-center gap-0.5 text-[10px] text-neutral-400">
              <Image className="h-2.5 w-2.5" />
              {mediaFiles.length}
            </span>
          </>
        )}

        <div className="flex-1" />

        <button
          type="button"
          onClick={() => setExpandAll(!expandAll)}
          className={`
            rounded-md px-2 py-1 text-[10px] font-medium
            transition-colors duration-75
            ${expandAll
              ? 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300'
              : 'text-neutral-400 hover:bg-neutral-50 hover:text-neutral-600 dark:text-neutral-500 dark:hover:bg-neutral-800/50 dark:hover:text-neutral-300'
            }
          `}
        >
          {expandAll ? 'Collapse' : 'Expand All'}
        </button>
      </div>

      {/* Tree content */}
      <div className="flex-1 overflow-auto py-1">
        <ul className="m-0 list-none p-0">
          {data.rootNodeIds.map((rootId) => {
            const node = data.nodes[rootId]
            if (!node) return null
            return (
              <TreeNode
                key={rootId}
                node={node}
                allNodes={data.nodes}
                depth={0}
                defaultExpanded={expandAll ? true : (node.expanded === 1)}
                imageUrls={imageUrls}
                isRoot={true}
                onImageClick={handleImageClick}
              />
            )
          })}
        </ul>
      </div>

      {/* Image lightbox */}
      {lightboxSrc && (
        <Lightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
      )}
    </div>
  )
}
