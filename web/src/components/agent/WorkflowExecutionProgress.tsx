import { useState, useMemo, useRef, useEffect } from 'react'
import {
  StopCircle,
  Lightbulb,
  PenTool,
  ShieldCheck,
  Wrench,
  Layers,
  GitBranch,
  CheckCircle2,
  XCircle,
  Loader2,
  ChevronDown,
  Timer,
  Brain,
} from 'lucide-react'
import { cn } from '@creatorweave/ui'
import { nodeKindConfig } from './workflow-editor/constants'
import type {
  WorkflowExecutionState,
  WorkflowNodeExecState,
  WorkflowNodeStep,
} from '@/agent/message-types'
import type { WorkflowNodeKind } from '@/agent/workflow/types'
import { useT } from '@/i18n'

const nodeIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  plan: Lightbulb,
  produce: PenTool,
  review: ShieldCheck,
  repair: Wrench,
  assemble: Layers,
  condition: GitBranch,
}

function formatElapsed(startedAt: number): string {
  const seconds = Math.floor((Date.now() - startedAt) / 1000)
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}m ${s}s`
}

/* ------------------------------------------------------------------ */
/*  Segment Status Colors                                              */
/* ------------------------------------------------------------------ */

const segmentStyles = {
  completed: {
    block: 'bg-emerald-50/80 dark:bg-emerald-950/20',
    dot: 'bg-emerald-500',
    label: 'text-neutral-800 dark:text-neutral-200',
    connector: 'bg-emerald-400/40 dark:bg-emerald-600/30',
  },
  running: {
    block: 'bg-primary-50/60 dark:bg-primary-950/15',
    dot: 'bg-primary-500',
    label: 'text-neutral-800 dark:text-neutral-200',
    connector: 'bg-neutral-200 dark:bg-neutral-700',
  },
  failed: {
    block: 'bg-red-50/80 dark:bg-red-950/20',
    dot: 'bg-red-500',
    label: 'text-neutral-800 dark:text-neutral-200',
    connector: 'bg-neutral-200 dark:bg-neutral-700',
  },
  pending: {
    block: 'bg-neutral-50 dark:bg-neutral-800/30',
    dot: 'bg-neutral-300 dark:bg-neutral-600',
    label: 'text-neutral-400 dark:text-neutral-500',
    connector: 'bg-neutral-200 dark:bg-neutral-700',
  },
} as const

/* ------------------------------------------------------------------ */
/*  Node Step Renderer                                                 */
/* ------------------------------------------------------------------ */

function NodeStepReasoning({ step }: { step: Extract<WorkflowNodeStep, { type: 'reasoning' }> }) {
  const t = useT()
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (step.streaming && contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight
    }
  }, [step.content, step.streaming])

  if (!step.content) return null

  return (
    <div className="space-y-0">
      <div className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] text-neutral-400 dark:text-neutral-500">
        <Brain className="h-3 w-3" />
        <span>{step.streaming ? t('workflow.thinking') : t('workflow.thinkingProcess')}</span>
      </div>
      <div
        ref={contentRef}
        className="max-h-32 overflow-y-auto whitespace-pre-wrap px-3 pb-2 text-[11px] leading-relaxed text-neutral-400 dark:text-neutral-500"
      >
        {step.content}
        {step.streaming && (
          <span className="ml-0.5 inline-block h-3 w-[2px] animate-pulse bg-neutral-300 align-text-bottom dark:bg-neutral-600" />
        )}
      </div>
    </div>
  )
}

function NodeStepContent({ step }: { step: Extract<WorkflowNodeStep, { type: 'content' }> }) {
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (step.streaming && contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight
    }
  }, [step.content, step.streaming])

  if (!step.content) return null

  return (
    <div
      ref={contentRef}
      className="max-h-40 overflow-y-auto whitespace-pre-wrap px-3 py-2 text-[11px] leading-relaxed text-neutral-700 dark:text-neutral-300"
    >
      {step.content}
      {step.streaming && (
        <span className="ml-0.5 inline-block h-3.5 w-[2px] animate-pulse bg-primary-400 align-text-bottom" />
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Pipeline Segment                                                   */
/* ------------------------------------------------------------------ */

function PipelineSegment({
  node,
  isLast,
  isExpanded,
  onToggle,
}: {
  node: WorkflowNodeExecState
  isLast: boolean
  isExpanded: boolean
  onToggle: () => void
}) {
  const t = useT()
  const cfg = nodeKindConfig[node.kind as WorkflowNodeKind]
  const Icon = nodeIcons[node.kind]
  const style = segmentStyles[node.status]
  const isInteractive =
    node.status === 'completed' || node.status === 'running' || node.status === 'failed'

  const hasSteps = node.steps && node.steps.length > 0
  const hasAnyStepContent = hasSteps && node.steps!.some((s) => s.content.length > 0)

  return (
    <div className="flex min-w-[100px] flex-1 flex-col">
      {/* Node block */}
      <button
        type="button"
        onClick={isInteractive ? onToggle : undefined}
        disabled={!isInteractive}
        className={cn(
          'group relative flex items-center gap-2 rounded-lg border border-transparent px-3 py-2 text-left transition-all duration-200',
          style.block,
          isInteractive && 'cursor-pointer hover:border-neutral-200 hover:shadow-sm active:scale-[0.98] dark:hover:border-neutral-700',
          !isInteractive && 'cursor-default',
          isExpanded && 'border-neutral-200 shadow-sm dark:border-neutral-700',
        )}
      >
        {/* Status indicator dot */}
        <span className="relative flex h-1.5 w-1.5 shrink-0">
          <span
            className={cn('absolute inset-0 rounded-full', style.dot)}
          />
          {node.status === 'running' && (
            <span
              className={cn(
                'absolute -inset-1 rounded-full opacity-40 animate-ping',
                style.dot,
              )}
            />
          )}
        </span>

        {/* Node kind icon */}
        {Icon && (
          <Icon
            className={cn('h-3 w-3 shrink-0', cfg?.color || 'text-neutral-400')}
          />
        )}

        {/* Label */}
        <span className={cn('truncate text-[11px] font-medium', style.label)}>
          {node.label || (cfg?.labelKey && t(cfg.labelKey)) || node.kind}
        </span>

        {/* Status badge */}
        {node.status === 'completed' && (
          <CheckCircle2 className="ml-auto h-3 w-3 shrink-0 text-emerald-500" />
        )}
        {node.status === 'failed' && (
          <XCircle className="ml-auto h-3 w-3 shrink-0 text-red-500" />
        )}
        {node.status === 'running' && (
          <Loader2 className="ml-auto h-3 w-3 shrink-0 animate-spin text-primary-500" />
        )}

        {/* Expand chevron */}
        {isInteractive && (
          <ChevronDown
            className={cn(
              'h-2.5 w-2.5 shrink-0 text-neutral-300 transition-transform duration-200 dark:text-neutral-600',
              isExpanded && 'rotate-180 text-neutral-500 dark:text-neutral-400',
            )}
          />
        )}
      </button>

      {/* Connector arrow */}
      {!isLast && (
        <div className="flex items-center pl-[22px]">
          <div className={cn('h-px flex-1', style.connector)} />
          <div
            className={cn(
              'h-1 w-1 shrink-0 rotate-45 -translate-x-[0.5px] border-r border-t',
              style.connector,
            )}
          />
        </div>
      )}

      {/* Expanded detail */}
      {isExpanded && (
        <div className="mt-1 overflow-hidden rounded-lg border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-800/80">
          {/* Render streaming steps if available */}
          {hasAnyStepContent && (
            <div className="divide-y divide-neutral-100 dark:divide-neutral-700/50">
              {node.steps!.map((step) =>
                step.type === 'reasoning' ? (
                  <NodeStepReasoning key={step.id} step={step} />
                ) : (
                  <NodeStepContent key={step.id} step={step} />
                ),
              )}
            </div>
          )}

          {/* Running but no steps yet */}
          {node.status === 'running' && !hasAnyStepContent && (
            <div className="flex items-center gap-2 px-3 py-2.5">
              <Loader2 className="h-3 w-3 animate-spin text-primary-500" />
              <span className="text-[11px] text-primary-600 dark:text-primary-400">
                {t('workflow.executing')}
              </span>
            </div>
          )}

          {/* Fallback: completed with output but no steps */}
          {node.status === 'completed' && node.output && !hasAnyStepContent && (
            <div className="max-h-28 overflow-y-auto px-3 py-2.5">
              <p className="whitespace-pre-wrap text-[11px] leading-relaxed text-neutral-600 dark:text-neutral-400">
                {node.output.length > 600
                  ? `${node.output.slice(0, 600)}...`
                  : node.output}
              </p>
            </div>
          )}

          {/* Error display */}
          {node.status === 'failed' && node.error && (
            <div className="px-3 py-2.5">
              <p className="text-[11px] leading-relaxed text-red-600 dark:text-red-400">
                {node.error}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

interface WorkflowExecutionProgressProps {
  execution: WorkflowExecutionState
  onStop?: () => void
}

export function WorkflowExecutionProgress({
  execution,
  onStop,
}: WorkflowExecutionProgressProps) {
  const t = useT()
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const completedCount = execution.nodes.filter((n) => n.status === 'completed').length
  const totalCount = execution.nodes.length
  const hasRunning = execution.nodes.some((n) => n.status === 'running')
  const hasFailed = execution.nodes.some((n) => n.status === 'failed')
  const isDone = !hasRunning && !hasFailed && completedCount === totalCount

  const elapsed = useMemo(() => formatElapsed(execution.startedAt), [execution.startedAt])

  const activeNodeId = hasRunning
    ? execution.nodes.find((n) => n.status === 'running')?.id
    : hasFailed
      ? execution.nodes.find((n) => n.status === 'failed')?.id
      : null

  const effectiveExpandedId = expandedId ?? activeNodeId ?? null

  return (
    <div className="rounded-xl border border-neutral-200/80 bg-white/90 p-3.5 backdrop-blur-sm dark:border-neutral-700/60 dark:bg-neutral-900/80">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="truncate text-[13px] font-semibold text-neutral-800 dark:text-neutral-200">
            {execution.label}
          </span>

          {hasRunning && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-primary-50 px-1.5 py-0.5 text-[10px] font-medium text-primary-600 dark:bg-primary-500/10 dark:text-primary-400">
              <Loader2 className="h-2.5 w-2.5 animate-spin" />
              {t('workflow.running')}
            </span>
          )}
          {isDone && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
              <CheckCircle2 className="h-2.5 w-2.5" />
              {t('workflow.completed')}
            </span>
          )}
          {hasFailed && !hasRunning && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-600 dark:bg-red-500/10 dark:text-red-400">
              <XCircle className="h-2.5 w-2.5" />
              {t('workflow.failed')}
            </span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <div className="flex items-center gap-2 text-[10px] text-neutral-400 dark:text-neutral-500">
            <span>
              {completedCount}/{totalCount}
            </span>
            <span className="h-2.5 w-px bg-neutral-200 dark:bg-neutral-700" />
            <span className="inline-flex items-center gap-0.5">
              <Timer className="h-2.5 w-2.5" />
              {elapsed}
            </span>
          </div>

          {hasRunning && onStop && (
            <button
              type="button"
              onClick={onStop}
              className="rounded-md p-1 text-neutral-300 transition-colors hover:bg-red-50 hover:text-red-500 dark:text-neutral-600 dark:hover:bg-red-500/10 dark:hover:text-red-400"
              title={t('workflow.stopRunning')}
            >
              <StopCircle className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Horizontal pipeline */}
      <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
        {execution.nodes.map((node, i) => (
          <PipelineSegment
            key={node.id}
            node={node}
            isLast={i === execution.nodes.length - 1}
            isExpanded={effectiveExpandedId === node.id}
            onToggle={() =>
              setExpandedId((prev) => (prev === node.id ? null : node.id))
            }
          />
        ))}
      </div>
    </div>
  )
}
