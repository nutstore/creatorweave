/**
 * NodePropertiesPanel - Figma-style properties panel fixed in top-right corner.
 * Clean, tool-like interface for editing selected node properties.
 */

import { useEffect, useRef, useCallback, useState } from 'react'
import {
  Lightbulb,
  PenTool,
  ShieldCheck,
  Wrench,
  Layers,
  Trash2,
  MousePointer,
  ChevronDown,
  ChevronRight,
  Cpu,
  Sparkles,
} from 'lucide-react'
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
import type { WorkflowNodeKind, ModelProvider } from '@/agent/workflow/types'
import { getDefaultNodeInstruction } from '@/agent/workflow/node-prompts'

const kindOptions: { value: WorkflowNodeKind; label: string }[] = [
  { value: 'plan', label: '规划' },
  { value: 'produce', label: '创作' },
  { value: 'review', label: '审查' },
  { value: 'repair', label: '修复' },
  { value: 'assemble', label: '组装' },
]

const kindIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  plan: Lightbulb,
  produce: PenTool,
  review: ShieldCheck,
  repair: Wrench,
  assemble: Layers,
}

interface NodePropertiesPanelProps {
  selectedNode: WorkflowFlowNode | null
  onUpdateNodeData: (nodeId: string, patch: Partial<WorkflowNodeData>) => void
  onDeleteNode: (nodeId: string) => void
}

