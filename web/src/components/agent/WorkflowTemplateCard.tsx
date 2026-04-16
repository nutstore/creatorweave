import { Play, Zap, Lightbulb, PenTool, ShieldCheck, Wrench, Layers } from 'lucide-react'
import { cn } from '@creatorweave/ui'
import { nodeKindConfig } from './workflow-editor/constants'
import type { WorkflowNodeKind } from '@/agent/workflow/types'
import { useT } from '@/i18n'

export interface WorkflowTemplateInfo {
  id: string
  label: string
  pipeline?: string[]
}

const nodeIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  plan: Lightbulb,
  produce: PenTool,
  review: ShieldCheck,
  repair: Wrench,
  assemble: Layers,
}

interface WorkflowTemplateCardProps {
  template: WorkflowTemplateInfo
  selected?: boolean
  disabled?: boolean
  onSelect?: (id: string) => void
  onRun?: (id: string) => void
  onRealRun?: (id: string) => void
  compact?: boolean
}

export function WorkflowTemplateCard({
  template,
  selected = false,
  disabled = false,
  onSelect,
  onRun,
  onRealRun,
  compact = false,
}: WorkflowTemplateCardProps) {
  const t = useT()
  const pipeline = template.pipeline || []

  if (compact) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => onSelect?.(template.id)}
        className={cn(
          'w-full rounded-lg border p-2.5 text-left transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/20',
          'disabled:cursor-not-allowed disabled:opacity-50',
          selected
            ? 'border-primary-300 bg-primary-50 dark:border-primary-700 dark:bg-primary-950/30'
            : 'border-neutral-200 bg-white hover:border-neutral-300 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:hover:border-neutral-600 dark:hover:bg-neutral-750'
        )}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-neutral-900 dark:text-neutral-100">
            {template.label}
          </span>
          {selected && <span className="h-1.5 w-1.5 rounded-full bg-primary-500" />}
        </div>
        {pipeline.length > 0 && (
          <div className="mt-1.5 flex flex-wrap items-center gap-0.5">
            {pipeline.map((kind, i) => {
              const cfg = nodeKindConfig[kind as WorkflowNodeKind]
              const Icon = nodeIcons[kind]
              const label = cfg?.labelKey ? t(cfg.labelKey) : kind
              return (
                <span key={`${kind}-${i}`} className="flex items-center gap-0.5">
                  {i > 0 && <span className="mx-0.5 h-px w-2 bg-neutral-300 dark:bg-neutral-600" />}
                  <span
                    className={cn(
                      'inline-flex items-center gap-0.5 rounded px-1 py-px text-[10px] font-medium',
                      cfg?.bg || 'bg-neutral-100 dark:bg-neutral-700',
                      cfg?.color || 'text-neutral-600 dark:text-neutral-300'
                    )}
                  >
                    {Icon && <Icon className="h-2.5 w-2.5" />}
                    {label}
                  </span>
                </span>
              )
            })}
          </div>
        )}
      </button>
    )
  }

  // Full card (for empty state)
  return (
    <div
      className={cn(
        'group relative rounded-xl border p-4 transition-all',
        'border-neutral-200 bg-white hover:border-primary-200 hover:shadow-sm',
        'dark:border-neutral-700 dark:bg-neutral-800 dark:hover:border-primary-800',
        disabled && 'cursor-not-allowed opacity-50'
      )}
    >
      <h4 className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
        {template.label}
      </h4>

      {/* Visual pipeline */}
      {pipeline.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1">
          {pipeline.map((kind, i) => {
            const cfg = nodeKindConfig[kind as WorkflowNodeKind]
            const Icon = nodeIcons[kind]
            const label = cfg?.labelKey ? t(cfg.labelKey) : kind
            return (
              <span key={`${kind}-${i}`} className="flex items-center gap-1">
                {i > 0 && (
                  <span className="text-[10px] text-neutral-300 dark:text-neutral-600">→</span>
                )}
                <span
                  className={cn(
                    'inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium',
                    cfg?.bg || 'bg-neutral-100',
                    cfg?.color || 'text-neutral-600'
                  )}
                >
                  {Icon && <Icon className="h-3 w-3" />}
                  {label}
                </span>
              </span>
            )
          })}
        </div>
      )}

      {/* Action buttons */}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onRun?.(template.id)}
          className={cn(
            'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
            'border border-neutral-200 bg-neutral-50 text-neutral-700',
            'hover:border-neutral-300 hover:bg-neutral-100',
            'disabled:cursor-not-allowed disabled:opacity-50',
            'dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-300 dark:hover:border-neutral-500 dark:hover:bg-neutral-650'
          )}
        >
          <Play className="h-3 w-3" />
          {t('workflow.simulateRun')}
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onRealRun?.(template.id)}
          className={cn(
            'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
            'border border-emerald-200 bg-emerald-50 text-emerald-700',
            'hover:border-emerald-300 hover:bg-emerald-100',
            'disabled:cursor-not-allowed disabled:opacity-50',
            'dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:border-emerald-600 dark:hover:bg-emerald-950/60'
          )}
        >
          <Zap className="h-3 w-3" />
          {t('workflow.realRun')}
        </button>
      </div>
    </div>
  )
}
