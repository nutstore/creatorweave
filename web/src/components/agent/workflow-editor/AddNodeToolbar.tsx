/**
 * AddNodeToolbar - Floating toolbar for adding workflow nodes.
 * Refined design with clear visual hierarchy.
 */

import { useCallback } from 'react'
import { Lightbulb, PenTool, ShieldCheck, Wrench, Layers } from 'lucide-react'
import { useReactFlow } from '@xyflow/react'
import { cn } from '@creatorweave/ui'
import { nodeKindConfig } from './constants'
import type { WorkflowNodeKind } from '@/agent/workflow/types'
import { useT } from '@/i18n'

const kindOrder: WorkflowNodeKind[] = ['plan', 'produce', 'review', 'repair', 'assemble']

const kindIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  plan: Lightbulb,
  produce: PenTool,
  review: ShieldCheck,
  repair: Wrench,
  assemble: Layers,
}

function buildNodeId(kind: WorkflowNodeKind): string {
  const rand = Math.random().toString(36).slice(2, 8)
  return `${kind}_${Date.now()}_${rand}`
}

// Get translated kind config
function getKindLabel(kind: WorkflowNodeKind, t: (key: string) => string): string {
  const labels: Record<WorkflowNodeKind, string> = {
    plan: t('workflowEditor.plan'),
    produce: t('workflowEditor.produce'),
    review: t('workflowEditor.review'),
    repair: t('workflowEditor.repair'),
    assemble: t('workflowEditor.assemble'),
    condition: t('workflowEditor.condition') || 'Condition',
  }
  return labels[kind] || kind
}

function getKindDescription(kind: WorkflowNodeKind, t: (key: string) => string): string {
  const descriptions: Record<WorkflowNodeKind, string> = {
    plan: t('workflowEditor.planDescription') || 'Define goals and strategy',
    produce: t('workflowEditor.produceDescription') || 'Execute creation tasks',
    review: t('workflowEditor.reviewDescription') || 'Check output quality',
    repair: t('workflowEditor.repairDescription') || 'Fix review issues',
    assemble: t('workflowEditor.assembleDescription') || 'Integrate final output',
    condition: t('workflowEditor.conditionDescription') || 'Conditional branching',
  }
  return descriptions[kind] || ''
}

export function AddNodeToolbar() {
  const t = useT()
  const { screenToFlowPosition, addNodes, getNodes } = useReactFlow()

  const addNode = useCallback(
    (kind: WorkflowNodeKind) => {
      const id = buildNodeId(kind)
      const existingNodes = getNodes()
      const nodeCount = existingNodes.length
      const newEntry = nodeCount === 0
      const base = screenToFlowPosition({ x: 200, y: 140 })
      const column = nodeCount % 3
      const row = Math.floor(nodeCount / 3)
      const position = {
        x: base.x + column * 280,
        y: base.y + row * 140,
      }

      addNodes([
        {
          id,
          type: 'workflowNode',
          position,
          data: {
            kind,
            agentRole: `${kind}_agent`,
            taskInstruction: '',
            outputKey: `${kind}_output`,
            isEntry: newEntry,
            maxRetries: 1,
            timeoutMs: kind === 'produce' ? 30000 : 15000,
          },
        },
      ])
    },
    [screenToFlowPosition, addNodes, getNodes]
  )

  return (
    <div className="pointer-events-none absolute left-1/2 top-4 z-10 -translate-x-1/2">
      <div
        className={cn(
          'pointer-events-auto flex items-center gap-1 rounded-xl',
          'border border-neutral-200/60 bg-white/95 px-2 py-1.5',
          'shadow-lg backdrop-blur-md',
          'dark:border-neutral-700/60 dark:bg-neutral-900/95'
        )}
      >
        <span className="px-1.5 text-[10px] font-medium uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
          {t('workflowEditor.add')}
        </span>

        <div className="flex items-center gap-0.5">
          {kindOrder.map((kind) => {
            const config = nodeKindConfig[kind]
            const Icon = kindIcons[kind]

            return (
              <button
                key={kind}
                type="button"
                onClick={() => addNode(kind)}
                className={cn(
                  'group relative flex items-center gap-1.5 rounded-lg px-2.5 py-1.5',
                  'text-[11px] font-medium transition-all duration-150',
                  'hover:shadow-sm active:scale-95',
                  config.bg, config.bgHover, config.color
                )}
                title={t('workflowEditor.addNodeTooltip', {
                  kind: getKindLabel(kind, t),
                  description: getKindDescription(kind, t),
                })}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{getKindLabel(kind, t)}</span>

                {/* Tooltip on hover */}
                <div
                  className={cn(
                    'pointer-events-none absolute -bottom-8 left-1/2 -translate-x-1/2',
                    'whitespace-nowrap rounded bg-neutral-800 px-2 py-1',
                    'text-[9px] text-white opacity-0 shadow-md',
                    'transition-opacity group-hover:opacity-100',
                    'dark:bg-neutral-200 dark:text-neutral-800'
                  )}
                >
                  {getKindDescription(kind, t)}
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
