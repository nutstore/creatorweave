import { useEffect, useRef, useCallback } from 'react'
import { Lightbulb, PenTool, ShieldCheck, Wrench, Layers, Maximize } from 'lucide-react'
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

interface ContextMenuState {
  x: number
  y: number
  type: 'pane' | 'node'
  nodeId?: string
}

interface CanvasContextMenuProps {
  menu: ContextMenuState | null
  onClose: () => void
  onAddNode: (kind: WorkflowNodeKind, x: number, y: number) => void
  onFitView: () => void
  onEditNode?: (nodeId: string) => void
  onSetEntry?: (nodeId: string) => void
  onDeleteNode?: (nodeId: string) => void
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

export function CanvasContextMenu({
  menu,
  onClose,
  onAddNode,
  onFitView,
  onEditNode,
  onSetEntry,
  onDeleteNode,
}: CanvasContextMenuProps) {
  const t = useT()
  const ref = useRef<HTMLDivElement>(null)

  const handleAddNode = useCallback(
    (kind: WorkflowNodeKind) => {
      if (!menu) return
      onAddNode(kind, menu.x, menu.y)
      onClose()
    },
    [menu, onAddNode, onClose]
  )

  // All hooks must be called before any conditional return
  useEffect(() => {
    if (!menu) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('keydown', keyHandler)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('keydown', keyHandler)
    }
  }, [menu, onClose])

  if (!menu) return null

  return (
    <div
      ref={ref}
      className="absolute z-50 min-w-[160px] rounded-md border border-neutral-200 bg-white/95 py-1 shadow-lg backdrop-blur-sm dark:border-neutral-700 dark:bg-neutral-900/95"
      style={{ left: menu.x, top: menu.y }}
    >
      {menu.type === 'pane' ? (
        <>
          <div className="px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
            {t('workflowEditor.addNodes')}
          </div>
          {kindOrder.map((kind) => {
            const config = nodeKindConfig[kind]
            const Icon = kindIcons[kind]
            return (
              <button
                key={kind}
                type="button"
                onClick={() => handleAddNode(kind)}
                className={cn(
                  'flex w-full items-center gap-2 px-2.5 py-1.5 text-xs transition-colors',
                  'hover:bg-neutral-50 dark:hover:bg-neutral-800',
                  config.color
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {getKindLabel(kind, t)}
                <span
                  className="ml-auto h-1.5 w-1.5 rounded-full"
                  style={{ background: config.accentHex }}
                />
              </button>
            )
          })}
          <div className="my-1 border-t border-neutral-100 dark:border-neutral-800" />
          <button
            type="button"
            onClick={() => { onFitView(); onClose() }}
            className="flex w-full items-center gap-2 px-2.5 py-1.5 text-xs text-neutral-600 transition-colors hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            <Maximize className="h-3.5 w-3.5" />
            {t('workflowEditor.fitView')}
          </button>
        </>
      ) : (
        <>
          {onEditNode && menu.nodeId && (
            <button
              type="button"
              onClick={() => { onEditNode(menu.nodeId!); onClose() }}
              className="flex w-full items-center gap-2 px-2.5 py-1.5 text-xs text-neutral-600 transition-colors hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              {t('workflowEditor.editProperties')}
            </button>
          )}
          {onSetEntry && menu.nodeId && (
            <button
              type="button"
              onClick={() => { onSetEntry(menu.nodeId!); onClose() }}
              className="flex w-full items-center gap-2 px-2.5 py-1.5 text-xs text-neutral-600 transition-colors hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              {t('workflowEditor.setAsEntry')}
            </button>
          )}
          <div className="my-1 border-t border-neutral-100 dark:border-neutral-800" />
          {onDeleteNode && menu.nodeId && (
            <button
              type="button"
              onClick={() => { onDeleteNode(menu.nodeId!); onClose() }}
              className="flex w-full items-center gap-2 px-2.5 py-1.5 text-xs text-red-500 transition-colors hover:bg-red-50 dark:hover:bg-red-950/30"
            >
              {t('workflowEditor.deleteNodeContext')}
            </button>
          )}
        </>
      )}
    </div>
  )
}
