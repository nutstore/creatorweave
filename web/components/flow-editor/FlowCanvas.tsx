/**
 * FlowCanvas — main React Flow canvas surface.
 * Handles node dragging, connecting, and selection.
 */

import { useCallback } from 'react'
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  type Connection,
  type Node,
  type OnNodesChange,
  type OnEdgesChange,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { FlowNodeCard } from './FlowNodeCard'
import { FlowEdgeCustom } from './FlowEdgeCustom'
import type { FlowFlowNode, FlowFlowEdge } from './flow-converter'

// Register custom node/edge types outside component to avoid recreation
const nodeTypes = { flowNode: FlowNodeCard }
const edgeTypes = { flowEdge: FlowEdgeCustom, flowLoopEdge: FlowEdgeCustom }

interface FlowCanvasProps {
  nodes: FlowFlowNode[]
  edges: FlowFlowEdge[]
  onNodesChange: OnNodesChange<FlowFlowNode>
  onEdgesChange: OnEdgesChange<FlowFlowEdge>
  onConnect: (connection: Connection) => void
  onNodeDragStop: (nodeId: string, position: { x: number; y: number }) => void
  onNodeClick: (nodeId: string) => void
  onPaneClick: () => void
}

export function FlowCanvas({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onNodeDragStop,
  onNodeClick,
  onPaneClick,
}: FlowCanvasProps) {
  const handleNodeDragStop = useCallback(
    (_evt: React.MouseEvent, node: Node) => {
      onNodeDragStop(node.id, { x: node.position.x, y: node.position.y })
    },
    [onNodeDragStop]
  )

  const handleNodeClick = useCallback(
    (_evt: React.MouseEvent, node: Node) => {
      onNodeClick(node.id)
    },
    [onNodeClick]
  )

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeDragStop={handleNodeDragStop}
        onNodeClick={handleNodeClick}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        defaultEdgeOptions={{ type: 'flowEdge' }}
        proOptions={{ hideAttribution: true }}
        className="bg-neutral-50 dark:bg-neutral-950"
      >
        <Background
          variant={BackgroundVariant.Cross}
          gap={20}
          size={1.5}
          color="#a0a0b840"
        />
        <Controls
          className="!border-neutral-200 !bg-white !shadow-md dark:!border-neutral-700 dark:!bg-neutral-900"
          showInteractive={false}
        />
        <MiniMap
          className="!rounded-lg !border !border-neutral-200 !bg-white/90 dark:!border-neutral-700 dark:!bg-neutral-900/90"
          nodeColor={(node) => {
            const kind = (node.data as { kind?: string })?.kind
            const colors: Record<string, string> = {
              input: '#4f7cff',
              tool: '#06b6d4',
              llm: '#9d6bff',
              review: '#ffa940',
              output: '#2ed573',
            }
            return colors[kind ?? ''] ?? '#a0a0b8'
          }}
          maskColor="rgba(0,0,0,0.05)"
        />
      </ReactFlow>
    </div>
  )
}
