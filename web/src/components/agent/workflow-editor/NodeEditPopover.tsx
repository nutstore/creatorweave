import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import {
  cn,
  BrandButton,
  BrandCheckbox,
  BrandInput,
  BrandTextarea,
  BrandSelect,
  BrandSelectContent,
  BrandSelectItem,
  BrandSelectTrigger,
  BrandSelectValue,
} from '@creatorweave/ui'
import { nodeKindConfig } from './constants'
import type { WorkflowNodeData, WorkflowFlowNode } from './workflow-to-flow'
import type { WorkflowNodeKind } from '@/agent/workflow/types'
import { getDefaultNodeInstruction } from '@/agent/workflow/node-prompts'
import { useT } from '@/i18n'

interface NodeEditPopoverProps {
  node: WorkflowFlowNode
  position: { x: number; y: number } | null
  onUpdateNodeData: (nodeId: string, patch: Partial<WorkflowNodeData>) => void
  onDelete: (nodeId: string) => void
  onClose: () => void
}

const kindOptions: { value: WorkflowNodeKind; labelKey: string }[] = [
  { value: 'plan', labelKey: 'workflowEditor.plan' },
  { value: 'produce', labelKey: 'workflowEditor.produce' },
  { value: 'review', labelKey: 'workflowEditor.review' },
  { value: 'repair', labelKey: 'workflowEditor.repair' },
  { value: 'assemble', labelKey: 'workflowEditor.assemble' },
]

export function NodeEditPopover({
  node,
  position,
  onUpdateNodeData,
  onDelete,
  onClose,
}: NodeEditPopoverProps) {
  const t = useT()
  const ref = useRef<HTMLDivElement>(null)
  const roleInputRef = useRef<HTMLInputElement>(null)
  const [visible, setVisible] = useState(false)

  // Animate in
  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(true)
      roleInputRef.current?.focus()
    }, 50)
    return () => clearTimeout(timer)
  }, [])

  // Close on Escape
  useEffect(() => {
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', keyHandler)
    return () => document.removeEventListener('keydown', keyHandler)
  }, [onClose])

  if (!position) return null

  const data = node.data
  const config = nodeKindConfig[data.kind]
  const defaultInstruction = getDefaultNodeInstruction(data.kind)
  const customTaskInstruction = typeof data.taskInstruction === 'string' ? data.taskInstruction : ''
  const effectiveTaskInstruction = customTaskInstruction.trim()
    ? customTaskInstruction
    : defaultInstruction

  const handleChange = (patch: Partial<WorkflowNodeData>) => {
    onUpdateNodeData(node.id, patch)
  }

  return (
    <div
      ref={ref}
      className={cn(
        'absolute z-40 w-[260px] rounded-lg border border-neutral-200 bg-white/95 shadow-lg backdrop-blur-sm transition-opacity dark:border-neutral-700 dark:bg-neutral-900/95',
        visible ? 'opacity-100' : 'opacity-0'
      )}
      style={{
        left: position.x + 200,
        top: position.y - 20,
      }}
    >
      {/* Accent bar */}
      <div
        className="h-1 rounded-t-lg"
        style={{ background: config.accentHex }}
      />

      {/* Close button */}
      <button
        type="button"
        onClick={onClose}
        className="absolute right-2 top-2.5 rounded p-0.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
      >
        <X className="h-3.5 w-3.5" />
      </button>

      <div className="space-y-2.5 p-3">
        {/* Kind selector */}
        <div>
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
            {t('workflowEditor.kind')}
          </label>
          <BrandSelect
            value={data.kind}
            onValueChange={(value) => handleChange({ kind: value as WorkflowNodeKind })}
          >
            <BrandSelectTrigger className="h-7 text-xs">
              <BrandSelectValue />
            </BrandSelectTrigger>
            <BrandSelectContent>
              {kindOptions.map((opt) => (
                <BrandSelectItem key={opt.value} value={opt.value}>
                  {t(opt.labelKey)}
                </BrandSelectItem>
              ))}
            </BrandSelectContent>
          </BrandSelect>
        </div>

        {/* Agent Role */}
        <div>
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
            {t('workflowEditor.role')}
          </label>
          <BrandInput
            ref={roleInputRef}
            value={data.agentRole}
            onChange={(e) => handleChange({ agentRole: e.target.value })}
            className="h-7 text-xs font-mono"
          />
        </div>

        {/* Output Key */}
        <div>
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
            {t('workflowEditor.outputKey')}
          </label>
          <BrandInput
            value={data.outputKey}
            onChange={(e) => handleChange({ outputKey: e.target.value })}
            className="h-7 text-xs font-mono"
          />
        </div>

        {/* Task Instruction */}
        <div>
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
            {t('workflowEditor.taskInstruction')}
          </label>
          <BrandTextarea
            value={effectiveTaskInstruction}
            onChange={(e) => handleChange({ taskInstruction: e.target.value })}
            rows={3}
            className="min-h-[64px] resize-y px-2.5 py-1.5 text-xs leading-relaxed"
          />
          <p className="mt-1 text-[10px] text-neutral-400 dark:text-neutral-500">
            {t('workflowEditor.taskInstructionHint')}
          </p>
        </div>

        {/* Is Entry */}
        <div className="flex items-center gap-2">
          <BrandCheckbox
            checked={data.isEntry}
            onCheckedChange={(checked) => handleChange({ isEntry: checked === true })}
          />
          <label className="text-xs text-neutral-600 dark:text-neutral-300">
            {t('workflowEditor.setAsWorkflowEntry')}
          </label>
        </div>

        {/* Retry + Timeout row */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
              {t('workflowEditor.maxRetries')}
            </label>
            <BrandInput
              type="number"
              value={String(data.maxRetries)}
              onChange={(e) =>
                handleChange({ maxRetries: Math.max(0, parseInt(e.target.value) || 0) })
              }
              className="h-7 text-xs"
            />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
              {t('workflowEditor.timeout')}
            </label>
            <BrandInput
              type="number"
              value={String(data.timeoutMs)}
              onChange={(e) =>
                handleChange({ timeoutMs: Math.max(1000, parseInt(e.target.value) || 1000) })
              }
              className="h-7 text-xs"
            />
          </div>
        </div>

        {/* Delete */}
        <div className="pt-1">
          <BrandButton
            variant="danger"
            onClick={() => onDelete(node.id)}
            className="h-7 w-full text-xs"
          >
            {t('workflowEditor.deleteNode')}
          </BrandButton>
        </div>
      </div>
    </div>
  )
}
