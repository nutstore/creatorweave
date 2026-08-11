/**
 * FlowNodeCard — custom React Flow node card.
 * Shows node kind icon, label, and config preview.
 */

import { memo } from 'react'
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react'
import { FileInput, Wrench, Sparkles, ShieldCheck, CornerDownRight, Loader2, CheckCircle2, XCircle, GitBranch } from 'lucide-react'
import { cn } from '@creatorweave/ui'
import { NODE_KIND_CONFIG } from './constants'
import type { FlowNodeKind } from '@/agent/flow/types'
import type { FlowNodeData } from './flow-converter'

const KIND_ICONS: Record<FlowNodeKind, React.ComponentType<{ className?: string }>> = {
  input: FileInput,
  tool: Wrench,
  llm: Sparkles,
  review: ShieldCheck,
  output: CornerDownRight,
  router: GitBranch,
}

function FlowNodeCardComponent({ data, selected }: NodeProps<Node<FlowNodeData>>) {
  const config = NODE_KIND_CONFIG[data.kind]
  const Icon = KIND_ICONS[data.kind]
  const status = data.runStatus

  return (
    <div
      className={cn(
        'group relative transition-all duration-200',
        'hover:scale-[1.02] hover:shadow-lg',
        selected && 'scale-[1.02] shadow-lg',
        status === 'running' && 'scale-[1.03] shadow-lg ring-2',
        status === 'running' && 'ring-primary-400',
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
          'relative flex w-[200px] flex-col rounded-xl border border-neutral-200 bg-white/95 shadow-sm backdrop-blur-sm dark:border-neutral-700 dark:bg-neutral-900/95',
          selected && 'border-neutral-400 dark:border-neutral-500'
        )}
      >
        {/* Color accent bar */}
        <div
          className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r-full"
          style={{ backgroundColor: config.accentHex }}
        />

        {/* Header */}
        <div className="flex items-center gap-2 pl-4 pr-3 pt-2.5 pb-1.5">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center">
            {status === 'running' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-neutral-500" />
            ) : status === 'completed' ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-success" />
            ) : status === 'failed' ? (
              <XCircle className="h-3.5 w-3.5 text-danger-500" />
            ) : (
              <Icon className={cn('h-3.5 w-3.5', config.iconColor)} />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold tracking-wide text-neutral-700 dark:text-neutral-200">
              {config.label}
            </div>
            <div className="truncate text-[10px] text-neutral-400 dark:text-neutral-500">
              {data.label}
            </div>
          </div>
        </div>

        {/* Config preview */}
        <div className="px-4 pb-2.5 pt-0.5">
          <p className="line-clamp-2 break-words text-[10px] leading-relaxed text-neutral-400 dark:text-neutral-500">
            {formatConfigPreview(data)}
          </p>
        </div>

        {/* Connection handles */}
        <Handle
          type="target"
          position={Position.Left}
          className="!left-0.5 !h-2.5 !w-2.5 !border-2 !border-white dark:!border-neutral-900"
          style={{ backgroundColor: config.accentHex }}
        />
        <Handle
          type="source"
          position={Position.Right}
          className="!right-0.5 !h-2.5 !w-2.5 !border-2 !border-white dark:!border-neutral-900"
          style={{ backgroundColor: config.accentHex }}
        />
      </div>
    </div>
  )
}

function formatConfigPreview(data: FlowNodeData): string {
  const c = data.config as Record<string, unknown>
  switch (data.kind) {
    case 'input':
      if (c.inputType === 'today') return '📅 读取今日日记'
      if (c.inputType === 'file') return `📄 ${c.path ?? ''}`
      return `📝 ${(c.value as string ?? '').slice(0, 50)}`
    case 'tool':
      return `🔧 ${c.toolName ?? 'tool'}`
    case 'llm':
      return `✦ ${(c.prompt as string ?? '').slice(0, 60) || 'AI 处理'}`
    case 'review':
      return `✓ ${(c.criteria as string ?? '').slice(0, 50)}`
    case 'output':
      return `💾 ${c.path ?? '结果卡片'}`
    case 'router': {
      const rules = c.rules as Array<{ label?: string; expr?: string }> | undefined
      if (!rules?.length) return '⎇ 条件路由'
      return rules.map((r) => `⎇ ${r.label ?? r.expr ?? ''}`).join(' · ')
    }
    default:
      return ''
  }
}

export const FlowNodeCard = memo(FlowNodeCardComponent)
