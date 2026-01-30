/**
 * FileTreePanel - lazily-loaded file tree with expand-on-click.
 * Uses FileSystemDirectoryHandle to list directory contents on demand.
 */

import { useState, useCallback } from 'react'
import { ChevronRight, ChevronDown, File, Folder, FolderOpen, RefreshCw } from 'lucide-react'
import { formatBytes } from '@/lib/utils'

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

/** Single tree node row */
function TreeNodeRow({
  node,
  depth,
  expanded,
  selected,
  onToggle,
  onClick,
}: {
  node: TreeNode
  depth: number
  expanded: boolean
  selected: boolean
  onToggle: () => void
  onClick: () => void
}) {
  const isDir = node.kind === 'directory'
  const indent = depth * 16

  return (
    <div
      className={`flex cursor-pointer items-center gap-1 px-2 py-[3px] text-xs hover:bg-neutral-100 ${
        selected ? 'bg-primary-50 text-primary-700' : 'text-neutral-700'
      }`}
      style={{ paddingLeft: `${indent + 4}px` }}
      onClick={isDir ? onToggle : onClick}
      title={node.path}
    >
      {/* Expand/collapse arrow */}
      {isDir ? (
        <span className="flex h-4 w-4 shrink-0 items-center justify-center">
          {expanded ? (
            <ChevronDown className="h-3 w-3 text-neutral-400" />
          ) : (
            <ChevronRight className="h-3 w-3 text-neutral-400" />
          )}
        </span>
      ) : (
        <span className="h-4 w-4 shrink-0" />
      )}

      {/* Icon */}
      {isDir ? (
        expanded ? (
          <FolderOpen className="h-3.5 w-3.5 shrink-0 text-amber-500" />
        ) : (
          <Folder className="h-3.5 w-3.5 shrink-0 text-amber-500" />
        )
      ) : (
        <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center text-[10px] leading-none">
          {getFileIcon(node.name) || <File className="h-3.5 w-3.5 text-neutral-400" />}
        </span>
      )}

      {/* Name */}
      <span className="min-w-0 truncate">{node.name}</span>

      {/* Size for files */}
      {!isDir && node.size !== undefined && node.size > 0 && (
        <span className="ml-auto shrink-0 text-[10px] text-neutral-400">
          {formatBytes(node.size)}
        </span>
      )}
    </div>
  )
}

/** Recursive tree component */
function TreeBranch({
  nodes,
  depth,
  expandedPaths,
  selectedPath,
  onToggle,
  onFileSelect,
}: {
  nodes: TreeNode[]
  depth: number
  expandedPaths: Set<string>
  selectedPath: string | null
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

        return (
          <div key={node.path}>
            <TreeNodeRow
              node={node}
              depth={depth}
              expanded={expanded}
              selected={selected}
              onToggle={() => onToggle(node)}
              onClick={() => onFileSelect(node)}
            />
            {expanded && node.children && (
              <TreeBranch
                nodes={node.children}
                depth={depth + 1}
                expandedPaths={expandedPaths}
                selectedPath={selectedPath}
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

  /** Load children of a directory handle */
  const loadChildren = useCallback(
    async (dirHandle: FileSystemDirectoryHandle, parentPath: string): Promise<TreeNode[]> => {
      const children: TreeNode[] = []
      for await (const entry of dirHandle.entries()) {
        const [name, handle] = entry
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

  /** Load root directory */
  const loadRoot = useCallback(async () => {
    if (!directoryHandle) return
    setLoading(true)
    try {
      const children = await loadChildren(directoryHandle, '')
      setRootNodes(children)
      setLoaded(true)
    } catch (error) {
      console.error('[FileTree] Failed to load root:', error)
    } finally {
      setLoading(false)
    }
  }, [directoryHandle, loadChildren])

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

  // Auto-load root when directory handle changes
  if (directoryHandle && !loaded && !loading) {
    loadRoot()
  }

  if (!directoryHandle) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <p className="text-center text-xs text-neutral-400">
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
      <div className="flex items-center justify-between border-b border-neutral-200 px-3 py-1.5">
        <span className="truncate text-xs font-medium text-neutral-600">
          {rootName || directoryHandle.name}
        </span>
        <button
          type="button"
          onClick={() => {
            setLoaded(false)
            setExpandedPaths(new Set())
            loadRoot()
          }}
          className="rounded p-0.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
          title="刷新"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto py-1">
        {loading && rootNodes.length === 0 ? (
          <div className="p-3 text-center text-xs text-neutral-400">加载中...</div>
        ) : (
          <TreeBranch
            nodes={rootNodes}
            depth={0}
            expandedPaths={expandedPaths}
            selectedPath={selectedPath || null}
            onToggle={handleToggle}
            onFileSelect={handleFileSelect}
          />
        )}
      </div>
    </div>
  )
}
