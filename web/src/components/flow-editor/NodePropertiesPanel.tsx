/**
 * NodePropertiesPanel — right-side panel for editing selected node config.
 * Renders different fields based on node kind.
 */

import { useCallback } from 'react'
import {
  Trash2,
  MousePointerClick,
  FileInput,
  Wrench,
  Sparkles,
  ShieldCheck,
  CornerDownRight,
  Activity,
  GitBranch,
  Plus,
  X,
} from 'lucide-react'
import { cn, BrandButton, BrandInput, BrandTextarea, BrandSelect, BrandSelectContent, BrandSelectItem, BrandSelectTrigger, BrandSelectValue } from '@creatorweave/ui'
import { NODE_KIND_CONFIG } from './constants'
import { TraceTimeline } from './FlowRunOverlay'
import type { FlowNode, FlowNodeKind, FlowNodeRunResult } from '@/agent/flow/types'

const KIND_ICONS: Record<FlowNodeKind, React.ComponentType<{ className?: string }>> = {
  input: FileInput,
  tool: Wrench,
  llm: Sparkles,
  review: ShieldCheck,
  output: CornerDownRight,
  router: GitBranch,
}

interface NodePropertiesPanelProps {
  selectedNode: FlowNode | null
  onUpdateNode: (nodeId: string, patch: Partial<FlowNode>) => void
  onDeleteNode: (nodeId: string) => void
  /** Run result for the selected node (from the latest flow run). */
  runResult?: FlowNodeRunResult | null
}

