/**
 * useSkillsFiles — React hook for reading/writing skill files in OPFS.
 *
 * Wraps SkillsBackend (OPFS `.skills/` directory) with React state management.
 * Used by SkillFileEditor to provide a VSCode-like file tree + editor experience.
 *
 * Path convention: all paths are relative to `.skills/` root, e.g.
 *   "user/my-skill/SKILL.md"
 *   "user/my-skill/scripts/analyze.py"
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { SkillsBackend } from '@/agent/tools/backends/skills-backend'
import type { VfsDirEntry } from '@/agent/tools/vfs-backend'

export interface SkillFileNode {
  name: string
  path: string          // full relative path from .skills/ root
  kind: 'file' | 'directory'
  children?: SkillFileNode[]
  /** Whether children have been loaded (for lazy directory expansion) */
  expanded?: boolean
}

let _backend: SkillsBackend | null = null
function getBackend(): SkillsBackend {
  if (!_backend) _backend = new SkillsBackend()
  return _backend
}

/**
 * Convert flat VfsDirEntry[] to a nested tree structure.
 * Only one level at a time (non-recursive) — children are loaded lazily
 * when a directory is expanded.
 */
function entriesToNodes(entries: VfsDirEntry[]): SkillFileNode[] {
  const dirs = entries.filter((e) => e.kind === 'directory')
  const files = entries.filter((e) => e.kind === 'file')
  // Sort: directories first, then files, alphabetically
  dirs.sort((a, b) => a.name.localeCompare(b.name))
  files.sort((a, b) => a.name.localeCompare(b.name))
  return [
    ...dirs.map((d) => ({ name: d.name, path: d.path, kind: 'directory' as const, children: undefined, expanded: false })),
    ...files.map((f) => ({ name: f.name, path: f.path, kind: 'file' as const })),
  ]
}

export function useSkillsFiles(skillDir: string | null) {
  // skillDir is relative to .skills/ root, e.g. "user/my-skill"
  const [tree, setTree] = useState<SkillFileNode[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Bump to force a full tree reload */
  const reloadToken = useRef(0)

  /** Load the top-level directory listing of the skill */
  const loadTree = useCallback(async () => {
    if (!skillDir) {
      setTree([])
      return
    }
    setLoading(true)
    setError(null)
    try {
      const backend = getBackend()
      const entries = await backend.listDir(skillDir)
      setTree(entriesToNodes(entries))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setTree([])
    } finally {
      setLoading(false)
    }
  }, [skillDir])

  useEffect(() => {
    void loadTree()
  }, [loadTree, reloadToken.current])

  /** Reload the entire tree from scratch */
  const reload = useCallback(() => {
    reloadToken.current++
    void loadTree()
  }, [loadTree])

  /** Load children of a directory node (lazy expansion) */
  const loadChildren = useCallback(async (node: SkillFileNode) => {
    if (node.kind !== 'directory' || node.children !== undefined) return
    try {
      const backend = getBackend()
      const entries = await backend.listDir(node.path)
      const children = entriesToNodes(entries)

      // Update the tree by finding and patching this node
      setTree((prev) => patchNode(prev, node.path, (n) => ({ ...n, children, expanded: true })))
    } catch (e) {
      console.error('[useSkillsFiles] loadChildren failed:', e)
    }
  }, [])

  /** Toggle directory expansion */
  const toggleDirectory = useCallback(async (node: SkillFileNode) => {
    if (node.kind !== 'directory') return
    if (!node.expanded && node.children === undefined) {
      await loadChildren(node)
    } else {
      setTree((prev) => patchNode(prev, node.path, (n) => ({ ...n, expanded: !n.expanded })))
    }
  }, [loadChildren])

  /** Read a file's content */
  const readFile = useCallback(async (path: string): Promise<string> => {
    const backend = getBackend()
    const result = await backend.readFile(path)
    const content = result.content
    return typeof content === 'string' ? content : await new Response(content).text()
  }, [])

  /** Write file content (creates parent directories as needed) */
  const writeFile = useCallback(async (path: string, content: string): Promise<void> => {
    const backend = getBackend()
    await backend.writeFile(path, content)
    // If this is a new file, we need to refresh the tree to show it
    // Check if the file is already in the tree
    const existing = findNode(tree, path)
    if (!existing) {
      reload()
    }
  }, [tree, reload])

  /** Create a new file */
  const createFile = useCallback(async (path: string, content: string = ''): Promise<void> => {
    await writeFile(path, content)
  }, [writeFile])

  /** Delete a file */
  const deleteFile = useCallback(async (path: string): Promise<void> => {
    const backend = getBackend()
    await backend.deleteFile(path)
    reload()
  }, [reload])

  /** Delete a directory */
  const deleteDir = useCallback(async (path: string): Promise<void> => {
    const backend = getBackend()
    await backend.deleteDir(path)
    reload()
  }, [reload])

  /** Check if a path exists */
  const exists = useCallback(async (path: string): Promise<boolean> => {
    const backend = getBackend()
    return backend.exists(path)
  }, [])

  /** Rename / move a file or directory */
  const rename = useCallback(async (oldPath: string, newName: string): Promise<void> => {
    const backend = getBackend()
    // Build new path: replace the last segment of oldPath with newName
    const parts = oldPath.split('/')
    parts[parts.length - 1] = newName
    const newPath = parts.join('/')
    await backend.rename(oldPath, newPath)
    reload()
  }, [reload])

  return {
    tree,
    loading,
    error,
    loadTree,
    reload,
    loadChildren,
    toggleDirectory,
    readFile,
    writeFile,
    createFile,
    deleteFile,
    deleteDir,
    rename,
    exists,
  }
}

// ── Tree manipulation helpers ──────────────────────────────────────────────

/** Find a node by its path in the tree */
function findNode(nodes: SkillFileNode[], targetPath: string): SkillFileNode | null {
  for (const node of nodes) {
    if (node.path === targetPath) return node
    if (node.children) {
      const found = findNode(node.children, targetPath)
      if (found) return found
    }
  }
  return null
}

/** Immutably patch a node by path, returning a new tree */
function patchNode(
  nodes: SkillFileNode[],
  targetPath: string,
  updater: (n: SkillFileNode) => SkillFileNode
): SkillFileNode[] {
  return nodes.map((node) => {
    if (node.path === targetPath) {
      return updater(node)
    }
    if (node.children) {
      return { ...node, children: patchNode(node.children, targetPath, updater) }
    }
    return node
  })
}
