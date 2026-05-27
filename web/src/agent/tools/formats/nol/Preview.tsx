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

import { useState, useEffect, Fragment } from 'react'
import { ChevronRight, ChevronDown, Check, Circle, FileText } from 'lucide-react'
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

// ── Node Tree Item ─────────────────────────────────────────────────────────

interface TreeNodeProps {
  node: NolNode
  allNodes: Record<string, NolNode>
  depth: number
  defaultExpanded: boolean
  imageUrls: Record<string, string>
}

function TreeNode({ node, allNodes, depth, defaultExpanded, imageUrls }: TreeNodeProps) {
  const [collapsed, setCollapsed] = useState(!defaultExpanded && depth > 1)
  const hasChildren = node.childrenIds && node.childrenIds.length > 0
  const isCompleted = node.completed === 1

  const nodeImages: string[] = []
  if (node.images) {
    for (const img of node.images) {
      const relPath = img.data?.relativePath
      if (relPath) {
        const mediaPath = relPath.replace(/^\.\.\//, '')
        const url = imageUrls[mediaPath]
        if (url) nodeImages.push(url)
      }
    }
  }

  return (
    <li className="select-none">
      <div
        className="group flex items-start gap-1 rounded-sm px-1 py-0.5 hover:bg-neutral-100 dark:hover:bg-neutral-800/60"
        style={{ paddingLeft: `${depth * 20 + 4}px` }}
      >
        <button
          type="button"
          className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded text-neutral-400 hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300"
          onClick={() => setCollapsed(!collapsed)}
          style={{ visibility: hasChildren ? 'visible' : 'hidden' }}
        >
          {collapsed
            ? <ChevronRight className="h-3 w-3" />
            : <ChevronDown className="h-3 w-3" />
          }
        </button>

        {isCompleted ? (
          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-500" />
        ) : hasChildren ? (
          <Circle className="mt-0.5 h-3 w-3 shrink-0 text-neutral-300 dark:text-neutral-600" />
        ) : (
          <span className="mt-0.5 h-3.5 w-3.5 shrink-0 text-neutral-300 dark:text-neutral-600">•</span>
        )}

        <div className="min-w-0 flex-1 text-[13px] leading-snug text-neutral-800 dark:text-neutral-200">
          {renderHtmlContent(node.content || '')}
          {nodeImages.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1.5">
              {nodeImages.map((url, i) => (
                <img
                  key={i}
                  src={url}
                  alt={`image-${i}`}
                  className="max-h-32 max-w-[200px] rounded border border-neutral-200 object-contain dark:border-neutral-700"
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
        <p className="text-xs text-neutral-400">Loading outline...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-4">
        <FileText className="h-8 w-8 text-red-300" />
        <p className="text-xs text-red-500">{error}</p>
      </div>
    )
  }

  if (!data) return null

  const nodeCount = Object.keys(data.nodes).length

  return (
    <div className="flex h-full flex-col bg-white dark:bg-neutral-950">
      <div className="flex items-center gap-2 border-b border-neutral-100 px-4 py-2 dark:border-neutral-800">
        <span className="text-[10px] text-neutral-400">
          {nodeCount} nodes · {formatBytes(fileSize)}
        </span>
        {mediaFiles.length > 0 && (
          <span className="text-[10px] text-neutral-400">
            · {mediaFiles.length} media
          </span>
        )}
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setExpandAll(!expandAll)}
          className="rounded px-1.5 py-0.5 text-[10px] text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 dark:text-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
        >
          {expandAll ? 'Collapse All' : 'Expand All'}
        </button>
      </div>

      <div className="flex-1 overflow-auto py-2">
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
              />
            )
          })}
        </ul>
      </div>
    </div>
  )
}
