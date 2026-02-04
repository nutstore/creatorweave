/**
 * FileTreePanel - File tree component using brand design system
 *
 * Design Specifications:
 * - Font: text-xs (12px) for tree items
 * - Spacing: py-1.5 (6px vertical padding), px-3 (12px horizontal padding)
 * - Border radius: rounded-md (6px)
 * - Colors: Uses brand semantic colors (primary, secondary, danger, etc.)
 * - Hover state: bg-hover (hsl(var(--bg-hover)))
 * - Selected state: bg-primary-50 text-primary-700
 *
 * Phase 3 Integration:
 * - Shows file modification status from OPFS pending changes
 * - Displays pending indicators (create/modify/delete) next to files
 */

import { useState, useCallback, useEffect, useMemo } from 'react'
import { ChevronRight, ChevronDown, File, Folder, FolderOpen, RefreshCw } from 'lucide-react'
import { BrandButton, BrandBadge } from '@browser-fs-analyzer/ui'
import { formatBytes } from '@/lib/utils'
import { useOPFSStore } from '@/store/opfs.store'
import type { PendingChange } from '@/opfs/types/opfs-types'

/** File tree node */
interface TreeNode {
  name: string
  path: string
  kind: 'file' | 'directory'
  size?: number
  children?: TreeNode[]
  loaded?: boolean
  handle: FileSystemDirectoryHandle | FileSystemFileHandle
}

interface FileTreePanelProps {
  directoryHandle: FileSystemDirectoryHandle | null
  rootName?: string | null
  onFileSelect: (path: string, handle: FileSystemFileHandle) => void
  selectedPath?: string | null
}

/** Icon by file extension */
function getFileIcon(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase()
  const iconMap: Record<string, string> = {
    ts: '🟦',
    tsx: '⚛️',
    js: '🟨',
    jsx: '⚛️',
    rs: '🦀',
    py: '🐍',
    go: '🔵',
    json: '📋',
    md: '📝',
    css: '🎨',
    scss: '🎨',
    html: '🌐',
    svg: '🖼️',
    png: '🖼️',
    jpg: '🖼️',
    toml: '⚙️',
    yaml: '⚙️',
    yml: '⚙️',
    lock: '🔒',
    wasm: '⚡',
  }
  return iconMap[ext || ''] || ''
}

/** Pending status badge using brand badge component */
function PendingIndicator({ type }: { type: PendingChange['type'] | null }) {
  if (!type) return null

  const variantMap = {
    create: 'success' as const,
    modify: 'warning' as const,
    delete: 'error' as const,
  }

  const labelMap = {
    create: '新建',
    modify: '修改',
    delete: '删除',
  }

  return (
    <BrandBadge
      type="badge"
      variant={variantMap[type]}
      shape="pill"
      className="h-4 min-w-4 px-1 text-[10px]"
      title={`待${labelMap[type]}`}
    >
      {labelMap[type][0]}
    </BrandBadge>
  )
}

/** Single tree node row */
function TreeNodeRow({
  node,
  depth,
  expanded,
  selected,
  pendingType,
  onToggle,
  onClick,
}: {
  node: TreeNode
  depth: number
  expanded: boolean
  selected: boolean
  pendingType: PendingChange['type'] | null
  onToggle: () => void
  onClick: () => void
}) {
  const isDir = node.kind === 'directory'
  const indent = depth * 16

  return (
    <div
      className={`group flex cursor-pointer items-center gap-2 rounded-md py-1.5 pr-3 text-xs transition-colors ${
        selected ? 'bg-primary-50 text-primary-700' : 'hover:bg-hover text-secondary'
      }`}
      style={{ paddingLeft: `${indent + 12}px` }}
      onClick={isDir ? onToggle : onClick}
      title={node.path}
    >
      {/* Expand/collapse arrow */}
      {isDir ? (
        <span className="flex h-4 w-4 shrink-0 items-center justify-center">
          {expanded ? (
            <ChevronDown className="text-tertiary h-3.5 w-3.5 transition-transform" />
          ) : (
            <ChevronRight className="text-tertiary h-3.5 w-3.5 transition-transform" />
          )}
        </span>
      ) : (
        <span className="h-4 w-4 shrink-0" />
      )}

      {/* Icon */}
      {isDir ? (
        expanded ? (
          <FolderOpen className="h-3.5 w-3.5 shrink-0 text-warning" />
        ) : (
          <Folder className="h-3.5 w-3.5 shrink-0 text-warning" />
        )
      ) : (
        <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center text-[10px] leading-none">
          {getFileIcon(node.name) || <File className="text-tertiary h-3.5 w-3.5" />}
        </span>
      )}

      {/* Name */}
      <span className="min-w-0 flex-1 truncate font-medium">{node.name}</span>

      {/* Size for files */}
      {!isDir && node.size !== undefined && node.size > 0 && (
        <span className="text-tertiary shrink-0 text-[10px] tabular-nums">
          {formatBytes(node.size)}
        </span>
      )}

      {/* Pending status indicator */}
      {!isDir && <PendingIndicator type={pendingType} />}
    </div>
  )
}

