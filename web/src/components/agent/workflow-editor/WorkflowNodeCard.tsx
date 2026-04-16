/**
 * WorkflowNodeCard - Refined node design with editorial aesthetics.
 * Clean, professional styling with subtle interactions.
 */

import { memo } from 'react'
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react'
import {
  Lightbulb,
  PenTool,
  ShieldCheck,
  Wrench,
  Layers,
  Flag,
  GitBranch,
} from 'lucide-react'
import { cn } from '@creatorweave/ui'
import { nodeKindConfig } from './constants'
import type { WorkflowNodeData } from './workflow-to-flow'
import type { WorkflowNodeKind } from '@/agent/workflow/types'
import { useT } from '@/i18n'

const kindIcons: Record<WorkflowNodeKind, React.ComponentType<{ className?: string }>> = {
  plan: Lightbulb,
  produce: PenTool,
  review: ShieldCheck,
  repair: Wrench,
  assemble: Layers,
  condition: GitBranch,
}

// Get translated kind label
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

function WorkflowNodeCard({ data, selected }: NodeProps<Node<WorkflowNodeData>>) {
  const t = useT()
  const kind = data.kind as WorkflowNodeKind
  const config = nodeKindConfig[kind]
  const Icon = kindIcons[kind]

  return (
    <div
      className={cn(
        'group relative transition-all duration-200',
        'hover:scale-[1.02] hover:shadow-lg',
        selected && 'scale-[1.02] shadow-lg'
      )}
    >
      {/* Selection ring */}
      {selected && (
        <div
          className="absolute -inset-1 rounded-xl ring-2 ring-offset-2 ring-offset-neutral-50 dark:ring-offset-neutral-900"
          style={{ borderColor: config.accentHex }}
        />
      )}

      {/* Main card */}
      <div
        className={cn(
          'relative flex min-w-[200px] flex-col rounded-xl border',
          'bg-white/95 backdrop-blur-sm dark:bg-neutral-900/95',
          'shadow-sm',
          config.border
        )}
      >
        {/* Color accent bar */}
        <div
          className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r-full"
          style={{ backgroundColor: config.accentHex }}
        />

        {/* Header */}
        <div className="flex items-center gap-2 pl-4 pr-3 pt-2.5 pb-1.5">
          <div
            className={cn(
              'flex h-6 w-6 items-center justify-center rounded-md',
              config.bg
            )}
          >
            <Icon className={cn('h-3.5 w-3.5', config.color)} />
          </div>

          <div className="min-w-0 flex-1">
            <div className={cn('text-[11px] font-semibold tracking-wide', config.color)}>
              {getKindLabel(kind, t)}
            </div>
            <div className="truncate text-[10px] text-neutral-400 dark:text-neutral-500">
              {data.agentRole}
            </div>
          </div>

          {/* Entry flag */}
          {data.isEntry && (
            <div className="flex h-5 items-center gap-0.5 rounded bg-amber-50 px-1.5 dark:bg-amber-950/50">
              <Flag className="h-2.5 w-2.5 text-amber-500" />
              <span className="text-[9px] font-medium text-amber-600 dark:text-amber-400">
                {t('workflowEditor.entry')}
              </span>
            </div>
          )}
        </div>

        {/* Task preview */}
        {data.taskInstruction && (
          <div className="px-4 pb-2.5 pt-0.5">
            <p className="line-clamp-2 text-[10px] leading-relaxed text-neutral-500 dark:text-neutral-400">
              {data.taskInstruction}
            </p>
          </div>
        )}

        {/* Config summary */}
        <div className="flex items-center gap-2 border-t border-neutral-100 px-4 py-1.5 dark:border-neutral-800">
          <div className="flex items-center gap-1 text-[9px] text-neutral-400 dark:text-neutral-500">
            <span>{t('workflowEditor.retry')}</span>
            <span className="font-medium text-neutral-500 dark:text-neutral-400">{data.maxRetries}</span>
          </div>
          <div className="h-2 w-px bg-neutral-100 dark:bg-neutral-800" />
          <div className="flex items-center gap-1 text-[9px] text-neutral-400 dark:text-neutral-500">
            <span>{t('workflowEditor.timeoutSec')}</span>
            <span className="font-medium text-neutral-500 dark:text-neutral-400">
              {data.timeoutMs >= 1000 ? `${data.timeoutMs / 1000}s` : `${data.timeoutMs}ms`}
            </span>
          </div>
        </div>

        {/* Target handle */}
        <Handle
          type="target"
          position={Position.Left}
          className="!left-0.5 !h-2.5 !w-2.5 !border-2 !border-white dark:!border-neutral-900"
          style={{ backgroundColor: config.portFill }}
        />

        {/* Source handle */}
        <Handle
          type="source"
          position={Position.Right}
          className="!right-0.5 !h-2.5 !w-2.5 !border-2 !border-white dark:!border-neutral-900"
          style={{ backgroundColor: config.portFill }}
        />
      </div>
    </div>
  )
}

export const MemoizedWorkflowNodeCard = memo(WorkflowNodeCard)
