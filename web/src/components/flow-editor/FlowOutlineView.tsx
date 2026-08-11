/**
 * FlowOutlineView — tree-style outline view following data-flow edges.
 *
 * Renders nodes as a nested tree starting from entry nodes (no upstream),
 * expanding each branch along outgoing edges. Collapsible per-node.
 * Clicking a node selects it in the editor (shared selectedId).
 */

import { useState, useMemo } from 'react'
import {
  FileInput, Wrench, Sparkles, ShieldCheck, CornerDownRight,
  ChevronRight, ChevronDown, CheckCircle2, XCircle, Loader2,
  Zap, RotateCcw, GitBranch,
} from 'lucide-react'
import { cn } from '@creatorweave/ui'
import { useFlowStore } from '@/store/flow.store'
import type { FlowNode, FlowNodeKind, FlowEdge } from '@/agent/flow/types'

const KIND_ICONS: Record<FlowNodeKind, React.ComponentType<{ className?: string }>> = {
  input: FileInput,
  tool: Wrench,
  llm: Sparkles,
  review: ShieldCheck,
  output: CornerDownRight,
  router: GitBranch,
}

interface FlowOutlineViewProps {
  selectedId: string | null
  onSelectNode: (nodeId: string) => void
}

export function FlowOutlineView({ selectedId, onSelectNode }: FlowOutlineViewProps) {
  const activeInstance = useFlowStore((s) => s.activeInstance)
  const nodeStatuses = useFlowStore((s) => s.nodeStatuses)

  // Build tree structure from edges
  const tree = useMemo(() => {
    if (!activeInstance) return []
    return buildTree(activeInstance.nodes, activeInstance.edges)
  }, [activeInstance?.nodes, activeInstance?.edges])

  if (!activeInstance || activeInstance.nodes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-4">
        <p className="text-center text-[11px] text-neutral-400">没有节点</p>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto py-2">
      {tree.map((root) => (
        <TreeNode
          key={root.node.id}
          item={root}
          level={0}
          selectedId={selectedId}
          onSelectNode={onSelectNode}
          nodeStatuses={nodeStatuses}
          expandedSet={new Set<string>()} // roots always expanded
        />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tree node row
// ---------------------------------------------------------------------------

function TreeNode({
  item,
  level,
  selectedId,
  onSelectNode,
  nodeStatuses,
  expandedSet,
}: {
  item: TreeItem
  level: number
  selectedId: string | null
  onSelectNode: (id: string) => void
  nodeStatuses: Record<string, string>
  expandedSet: Set<string>
}) {
  const hasChildren = item.children.length > 0
  const [collapsed, setCollapsed] = useState(false)

  // Roots and first level always expanded by default
  const defaultExpanded = level < 1 || expandedSet.has(item.node.id)
  const isExpanded = defaultExpanded || !collapsed

  const Icon = KIND_ICONS[item.node.kind]
  const status = nodeStatuses[item.node.id]

  const statusIcon = status === 'completed'
    ? <CheckCircle2 className="h-3 w-3 shrink-0 text-neutral-400" />
    : status === 'failed'
      ? <XCircle className="h-3 w-3 shrink-0 text-danger-500" />
      : status === 'running'
        ? <Loader2 className="h-3 w-3 shrink-0 animate-spin text-neutral-500" />
        : null

  return (
    <>
      <div
        className={cn(
          'group flex cursor-pointer items-center gap-1 rounded px-1 py-0.5 transition-colors',
          selectedId === item.node.id
            ? 'bg-neutral-100 dark:bg-neutral-800'
            : 'hover:bg-neutral-50 dark:hover:bg-neutral-800/50'
        )}
        style={{ paddingLeft: `${level * 14 + 4}px` }}
        onClick={() => onSelectNode(item.node.id)}
      >
        {/* Expand/collapse toggle */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            if (hasChildren) setCollapsed(!collapsed)
          }}
          className="flex h-3.5 w-3.5 shrink-0 items-center justify-center text-neutral-400"
        >
          {hasChildren ? (
            isExpanded
              ? <ChevronDown className="h-3 w-3" />
              : <ChevronRight className="h-3 w-3" />
          ) : (
            <span className="h-1 w-1 rounded-full bg-neutral-300 dark:bg-neutral-600" />
          )}
        </button>

        {/* Kind icon */}
        <Icon className="h-3 w-3 shrink-0 text-neutral-400" />

        {/* Label */}
        <span
          className={cn(
            'min-w-0 flex-1 truncate text-[11px]',
            selectedId === item.node.id
              ? 'font-medium text-neutral-800 dark:text-neutral-100'
              : 'text-neutral-600 dark:text-neutral-300'
          )}
        >
          {item.node.label}
        </span>

        {/* Loop-back badge */}
        {item.loopBackTo && item.loopBackTo.length > 0 && (
          <span className="flex shrink-0 items-center gap-0.5 text-[9px] text-warning" title={`评审不过时重试`}>
            <RotateCcw className="h-2.5 w-2.5" />
            重试
          </span>
        )}

        {/* Status */}
        {statusIcon}
      </div>

      {/* Parallel indicator: shown when children are parallel */}
      {hasChildren && isExpanded && item.childrenParallel && (
        <div
          className="flex items-center gap-1 py-0.5 text-[9px] text-neutral-400"
          style={{ paddingLeft: `${(level + 1) * 14 + 4}px` }}
        >
          <Zap className="h-2.5 w-2.5" />
          并行
        </div>
      )}

      {/* Children */}
      {hasChildren && isExpanded && item.children.map((child) => (
        <TreeNode
          key={child.node.id}
          item={child}
          level={level + 1}
          selectedId={selectedId}
          onSelectNode={onSelectNode}
          nodeStatuses={nodeStatuses}
          expandedSet={expandedSet}
        />
      ))}
    </>
  )
}

// ---------------------------------------------------------------------------
// Tree building — follow edges to create nested structure
// ---------------------------------------------------------------------------

interface TreeItem {
  node: FlowNode
  children: TreeItem[]
  /** True if this node's children (siblings) execute in parallel — i.e. they
   * share the same incoming edge source AND have no inter-dependencies. */
  childrenParallel?: boolean
  /** Loop-back targets: nodeIds this node loops back to (from loop edges). */
  loopBackTo?: string[]
}

function buildTree(nodes: FlowNode[], edges: FlowEdge[]): TreeItem[] {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]))
  const childrenMap = new Map<string, string[]>()
  const hasParent = new Set<string>()
  // Collect loop edges: nodeId → targets it loops back to
  const loopBacks = new Map<string, string[]>()

  for (const node of nodes) {
    childrenMap.set(node.id, [])
  }

  for (const edge of edges) {
    if (!nodeMap.has(edge.from) || !nodeMap.has(edge.to)) continue
    if (edge.isLoop) {
      // Record loop-back relationship
      const existing = loopBacks.get(edge.from) || []
      existing.push(edge.to)
      loopBacks.set(edge.from, existing)
      continue
    }
    childrenMap.get(edge.from)!.push(edge.to)
    hasParent.add(edge.to)
  }

  // Entry nodes = no parent
  const roots = nodes.filter((n) => !hasParent.has(n.id))
  // If no roots (cycle), fall back to all nodes
  const startIds = roots.length > 0 ? roots.map((n) => n.id) : nodes.map((n) => n.id)

  const visited = new Set<string>()

  // Check if siblings are parallel: they have no edges between each other
  function areSiblingsParallel(siblingIds: string[]): boolean {
    if (siblingIds.length < 2) return false
    const idSet = new Set(siblingIds)
    // If any sibling has an edge to another sibling, they're sequential, not parallel
    for (const edge of edges) {
      if (edge.isLoop) continue
      if (idSet.has(edge.from) && idSet.has(edge.to)) return false
    }
    return true
  }

  function buildNode(nodeId: string): TreeItem | null {
    if (visited.has(nodeId)) return null // avoid infinite recursion
    visited.add(nodeId)
    const node = nodeMap.get(nodeId)
    if (!node) return null
    const childIds = childrenMap.get(nodeId) || []
    const children = childIds
      .map((cid) => buildNode(cid))
      .filter((c): c is TreeItem => c !== null)
    return {
      node,
      children,
      childrenParallel: areSiblingsParallel(childIds),
      loopBackTo: loopBacks.get(nodeId),
    }
  }

  return startIds
    .map((id) => buildNode(id))
    .filter((t): t is TreeItem => t !== null)
}