/** Recursive tree component */
function TreeBranch({
  nodes,
  depth,
  expandedPaths,
  selectedPath,
  pendingMap,
  onToggle,
  onFileSelect,
}: {
  nodes: TreeNode[]
  depth: number
  expandedPaths: Set<string>
  selectedPath: string | null
  pendingMap: Map<string, PendingChange['type']>
  onToggle: (node: TreeNode) => void
  onFileSelect: (node: TreeNode) => void
}) {
  // Sort: directories first, then alphabetically
  const sorted = [...nodes].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  return (
    <>
      {sorted.map((node) => {
        const expanded = expandedPaths.has(node.path)
        const selected = selectedPath === node.path
        const pendingType = pendingMap.get(node.path) || null

        return (
          <div key={node.path}>
            <TreeNodeRow
              node={node}
              depth={depth}
              expanded={expanded}
              selected={selected}
              pendingType={pendingType}
              onToggle={() => onToggle(node)}
              onClick={() => onFileSelect(node)}
            />
            {expanded && node.children && (
              <TreeBranch
                nodes={node.children}
                depth={depth + 1}
                expandedPaths={expandedPaths}
                selectedPath={selectedPath}
                pendingMap={pendingMap}
                onToggle={onToggle}
                onFileSelect={onFileSelect}
              />
            )}
          </div>
        )
      })}
    </>
  )
}