export function NodePropertiesPanel({ selectedNode, onUpdateNode, onDeleteNode, runResult }: NodePropertiesPanelProps) {
  const handleChange = useCallback(
    (patch: Partial<FlowNode>) => {
      if (!selectedNode) return
      onUpdateNode(selectedNode.id, patch)
    },
    [selectedNode, onUpdateNode]
  )

  const handleConfigChange = useCallback(
    (configPatch: Record<string, unknown>) => {
      if (!selectedNode) return
      onUpdateNode(selectedNode.id, {
        config: { ...selectedNode.config, ...configPatch } as FlowNode['config'],
      })
    },
    [selectedNode, onUpdateNode]
  )

  // Empty state
  if (!selectedNode) {
    return (
      <div className="flex h-full flex-col">
        <div className="shrink-0 border-b border-neutral-200/80 px-3 py-2.5 dark:border-neutral-700/80">
          <h3 className="text-[11px] font-semibold text-neutral-400 dark:text-neutral-500">
            节点属性
          </h3>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center px-4 py-8 text-center">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-neutral-100 dark:bg-neutral-800">
            <MousePointerClick className="h-4 w-4 text-neutral-400 dark:text-neutral-500" />
          </div>
          <p className="text-[11px] font-medium text-neutral-400 dark:text-neutral-500">
            选中节点编辑属性
          </p>
        </div>
      </div>
    )
  }

  const config = NODE_KIND_CONFIG[selectedNode.kind]
  const Icon = KIND_ICONS[selectedNode.kind]

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="shrink-0 border-b border-neutral-200/80 dark:border-neutral-700/80">
        <div className="flex items-center gap-2 px-3 py-2.5">
          <div className="flex h-5 w-5 items-center justify-center rounded" style={{ backgroundColor: config.accentHex + '20' }}>
            <Icon className={cn('h-3 w-3', config.iconColor)} />
          </div>
          <h3 className="truncate text-[11px] font-semibold text-neutral-700 dark:text-foreground">
            {config.label} 节点
          </h3>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        <div className="space-y-3 p-3">
          {/* Label */}
          <Field label="名称">
            <BrandInput
              value={selectedNode.label}
              onChange={(e) => handleChange({ label: e.target.value })}
              className="h-7 text-[11px]"
              placeholder="节点名称"
            />
          </Field>

          {/* Kind-specific config */}
          <ConfigEditor
            node={selectedNode}
            onConfigChange={handleConfigChange}
          />

          {/* Retry (for non-input/output nodes) */}
          {selectedNode.kind !== 'input' && selectedNode.kind !== 'output' && (
            <Field label="重试次数">
              <BrandInput
                type="number"
                min={0}
                max={10}
                value={String(selectedNode.retry ?? 1)}
                onChange={(e) =>
                  handleChange({ retry: Math.min(10, Math.max(0, parseInt(e.target.value) || 0)) })
                }
                className="h-7 text-[11px]"
              />
            </Field>
          )}
        </div>

        {/* Run trace — shown inside the scrollable area when node has results */}
        {runResult && (runResult.trace?.length || runResult.output !== undefined || runResult.error) && (
          <NodeRunTraceSection result={runResult} />
        )}
      </div>

      {/* Footer */}
      <div className="shrink-0 border-t border-neutral-200/80 p-3 dark:border-neutral-700/80">
        <BrandButton
          variant="danger"
          onClick={() => onDeleteNode(selectedNode.id)}
          className="flex h-8 w-full items-center gap-1.5 text-[11px]"
        >
          <Trash2 className="h-3 w-3" />
          删除节点
        </BrandButton>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Kind-specific config editors
// ---------------------------------------------------------------------------

function ConfigEditor({
  node,
  onConfigChange,
}: {
  node: FlowNode
  onConfigChange: (patch: Record<string, unknown>) => void
}) {
  const config = node.config as Record<string, unknown>

  switch (node.kind) {
    case 'input':
      return (
        <>
          <Field label="输入来源">
            <BrandSelect
              value={(config.inputType as string) ?? 'file'}
              onValueChange={(v) => onConfigChange({ inputType: v })}
            >
              <BrandSelectTrigger className="h-7 text-[11px]">
                <BrandSelectValue />
              </BrandSelectTrigger>
              <BrandSelectContent>
                <BrandSelectItem value="file">📄 读取文件</BrandSelectItem>
                <BrandSelectItem value="text">📝 手动输入</BrandSelectItem>
                <BrandSelectItem value="today">📅 今日日记</BrandSelectItem>
              </BrandSelectContent>
            </BrandSelect>
          </Field>
          {config.inputType === 'file' && (
            <Field label="文件路径" hint="支持 {{date}} 变量">
              <BrandInput
                value={(config.path as string) ?? ''}
                onChange={(e) => onConfigChange({ path: e.target.value })}
                className="h-7 text-[11px] font-mono"
                placeholder="Daily/{{date}}.md"
              />
            </Field>
          )}
          {config.inputType === 'text' && (
            <Field label="文本内容">
              <BrandTextarea
                value={(config.value as string) ?? ''}
                onChange={(e) => onConfigChange({ value: e.target.value })}
                rows={4}
                className="min-h-[80px] resize-y px-2.5 py-2 text-[11px]"
                placeholder="手动输入的文本..."
              />
            </Field>
          )}
        </>
      )

    case 'tool':
      return (
        <Field label="工具名称" hint="read / web_search / python / ...">
          <BrandInput
            value={(config.toolName as string) ?? ''}
            onChange={(e) => onConfigChange({ toolName: e.target.value })}
            className="h-7 text-[11px] font-mono"
            placeholder="read"
          />
        </Field>
      )

    case 'llm':
      return (
        <>
          <Field label="提示词" hint="用 {{input}} 引用上游数据，默认可使用全部工具">
            <BrandTextarea
              value={(config.prompt as string) ?? ''}
              onChange={(e) => onConfigChange({ prompt: e.target.value })}
              rows={4}
              className="min-h-[80px] resize-y px-2.5 py-2 text-[11px] leading-relaxed"
              placeholder="提取关键信息..."
            />
          </Field>

          <Field label="输出格式" hint="JSON 输出可被下游按字段引用">
            <div className="flex gap-1">
              {(['text', 'json'] as const).map((fmt) => (
                <button
                  key={fmt}
                  onClick={() => onConfigChange({ outputFormat: fmt })}
                  className={cn(
                    'flex-1 rounded-md border px-2 py-1 text-[10px] font-medium transition-colors',
                    (config.outputFormat ?? 'text') === fmt
                      ? 'border-neutral-400 bg-neutral-100 text-neutral-700 dark:border-neutral-500 dark:bg-neutral-800 dark:text-neutral-200'
                      : 'border-neutral-200 text-neutral-400 hover:border-neutral-300 dark:border-neutral-700 dark:hover:border-neutral-600'
                  )}
                >
                  {fmt === 'text' ? '文本' : 'JSON'}
                </button>
              ))}
            </div>
          </Field>

          {(config.outputFormat ?? 'text') === 'json' && (
            <Field label="JSON 结构" hint="描述字段名和类型">
              <BrandTextarea
                value={(config.jsonSchema as string) ?? ''}
                onChange={(e) => onConfigChange({ jsonSchema: e.target.value })}
                rows={2}
                className="resize-y px-2.5 py-2 text-[11px] leading-relaxed"
                placeholder="title: string, score: number, tags: string[]"
              />
            </Field>
          )}
        </>
      )

    case 'review':
      return (
        <>
          <Field label="验收标准">
            <BrandTextarea
              value={(config.criteria as string) ?? ''}
              onChange={(e) => onConfigChange({ criteria: e.target.value })}
              rows={3}
              className="min-h-[60px] resize-y px-2.5 py-2 text-[11px]"
              placeholder="不超过200字，包含关键事项"
            />
          </Field>
          <Field label="最低通过分数">
            <BrandInput
              type="number"
              min={0}
              max={100}
              value={String((config.minScore as number) ?? 80)}
              onChange={(e) => onConfigChange({ minScore: Math.min(100, Math.max(0, parseInt(e.target.value) || 80)) })}
              className="h-7 text-[11px]"
            />
          </Field>
        </>
      )

    case 'output':
      return (
        <Field label="写入路径" hint="留空则生成结果卡片">
          <BrandInput
            value={(config.path as string) ?? ''}
            onChange={(e) => onConfigChange({ path: e.target.value })}
            className="h-7 text-[11px] font-mono"
            placeholder="总结/{{date}}.md"
          />
        </Field>
      )

    case 'router':
      return <RouterConfigEditor node={node} onConfigChange={onConfigChange} />

    default:
      return null
  }
}

// ---------------------------------------------------------------------------
// Router config editor — dynamic rule list with add/remove
// ---------------------------------------------------------------------------

function RouterConfigEditor({
  node,
  onConfigChange,
}: {
  node: FlowNode
  onConfigChange: (patch: Record<string, unknown>) => void
}) {
  const config = node.config as { rules?: Array<{ label: string; expr: string; targetLabel?: string }> }
  const rules = config.rules ?? []

  const updateRule = (index: number, patch: Partial<{ label: string; expr: string; targetLabel: string }>) => {
    const next = rules.map((r, i) => (i === index ? { ...r, ...patch } : r))
    onConfigChange({ rules: next })
  }

  const addRule = () => {
    onConfigChange({ rules: [...rules, { label: `分支${rules.length + 1}`, expr: 'true' }] })
  }

  const removeRule = (index: number) => {
    const next = rules.filter((_, i) => i !== index)
    onConfigChange({ rules: next.length > 0 ? next : [{ label: '默认', expr: 'true' }] })
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <label className="text-[10px] font-medium uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
          路由规则
        </label>
        <span className="text-[9px] text-neutral-400">从上到下匹配第一个</span>
      </div>

      <div className="space-y-1.5">
        {rules.map((rule, i) => (
          <div key={i} className="rounded-md border border-neutral-200 p-1.5 dark:border-neutral-700">
            <div className="flex items-center gap-1">
              <span className="shrink-0 text-[9px] font-bold text-neutral-400">#{i + 1}</span>
              <BrandInput
                value={rule.label}
                onChange={(e) => updateRule(i, { label: e.target.value })}
                className="h-6 flex-1 text-[10px]"
                placeholder="分支名"
              />
              <button
                onClick={() => removeRule(i)}
                className="shrink-0 rounded p-0.5 text-neutral-400 hover:bg-neutral-100 hover:text-danger-500 dark:hover:bg-neutral-800"
                title="删除规则"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
            <BrandInput
              value={rule.expr}
              onChange={(e) => updateRule(i, { expr: e.target.value })}
              className="mt-1 h-6 text-[10px] font-mono"
              placeholder="{{score}} >= 80"
            />
          </div>
        ))}
      </div>

      <button
        onClick={addRule}
        className="flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-neutral-300 py-1 text-[10px] font-medium text-neutral-400 transition-colors hover:border-neutral-400 hover:text-neutral-500 dark:border-neutral-600 dark:hover:border-neutral-500"
      >
        <Plus className="h-3 w-3" />
        添加规则
      </button>

      <p className="text-[9px] leading-relaxed text-neutral-400">
        用 <code className="rounded bg-neutral-100 px-0.5 dark:bg-neutral-800">{'{{var}}'}</code> 引用上游数据字段，用 <code className="rounded bg-neutral-100 px-0.5 dark:bg-neutral-800">true</code> 作为兜底分支。
        从 router 连出的每条边会自动绑定对应规则。
      </p>
    </>
  )
}

// ---------------------------------------------------------------------------
// Run trace section — shows execution details below node config
// ---------------------------------------------------------------------------

function NodeRunTraceSection({ result }: { result: FlowNodeRunResult }) {
  const toolCount = result.trace?.filter((s) => s.type === 'tool_call').length ?? 0
  const thinkingCount = result.trace?.filter((s) => s.type === 'thinking').length ?? 0

  return (
    <div className="rounded-lg border border-primary-200/60 bg-primary-50/30 p-2.5 dark:border-primary-900/40 dark:bg-primary-950/10">
      <div className="mb-2 flex items-center gap-1.5">
        <Activity className="h-3.5 w-3.5 text-primary-500" />
        <span className="text-[11px] font-bold text-primary-600 dark:text-primary-400">
          运行记录
        </span>
        {toolCount > 0 && (
          <span className="rounded bg-neutral-100 px-1 text-[9px] text-neutral-500 dark:bg-neutral-800">
            🔧 {toolCount}
          </span>
        )}
        {thinkingCount > 0 && (
          <span className="rounded bg-primary-50 px-1 text-[9px] text-primary-500 dark:bg-primary-950/30">
            🧠 {thinkingCount}
          </span>
        )}
      </div>

      <div className="max-h-[200px] space-y-1.5 overflow-y-auto">
        {/* Trace timeline */}
        {result.trace && result.trace.length > 0 && <TraceTimeline trace={result.trace} />}

        {/* Final output */}
        {result.output !== undefined && result.output !== null && (
          <div className="rounded bg-neutral-50 px-2 py-1.5 dark:bg-neutral-800/50">
            <div className="mb-0.5 text-[9px] font-medium text-neutral-400">输出</div>
            <pre className="whitespace-pre-wrap break-words text-[10px] leading-relaxed text-neutral-600 dark:text-neutral-400">
              {formatOutput(result.output)}
            </pre>
          </div>
        )}

        {/* Error */}
        {result.error && (
          <div className="rounded bg-danger-50 px-2 py-1.5 text-[10px] text-danger-500 dark:bg-danger-950/30">
            {result.error}
          </div>
        )}
      </div>
    </div>
  )
}

function formatOutput(output: unknown): string {
  if (typeof output === 'string') return output
  if (typeof output === 'number' || typeof output === 'boolean') return String(output)
  try {
    return JSON.stringify(output, null, 2)
  } catch {
    return String(output)
  }
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

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
        <label className="text-[10px] font-medium uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
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
