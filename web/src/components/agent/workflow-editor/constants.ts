import type { WorkflowNodeKind } from '@/agent/workflow/types'

/**
 * Node kind configuration with refined color palette.
 * Uses warm, muted tones instead of typical AI colors.
 * Label and description use translation keys - use getKindLabel/getKindDescription for translated strings.
 */
export const nodeKindConfig: Record<
  WorkflowNodeKind,
  {
    labelKey: string
    icon: string
    accent: string
    accentHex: string
    bg: string
    bgHover: string
    color: string
    border: string
    portFill: string
    descriptionKey: string
  }
> = {
  plan: {
    labelKey: 'workflowEditor.plan',
    icon: 'Lightbulb',
    accent: 'border-indigo-500',
    accentHex: '#6366f1',
    bg: 'bg-indigo-50/80 dark:bg-indigo-950/40',
    bgHover: 'hover:bg-indigo-100/80 dark:hover:bg-indigo-950/60',
    color: 'text-indigo-600 dark:text-indigo-300',
    border: 'border-indigo-200/80 dark:border-indigo-800/60',
    portFill: '#6366f1',
    descriptionKey: 'workflowEditor.planDescription',
  },
  produce: {
    labelKey: 'workflowEditor.produce',
    icon: 'PenTool',
    accent: 'border-teal-500',
    accentHex: '#14b8a6',
    bg: 'bg-teal-50/80 dark:bg-teal-950/40',
    bgHover: 'hover:bg-teal-100/80 dark:hover:bg-teal-950/60',
    color: 'text-teal-600 dark:text-teal-300',
    border: 'border-teal-200/80 dark:border-teal-800/60',
    portFill: '#14b8a6',
    descriptionKey: 'workflowEditor.produceDescription',
  },
  review: {
    labelKey: 'workflowEditor.review',
    icon: 'ShieldCheck',
    accent: 'border-rose-400',
    accentHex: '#fb7185',
    bg: 'bg-rose-50/80 dark:bg-rose-950/40',
    bgHover: 'hover:bg-rose-100/80 dark:hover:bg-rose-950/60',
    color: 'text-rose-600 dark:text-rose-300',
    border: 'border-rose-200/80 dark:border-rose-800/60',
    portFill: '#fb7185',
    descriptionKey: 'workflowEditor.reviewDescription',
  },
  repair: {
    labelKey: 'workflowEditor.repair',
    icon: 'Wrench',
    accent: 'border-amber-500',
    accentHex: '#f59e0b',
    bg: 'bg-amber-50/80 dark:bg-amber-950/40',
    bgHover: 'hover:bg-amber-100/80 dark:hover:bg-amber-950/60',
    color: 'text-amber-600 dark:text-amber-300',
    border: 'border-amber-200/80 dark:border-amber-800/60',
    portFill: '#f59e0b',
    descriptionKey: 'workflowEditor.repairDescription',
  },
  assemble: {
    labelKey: 'workflowEditor.assemble',
    icon: 'Layers',
    accent: 'border-violet-400',
    accentHex: '#a78bfa',
    bg: 'bg-violet-50/80 dark:bg-violet-950/40',
    bgHover: 'hover:bg-violet-100/80 dark:hover:bg-violet-950/60',
    color: 'text-violet-600 dark:text-violet-300',
    border: 'border-violet-200/80 dark:border-violet-800/60',
    portFill: '#a78bfa',
    descriptionKey: 'workflowEditor.assembleDescription',
  },
  condition: {
    labelKey: 'workflowEditor.condition',
    icon: 'GitBranch',
    accent: 'border-sky-400',
    accentHex: '#38bdf8',
    bg: 'bg-sky-50/80 dark:bg-sky-950/40',
    bgHover: 'hover:bg-sky-100/80 dark:hover:bg-sky-950/60',
    color: 'text-sky-600 dark:text-sky-300',
    border: 'border-sky-200/80 dark:border-sky-800/60',
    portFill: '#38bdf8',
    descriptionKey: 'workflowEditor.conditionDescription',
  },
}

export const NODE_WIDTH = 200
export const NODE_HEIGHT = 72
export const LAYER_VERTICAL_GAP = 120
export const NODE_HORIZONTAL_GAP = 260