export function FileTreePanel({
  directoryHandle,
  rootName,
  onFileSelect,
  selectedPath,
}: FileTreePanelProps) {
  const [rootNodes, setRootNodes] = useState<TreeNode[]>([])
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)

  // Get pending changes from OPFS store
  const pendingChanges = useOPFSStore((state) => state.pendingChanges)

  // Build a map of file paths to pending change types for O(1) lookup
  const pendingMap = useMemo(() => {
    const map = new Map<string, PendingChange['type']>()
    for (const change of pendingChanges) {
      map.set(change.path, change.type)
    }
    return map
  }, [pendingChanges])

  /** Hidden files to exclude from file tree */
  const HIDDEN_PATTERNS = [/^\.DS_Store$/, /^\.AppleDouble$/, /^\.LSOverride$/, /^._/]

  /** Check if a file/directory name should be hidden */
  function isHidden(name: string): boolean {
    return HIDDEN_PATTERNS.some((pattern) => pattern.test(name))
  }

  /** Load children of a directory handle */
  const loadChildren = useCallback(
    async (dirHandle: FileSystemDirectoryHandle, parentPath: string): Promise<TreeNode[]> => {
      const children: TreeNode[] = []
      for await (const entry of dirHandle.entries()) {
        const [name, handle] = entry
        // Skip hidden files like .DS_Store
        if (isHidden(name)) continue
        const path = parentPath ? `${parentPath}/${name}` : name

        if (handle.kind === 'file') {
          const fileHandle = handle as FileSystemFileHandle
          try {
            const file = await fileHandle.getFile()
            children.push({ name, path, kind: 'file', size: file.size, handle: fileHandle })
          } catch {
            children.push({ name, path, kind: 'file', handle: fileHandle })
          }
        } else {
          children.push({
            name,
            path,
            kind: 'directory',
            handle: handle as FileSystemDirectoryHandle,
            children: [],
            loaded: false,
          })
        }
      }
      return children
    },
    []
  )

  /** Load root directory and optionally reload expanded paths */
  const loadRoot = useCallback(
    async (preserveExpanded: boolean = false) => {
      if (!directoryHandle) return
      setLoading(true)
      try {
        const children = await loadChildren(directoryHandle, '')
        setRootNodes(children)
        setLoaded(true)

        // If preserving expanded state, recursively reload all expanded directories
        if (preserveExpanded && expandedPaths.size > 0) {
          const reloadExpanded = async (nodes: TreeNode[]): Promise<void> => {
            for (const node of nodes) {
              if (node.kind === 'directory' && expandedPaths.has(node.path)) {
                try {
                  const childNodes = await loadChildren(
                    node.handle as FileSystemDirectoryHandle,
                    node.path
                  )
                  node.children = childNodes
                  node.loaded = true
                  // Recursively reload nested expanded directories
                  await reloadExpanded(childNodes)
                } catch (error) {
                  console.error(`[FileTree] Failed to reload ${node.path}:`, error)
                }
              }
            }
          }
          await reloadExpanded(children)
          setRootNodes((prev) => [...prev])
        }
      } catch (error) {
        console.error('[FileTree] Failed to load root:', error)
      } finally {
        setLoading(false)
      }
    },
    [directoryHandle, loadChildren, expandedPaths]
  )

  /** Toggle directory expand/collapse */
  const handleToggle = useCallback(
    async (node: TreeNode) => {
      if (node.kind !== 'directory') return

      const isExpanded = expandedPaths.has(node.path)
      const next = new Set(expandedPaths)

      if (isExpanded) {
        next.delete(node.path)
        setExpandedPaths(next)
        return
      }

      // Load children if not yet loaded
      if (!node.loaded) {
        try {
          const children = await loadChildren(node.handle as FileSystemDirectoryHandle, node.path)
          node.children = children
          node.loaded = true
          // Force re-render by creating new array
          setRootNodes((prev) => [...prev])
        } catch (error) {
          console.error(`[FileTree] Failed to load ${node.path}:`, error)
          return
        }
      }

      next.add(node.path)
      setExpandedPaths(next)
    },
    [expandedPaths, loadChildren]
  )

  /** Handle file click */
  const handleFileSelect = useCallback(
    (node: TreeNode) => {
      if (node.kind === 'file') {
        onFileSelect(node.path, node.handle as FileSystemFileHandle)
      }
    },
    [onFileSelect]
  )

  // Reset states when directoryHandle changes
  useEffect(() => {
    if (!directoryHandle) return
    // Reset all states to trigger fresh load
    setLoaded(false)
    setLoading(false)
    setExpandedPaths(new Set())
    setRootNodes([])
  }, [directoryHandle])

  // Auto-load root when directoryHandle is available and not loaded
  useEffect(() => {
    if (directoryHandle && !loaded && !loading) {
      loadRoot()
    }
  }, [directoryHandle, loaded, loading, loadRoot])

  if (!directoryHandle) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <p className="text-tertiary text-center text-xs">
          选择项目文件夹后
          <br />
          文件树将显示在这里
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-subtle flex items-center justify-between border-b px-3 py-2">
        <span className="truncate text-xs font-semibold text-primary">
          {rootName || directoryHandle.name}
        </span>
        <BrandButton iconButton variant="ghost" onClick={() => loadRoot(true)} title="刷新">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
        </BrandButton>
      </div>

      {/* Tree */}
      <div className="custom-scrollbar flex-1 overflow-y-auto">
        <div className="px-2 py-2">
          {loading && rootNodes.length === 0 ? (
            <div className="text-tertiary p-4 text-center text-xs">加载中...</div>
          ) : (
            <TreeBranch
              nodes={rootNodes}
              depth={0}
              expandedPaths={expandedPaths}
              selectedPath={selectedPath || null}
              pendingMap={pendingMap}
              onToggle={handleToggle}
              onFileSelect={handleFileSelect}
            />
          )}
        </div>
      </div>
    </div>
  )
}
