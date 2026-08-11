/**
 * FlowStepBar — horizontal execution step indicator.
 *
 * Shows nodes grouped by execution layer (L0→L1→L2...), like a wizard.
 * Click a node to select it in the canvas. Parallel nodes shown side-by-side
 * within their layer. Loop edges shown as a badge on the source node.
 *
 * Displayed as a thin bar at the top of the canvas area.
 */

import { useMemo } from 'react'
import {
  FileInput, Wrench, Sparkles, ShieldCheck, CornerDownRight,
  CheckCircle2, XCircle, Loader2, Zap, RotateCcw, GitBranch,
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

interface FlowStepBarProps {
  selectedId: string | null
  onSelectNode: (nodeId: string) => void
}

export function FlowStepBar({ selectedId, onSelectNode }: FlowStepBarProps) {
  const activeInstance = useFlowStore((s) => s.activeInstance)
  const nodeStatuses = useFlowStore((s) => s.nodeStatuses)

  const layers = useMemo(() => {
    if (!activeInstance) return []
    return computeLayers(activeInstance.nodes, activeInstance.edges)
  }, [activeInstance?.nodes, activeInstance?.edges])

  // Collect loop sources
  const loopSources = useMemo(() => {
    if (!activeInstance) return new Set<string>()
    return new Set(activeInstance.edges.filter((e) => e.isLoop).map((e) => e.from))
  }, [activeInstance?.edges])

  if (!activeInstance || layers.length === 0) return null

  return (
    <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-neutral-100 px-3 py-1.5 dark:border-neutral-800">
      {layers.map((layer, layerIdx) => (
        <div key={layerIdx} className="flex shrink-0 items-center gap-1">
          {/* Arrow between layers */}
          {layerIdx > 0 && (
            <span className="text-neutral-300 dark:text-neutral-600">→</span>
          )}

          {/* Layer nodes */}
          <div className={cn('flex items-center gap-1', layer.length > 1 && 'rounded-md bg-neutral-50 px-1 py-0.5 dark:bg-neutral-800/50')}>
            {layer.length > 1 && (
              <Zap className="h-2.5 w-2.5 shrink-0 text-neutral-400" />
            )}
            {layer.map((node) => {
              const Icon = KIND_ICONS[node.kind]
              const status = nodeStatuses[node.id]
              const selected = selectedId === node.id
              const hasLoop = loopSources.has(node.id)

              return (
                <button
                  key={node.id}
                  onClick={() => onSelectNode(node.id)}
                  className={cn(
                    'flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] transition-colors',
                    selected
                      ? 'bg-neutral-200 font-medium text-neutral-800 dark:bg-neutral-700 dark:text-neutral-100'
                      : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-300'
                  )}
                >
                  {/* Status or kind icon */}
                  {status === 'completed' ? (
                    <CheckCircle2 className="h-2.5 w-2.5 shrink-0 text-neutral-400" />
                  ) : status === 'failed' ? (
                    <XCircle className="h-2.5 w-2.5 shrink-0 text-danger-500" />
                  ) : status === 'running' ? (
                    <Loader2 className="h-2.5 w-2.5 shrink-0 animate-spin text-neutral-500" />
                  ) : (
                    <Icon className="h-2.5 w-2.5 shrink-0 text-neutral-400" />
                  )}
                  <span className="max-w-[80px] truncate">{node.label}</span>
                  {/* Loop badge */}
                  {hasLoop && (
                    <RotateCcw className="h-2 w-2 shrink-0 text-neutral-400" />
                  )}
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Layer computation (same logic as engine's topoSortLayered)
// ---------------------------------------------------------------------------

function computeLayers(nodes: FlowNode[], edges: FlowEdge[]): FlowNode[][] {
  const inDegree = new Map<string, number>()
  const outNeighbors = new Map<string, string[]>()

  for (const node of nodes) {
    inDegree.set(node.id, 0)
    outNeighbors.set(node.id, [])
  }

  for (const edge of edges) {
    if (edge.isLoop) continue
    if (!inDegree.has(edge.to)) continue
    inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1)
    outNeighbors.get(edge.from)?.push(edge.to)
  }

  const layers: FlowNode[][] = []
  const nodeMap = new Map(nodes.map((n) => [n.id, n]))
  let currentIds = nodes
    .filter((n) => (inDegree.get(n.id) ?? 0) === 0)
    .map((n) => n.id)

  if (currentIds.length === 0) currentIds = nodes.map((n) => n.id)

  const placed = new Set<string>()
  while (currentIds.length > 0) {
    const layer = currentIds
      .map((id) => nodeMap.get(id))
      .filter((n): n is FlowNode => !!n)
    layers.push(layer)

    for (const id of currentIds) placed.add(id)

    const next: string[] = []
    for (const id of currentIds) {
      for (const neighbor of outNeighbors.get(id) ?? []) {
        const d = (inDegree.get(neighbor) ?? 0) - 1
        inDegree.set(neighbor, d)
        if (d === 0 && !placed.has(neighbor)) next.push(neighbor)
      }
    }
    currentIds = next
  }

  return layers
}
