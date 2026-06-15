/**
 * SubagentDetailPanel — Renders a subagent's internal execution steps
 * (reasoning, content, tool calls) in real-time.
 *
 * This component mirrors the main agent's draft step rendering but reads
 * from `subagentDrafts` in the runtime store instead of the main conversation's
 * draftAssistant. It uses the same ToolCallDisplay, ReasoningSection, etc.
 * components so the visual presentation is identical to the main agent.
 */

import { memo } from 'react'
import { Loader2 } from 'lucide-react'
import type { DraftAssistantStep } from '@/agent/message-types'
import { ToolCallDisplay } from './ToolCallDisplay'
import { ReasoningSection } from './ReasoningSection'
import { useConversationRuntimeStore } from '@/store/conversation-runtime.store'

// ─── Sub-components (mirrors AssistantTurnBubble's lightweight renderers) ──

function SubagentStreamingContent({
  reasoning,
  content,
  isStreamingReasoning,
  isStreamingContent,
}: {
  reasoning?: string
  content?: string
  isStreamingReasoning: boolean
  isStreamingContent: boolean
}) {
  return (
    <>
      {reasoning && <ReasoningSection reasoning={reasoning} streaming={isStreamingReasoning} />}
      {content && (
        <div className="rounded-lg bg-white px-3 py-1.5 text-sm text-neutral-800 dark:bg-neutral-800 dark:text-neutral-100">
          <div className="max-w-prose whitespace-pre-wrap break-words">
            {content}
            {isStreamingContent && (
              <span className="ml-0.5 inline-block h-3 w-[2px] animate-pulse bg-neutral-400 align-text-bottom" />
            )}
          </div>
        </div>
      )}
    </>
  )
}

function SubagentCompressionCard({ text, streaming }: { text: string; streaming: boolean }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300">
      <span>{text}</span>
      {streaming && (
        <span className="ml-1 inline-block h-3 w-3 animate-spin rounded-full border-2 border-slate-400 border-t-transparent align-text-bottom" />
      )}
    </div>
  )
}

function renderSubagentStep(
  step: DraftAssistantStep,
  toolResults: Map<string, string>,
): React.ReactNode {
  if (step.type === 'reasoning') {
    if (!step.content) return null
    return (
      <SubagentStreamingContent
        reasoning={step.content}
        isStreamingReasoning={step.streaming}
        isStreamingContent={false}
      />
    )
  }

  if (step.type === 'content') {
    if (!step.content) return null
    return (
      <SubagentStreamingContent
        content={step.content}
        isStreamingReasoning={false}
        isStreamingContent={step.streaming}
      />
    )
  }

  if (step.type === 'compression') {
    return <SubagentCompressionCard text={step.content} streaming={step.streaming} />
  }

  // tool_call — reuse the exact same ToolCallDisplay component as main agent
  return (
    <ToolCallDisplay
      toolCall={step.toolCall}
      result={step.result ?? toolResults.get(step.toolCall.id)}
      isExecuting={step.streaming && !(step.result ?? toolResults.get(step.toolCall.id))}
      streamingArgs={step.streaming ? step.args || undefined : undefined}
    />
  )
}

// ─── Main component ─────────────────────────────────────────────────────────

interface SubagentDetailPanelProps {
  agentId: string
}

export const SubagentDetailPanel = memo(function SubagentDetailPanel({
  agentId,
}: SubagentDetailPanelProps) {
  const draft = useConversationRuntimeStore(
    (state) => state.subagentDrafts.get(agentId)
  )

  if (!draft) {
    return (
      <div className="px-3 py-2 text-xs text-neutral-400">
        （中间过程数据不可用——可能是页面刷新后运行时状态已清除）
      </div>
    )
  }

  const steps = draft.steps
  if (steps.length === 0) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-xs text-neutral-400">
        <Loader2 className="h-3 w-3 animate-spin" />
        <span>等待响应...</span>
      </div>
    )
  }

  // Build a toolResults map from draft state
  const toolResults = new Map<string, string>()
  for (const [id, result] of Object.entries(draft.toolResults)) {
    toolResults.set(id, result)
  }

  return (
    <div className="space-y-1.5 px-1 py-1">
      {steps.map((step) => (
        <div key={step.id}>
          {renderSubagentStep(step, toolResults)}
        </div>
      ))}
    </div>
  )
})
