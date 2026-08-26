/**
 * Bidirectional conversion between FlowNode/FlowEdge and React Flow nodes/edges.
 *
 * Uses a zero-dependency layered layout (Kahn's topological sort) instead of
 * dagre. Workflows are layered DAGs — a simple column-per-layer layout is
 * predictable, fast, and has no external dependency.
 */

import type { Node, Edge } from '@xyflow/react'
import type { FlowNode, FlowEdge } from '@/agent/flow/types'

// ---------------------------------------------------------------------------
// Flow data shape stored on each React Flow node
// ---------------------------------------------------------------------------

export interface FlowNodeData {
  kind: FlowNode['kind']
  label: string
  config: FlowNode['config']
  retry?: number
  runStatus?: 'pending' | 'running' | 'completed' | 'failed'
  [key: string]: unknown
}

export type FlowFlowNode = Node<FlowNodeData, 'flowNode'>
export type FlowFlowEdge = Edge

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------

/** Horizontal gap between layers (columns) */
const LAYER_GAP_X = 320
/** Vertical gap between nodes within the same layer */
const NODE_GAP_Y = 140
/** Left margin for the first layer */
const MARGIN_X = 40
/** Top margin */
const MARGIN_Y = 40
/** Max layers per row before wrapping to next row */
const MAX_LAYERS_PER_ROW = 4
/** Vertical gap between wrapped rows */
const ROW_GAP_Y = 80

// ---------------------------------------------------------------------------
// Layered auto-layout (replaces dagre)
// ---------------------------------------------------------------------------

/**
 * Compute positions for all nodes using a layered topological layout.
 *
 * Algorithm:
 * 1. Kahn's topological sort into layers (ignore loop edges)
 * 2. Each layer is a vertical column (left → right)
 * 3. Nodes within a layer are centered vertically around the tallest layer
 */
function layoutLayered(
  nodes: FlowNode[],
  edges: FlowEdge[]
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>()
  if (nodes.length === 0) return positions

  // ── Step 1: compute layers via Kahn's algorithm (ignoring loop edges) ──
  const inDegree = new Map<string, number>()
  const outNeighbors = new Map<string, string[]>()

  for (const node of nodes) {
    inDegree.set(node.id, 0)
    outNeighbors.set(node.id, [])
  }

  for (const edge of edges) {
    if (edge.isLoop) continue // loop edges don't affect layout
    const from = inDegree.has(edge.from)
    const to = inDegree.has(edge.to)
    if (!from || !to) continue
    inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1)
    outNeighbors.get(edge.from)!.push(edge.to)
  }

  const layers: string[][] = []
  let currentLayer = nodes
    .filter((n) => (inDegree.get(n.id) ?? 0) === 0)
    .map((n) => n.id)

  // If there are no entry nodes (e.g. all nodes form a cycle via loop edges),
  // fall back to using all nodes as layer 0.
  if (currentLayer.length === 0) {
    currentLayer = nodes.map((n) => n.id)
  }

  const placed = new Set<string>()
  while (currentLayer.length > 0) {
    layers.push(currentLayer)
    for (const id of currentLayer) placed.add(id)

    const next: string[] = []
    for (const id of currentLayer) {
      for (const neighbor of outNeighbors.get(id) ?? []) {
        const d = (inDegree.get(neighbor) ?? 0) - 1
        inDegree.set(neighbor, d)
        if (d === 0 && !placed.has(neighbor)) {
          next.push(neighbor)
        }
      }
    }
    currentLayer = next
  }

  // Catch any leftover nodes (shouldn't happen in valid DAG, but be safe)
  const leftovers = nodes.filter((n) => !placed.has(n.id)).map((n) => n.id)
  if (leftovers.length > 0) layers.push(leftovers)

  // ── Step 2: assign positions with row wrapping ──
  for (let layerIdx = 0; layerIdx < layers.length; layerIdx++) {
    const layer = layers[layerIdx]

    // Wrap: every MAX_LAYERS_PER_ROW layers, move to next row
    const rowIdx = Math.floor(layerIdx / MAX_LAYERS_PER_ROW)
    const colIdx = layerIdx % MAX_LAYERS_PER_ROW

    const x = MARGIN_X + colIdx * LAYER_GAP_X

    // Calculate row height: the tallest layer in this row
    const rowStart = rowIdx * MAX_LAYERS_PER_ROW
    const rowEnd = Math.min(rowStart + MAX_LAYERS_PER_ROW, layers.length)
    const maxLayerSizeInRow = Math.max(
      ...layers.slice(rowStart, rowEnd).map((l) => l.length),
      1
    )
    const rowHeight = maxLayerSizeInRow * NODE_GAP_Y
    const rowY = MARGIN_Y + rowIdx * (rowHeight + ROW_GAP_Y)

    // Center this layer's nodes within the row
    const layerHeight = (layer.length - 1) * NODE_GAP_Y
    const centerOffset = ((maxLayerSizeInRow - 1) * NODE_GAP_Y) / 2
    const startY = rowY + centerOffset - layerHeight / 2

    for (let i = 0; i < layer.length; i++) {
      positions.set(layer[i], {
        x,
        y: startY + i * NODE_GAP_Y,
      })
    }
  }

  return positions
}

// ---------------------------------------------------------------------------
// Flow model → React Flow
// ---------------------------------------------------------------------------

export function flowToReactFlow(
  nodes: FlowNode[],
  edges: FlowEdge[]
): { nodes: FlowFlowNode[]; edges: FlowFlowEdge[] } {
  const hasStructure = edges.filter((e) => !e.isLoop).length > 0

  // Auto-layout only when there are connecting edges; otherwise use stored positions
  const positions = hasStructure
    ? layoutLayered(nodes, edges)
    : new Map<string, { x: number; y: number }>()

  const flowNodes: FlowFlowNode[] = nodes.map((node, i) => {
    const pos = positions.get(node.id)
    return {
      id: node.id,
      type: 'flowNode',
      position: pos ?? node.position ?? { x: 40 + (i % 4) * 320, y: 40 + Math.floor(i / 4) * 140 },
      data: {
        kind: node.kind,
        label: node.label,
        config: node.config,
        retry: node.retry,
      },
    }
  })

  const flowEdges: FlowFlowEdge[] = edges.map((edge, i) => ({
    id: `${edge.from}-${edge.to}-${i}`,
    source: edge.from,
    target: edge.to,
    type: edge.isLoop ? 'flowLoopEdge' : 'flowEdge',
    animated: edge.isLoop,
    data: { isLoop: edge.isLoop, conditionLabel: edge.conditionLabel },
    // Store conditionLabel at top level too so React Flow's edge data is accessible
    ...(edge.conditionLabel ? { label: edge.conditionLabel } : {}),
  }))

  return { nodes: flowNodes, edges: flowEdges }
}

// ---------------------------------------------------------------------------
// React Flow → Flow model (for persistence)
// ---------------------------------------------------------------------------

export function reactFlowToFlow(
  nodes: FlowFlowNode[],
  edges: FlowFlowEdge[]
): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const flowNodes: FlowNode[] = nodes.map((node) => ({
    id: node.id,
    kind: node.data.kind,
    label: node.data.label,
    position: { x: node.position.x, y: node.position.y },
    config: node.data.config,
    retry: node.data.retry,
  }))

  const flowEdges: FlowEdge[] = edges.map((edge) => ({
    from: edge.source,
    to: edge.target,
    isLoop: edge.data?.isLoop === true,
    ...(edge.data?.conditionLabel ? { conditionLabel: edge.data.conditionLabel as string } : {}),
  }))

  return { nodes: flowNodes, edges: flowEdges }
}
