import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { Node, NodeProps } from '@xyflow/react'
import { MemoizedWorkflowNodeCard } from '../WorkflowNodeCard'
import type { WorkflowNodeData } from '../workflow-to-flow'

vi.mock('@xyflow/react', async () => {
  const actual = await vi.importActual<typeof import('@xyflow/react')>('@xyflow/react')
  return {
    ...actual,
    Handle: ({ type }: { type: string }) => <div data-testid={`handle-${type}`} />,
    Position: {
      Left: 'left',
      Right: 'right',
    },
  }
})

function makeNodeData(kind: WorkflowNodeData['kind']): WorkflowNodeData {
  return {
    kind,
    agentRole: 'planner',
    taskInstruction: 'test task',
    outputKey: 'out',
    isEntry: false,
    maxRetries: 1,
    timeoutMs: 3000,
  }
}

describe('WorkflowNodeCard', () => {
  it('renders condition nodes without crashing', () => {
    const node = {
      id: 'n1',
      position: { x: 0, y: 0 },
      data: makeNodeData('condition'),
      type: 'workflowNode',
    } as Node<WorkflowNodeData>

    const props: NodeProps<Node<WorkflowNodeData>> = {
      id: node.id,
      data: node.data,
      selected: false,
      type: node.type || 'workflowNode',
      zIndex: 0,
      draggable: true,
      selectable: true,
      dragging: false,
      deletable: true,
      isConnectable: true,
      positionAbsoluteX: 0,
      positionAbsoluteY: 0,
    }

    render(<MemoizedWorkflowNodeCard {...props} />)

    expect(screen.getByText('Condition')).toBeInTheDocument()
  })
})