export function NodePropertiesPanel({
  selectedNode,
  onUpdateNodeData,
  onDeleteNode,
}: NodePropertiesPanelProps) {
  const roleInputRef = useRef<HTMLInputElement>(null)
  const selectedNodeId = selectedNode?.id

  // Focus role input when node selection changes
  useEffect(() => {
    if (!selectedNodeId) return
    const timer = setTimeout(() => {
      roleInputRef.current?.focus()
    }, 100)
    return () => clearTimeout(timer)
  }, [selectedNodeId])

  const handleChange = useCallback(
    (patch: Partial<WorkflowNodeData>) => {
      if (!selectedNode) return
      onUpdateNodeData(selectedNode.id, patch)
    },
    [selectedNode, onUpdateNodeData]
  )

  const handleDelete = useCallback(() => {
    if (!selectedNode) return
    onDeleteNode(selectedNode.id)
  }, [selectedNode, onDeleteNode])

  // Empty state - no node selected
  if (!selectedNode) {
    return (
      <div className="flex h-full flex-col">
        {/* Header */}
        <div className="shrink-0 border-b border-neutral-200/80 px-3 py-2.5 dark:border-neutral-700/80">
          <h3 className="text-[11px] font-semibold text-neutral-400 dark:text-neutral-500">
            属性
          </h3>
        </div>

        {/* Empty state */}
        <div className="flex flex-1 flex-col items-center justify-center px-4 py-8 text-center">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-neutral-100 dark:bg-neutral-800">
            <MousePointer className="h-4 w-4 text-neutral-400 dark:text-neutral-500" />
          </div>
          <p className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
            选择节点以编辑属性
          </p>
          <p className="mt-1 text-[10px] text-neutral-400 dark:text-neutral-500">
            点击画布中的节点或从右侧添加新节点
          </p>
        </div>
      </div>
    )
  }

  const data = selectedNode.data
  const config = nodeKindConfig[data.kind]
  const Icon = kindIcons[data.kind] || Lightbulb
  const defaultInstruction = getDefaultNodeInstruction(data.kind)
  const customTaskInstruction = typeof data.taskInstruction === 'string' ? data.taskInstruction : ''
  const effectiveTaskInstruction = customTaskInstruction.trim()
    ? customTaskInstruction
    : defaultInstruction

  return (
    <div className="flex h-full flex-col">
      {/* Header with node type indicator */}
      <div className="shrink-0 border-b border-neutral-200/80 dark:border-neutral-700/80">
        <div className="flex items-center gap-2 px-3 py-2.5">
          <div
            className={cn(
              'flex h-5 w-5 items-center justify-center rounded',
              config.bg
            )}
          >
            <Icon className={cn('h-3 w-3', config.color)} />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-[11px] font-semibold text-neutral-700 dark:text-neutral-200">
              {config.label}
            </h3>
            <p className="text-[9px] text-neutral-400 dark:text-neutral-500">
              {selectedNode.id.slice(0, 12)}...
            </p>
          </div>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        <div className="space-y-3 p-3">
          {/* Kind selector */}
          <Field label="类型">
            <BrandSelect
              value={data.kind}
              onValueChange={(value) => handleChange({ kind: value as WorkflowNodeKind })}
            >
              <BrandSelectTrigger className="h-7 text-[11px]">
                <BrandSelectValue />
              </BrandSelectTrigger>
              <BrandSelectContent>
                {kindOptions.map((opt) => (
                  <BrandSelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </BrandSelectItem>
                ))}
              </BrandSelectContent>
            </BrandSelect>
          </Field>

          {/* Agent Role */}
          <Field label="角色">
            <BrandInput
              ref={roleInputRef}
              value={data.agentRole}
              onChange={(e) => handleChange({ agentRole: e.target.value })}
              className="h-7 text-[11px] font-mono"
              placeholder="agent_role_name"
            />
          </Field>

          {/* Output Key */}
          <Field label="输出键">
            <BrandInput
              value={data.outputKey}
              onChange={(e) => handleChange({ outputKey: e.target.value })}
              className="h-7 text-[11px] font-mono"
              placeholder="output_key"
            />
          </Field>

          {/* Task Instruction */}
          <Field label="任务说明" hint="清空后恢复默认说明">
            <BrandTextarea
              value={effectiveTaskInstruction}
              onChange={(e) => handleChange({ taskInstruction: e.target.value })}
              rows={4}
              className="min-h-[80px] resize-y px-2.5 py-2 text-[11px] leading-relaxed"
              placeholder="输入任务说明..."
            />
          </Field>

          {/* Is Entry */}
          <div className="flex items-center gap-2 py-1">
            <BrandCheckbox
              checked={data.isEntry}
              onCheckedChange={(checked) => handleChange({ isEntry: checked === true })}
              id="is-entry"
            />
            <label
              htmlFor="is-entry"
              className="cursor-pointer text-[11px] text-neutral-600 dark:text-neutral-300"
            >
              设为工作流入口
            </label>
          </div>

          {/* Retry + Timeout */}
          <div className="grid grid-cols-2 gap-2">
            <Field label="最大重试">
              <BrandInput
                type="number"
                min={0}
                max={10}
                value={String(data.maxRetries)}
                onChange={(e) =>
                  handleChange({ maxRetries: Math.min(10, Math.max(0, parseInt(e.target.value) || 0)) })
                }
                className="h-7 text-[11px]"
              />
            </Field>
            <Field label="超时(ms)">
              <BrandInput
                type="number"
                min={1000}
                step={1000}
                value={String(data.timeoutMs)}
                onChange={(e) =>
                  handleChange({ timeoutMs: Math.max(1000, parseInt(e.target.value) || 1000) })
                }
                className="h-7 text-[11px]"
              />
            </Field>
          </div>

          {/* Advanced Configuration Divider */}
          <div className="my-2 flex items-center gap-2">
            <div className="h-px flex-1 bg-neutral-200 dark:bg-neutral-700" />
            <span className="text-[9px] font-medium uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
              高级配置
            </span>
            <div className="h-px flex-1 bg-neutral-200 dark:bg-neutral-700" />
          </div>

          {/* Model Configuration Section */}
          <CollapsibleSection
            title="模型配置"
            icon={Cpu}
            defaultOpen={!!data.modelConfig?.provider}
          >
            <div className="space-y-2">
              <Field label="模型提供商">
                <BrandSelect
                  value={data.modelConfig?.provider || ''}
                  onValueChange={(value) =>
                    handleChange({
                      modelConfig: {
                        ...data.modelConfig,
                        provider: value as ModelProvider || undefined,
                      },
                    })
                  }
                >
                  <BrandSelectTrigger className="h-7 text-[11px]">
                    <BrandSelectValue placeholder="使用默认" />
                  </BrandSelectTrigger>
                  <BrandSelectContent>
                    <BrandSelectItem value="">使用默认</BrandSelectItem>
                    <BrandSelectItem value="glm">智谱 GLM</BrandSelectItem>
                    <BrandSelectItem value="claude">Claude</BrandSelectItem>
                    <BrandSelectItem value="openai">OpenAI</BrandSelectItem>
                  </BrandSelectContent>
                </BrandSelect>
              </Field>

              {data.modelConfig?.provider && (
                <>
                  <Field label="模型 ID">
                    <BrandInput
                      value={data.modelConfig?.model || ''}
                      onChange={(e) =>
                        handleChange({
                          modelConfig: {
                            ...data.modelConfig,
                            model: e.target.value || undefined,
                          },
                        })
                      }
                      className="h-7 text-[11px] font-mono"
                      placeholder="glm-4-flash / claude-3-sonnet"
                    />
                  </Field>

                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Temperature">
                      <BrandInput
                        type="number"
                        min={0}
                        max={2}
                        step={0.1}
                        value={String(data.modelConfig?.temperature ?? 0.7)}
                        onChange={(e) =>
                          handleChange({
                            modelConfig: {
                              ...data.modelConfig,
                              temperature: Math.min(2, Math.max(0, parseFloat(e.target.value) || 0.7)),
                            },
                          })
                        }
                        className="h-7 text-[11px]"
                      />
                    </Field>
                    <Field label="最大 Token">
                      <BrandInput
                        type="number"
                        min={100}
                        step={100}
                        value={String(data.modelConfig?.maxTokens ?? 4096)}
                        onChange={(e) =>
                          handleChange({
                            modelConfig: {
                              ...data.modelConfig,
                              maxTokens: Math.max(100, parseInt(e.target.value) || 4096),
                            },
                          })
                        }
                        className="h-7 text-[11px]"
                      />
                    </Field>
                  </div>
                </>
              )}

              <button
                type="button"
                onClick={() => handleChange({ modelConfig: undefined })}
                className="text-[10px] text-neutral-400 hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300"
              >
                重置为默认
              </button>
            </div>
          </CollapsibleSection>

          {/* Prompt Template Section */}
          <CollapsibleSection
            title="提示词模板"
            icon={Sparkles}
            defaultOpen={!!data.promptTemplate}
          >
            <div className="space-y-2">
              <Field label="模板内容" hint="支持 {{变量}} 语法">
                <BrandTextarea
                  value={data.promptTemplate || ''}
                  onChange={(e) =>
                    handleChange({ promptTemplate: e.target.value || undefined })
                  }
                  rows={4}
                  className="min-h-[80px] resize-y px-2.5 py-2 text-[11px] leading-relaxed font-mono"
                  placeholder="自定义提示词模板，可使用 {{outputKey}} 引用上游输出..."
                />
              </Field>
              <div className="rounded-md bg-neutral-50 px-2 py-1.5 dark:bg-neutral-800">
                <p className="text-[9px] text-neutral-500 dark:text-neutral-400">
                  可用变量：{' '}
                  <code className="text-[9px] text-violet-600 dark:text-violet-400">
                    {'{{input}}'}
                  </code>
                  {' - 上游节点输出'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleChange({ promptTemplate: undefined })}
                className="text-[10px] text-neutral-400 hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300"
              >
                使用默认模板
              </button>
            </div>
          </CollapsibleSection>
        </div>
      </div>

      {/* Footer actions */}
      <div className="shrink-0 border-t border-neutral-200/80 p-3 dark:border-neutral-700/80">
        <BrandButton
          variant="danger"
          onClick={handleDelete}
          className="flex h-8 w-full items-center gap-1.5 text-[11px]"
        >
          <Trash2 className="h-3 w-3" />
          删除节点
        </BrandButton>
      </div>
    </div>
  )
}

// Helper component for form fields
function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <label className="text-[10px] font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
          {label}
        </label>
        {hint && (
          <span className="text-[9px] text-neutral-400 dark:text-neutral-500">{hint}</span>
        )}
      </div>
      {children}
    </div>
  )
}

// Collapsible section component
function CollapsibleSection({
  title,
  icon: Icon,
  defaultOpen = false,
  children,
}: {
  title: string
  icon: React.ComponentType<{ className?: string }>
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <div className="rounded-md border border-neutral-200 dark:border-neutral-700">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between px-2.5 py-2 text-left transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800"
      >
        <div className="flex items-center gap-1.5">
          <Icon className="h-3 w-3 text-neutral-500 dark:text-neutral-400" />
          <span className="text-[10px] font-medium text-neutral-700 dark:text-neutral-300">
            {title}
          </span>
        </div>
        {isOpen ? (
          <ChevronDown className="h-3 w-3 text-neutral-400" />
        ) : (
          <ChevronRight className="h-3 w-3 text-neutral-400" />
        )}
      </button>
      {isOpen && <div className="border-t border-neutral-200 p-2.5 dark:border-neutral-700">{children}</div>}
    </div>
  )
}
