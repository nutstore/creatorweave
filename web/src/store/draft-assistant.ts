/**
 * Shared Draft Assistant logic — used by both main agent and subagents.
 *
 * This module was extracted from conversation.store.sqlite.ts to enable
 * reuse: subagents need the exact same draft step rendering pipeline
 * (reasoning streams, content streams, tool calls) as the main agent.
 *
 * The reducer (applyDraftAssistantEvent) is a pure function that mutates
 * a DraftAssistantHolder in place (compatible with Immer's draft state).
 */

import { parseThinkTags } from '@/agent/think-tags'
import type { DraftAssistantStep, ToolCall } from '@/agent/message-types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DraftAssistantState = {
  reasoning: string
  content: string
  toolCalls: ToolCall[]
  toolResults: Record<string, string>
  toolCall: ToolCall | null
  toolArgs: string
  steps: DraftAssistantStep[]
  activeReasoningStepId?: string | null
  activeContentStepId?: string | null
  activeToolStepId?: string | null
  activeCompressionStepId?: string | null
}

export type DraftAssistantEvent =
  | { type: 'message_start' }
  | { type: 'reasoning_start' }
  | { type: 'reasoning_stream_sync'; reasoning: string }
  | { type: 'reasoning_complete'; reasoning: string }
  | { type: 'content_start' }
  | { type: 'content_stream_sync'; content: string }
  | { type: 'content_complete'; content: string }
  | { type: 'tool_start'; toolCall: ToolCall }
  | {
      type: 'tool_delta'
      argsDelta: string
      toolCallId?: string
      isCurrentToolDelta: boolean
    }
  | {
      type: 'tool_complete'
      toolCall: ToolCall
      result: string
      isCurrentTool: boolean
      nextToolCall: ToolCall | null
      streamedArgsByCallId: Record<string, string>
    }
  | { type: 'compression_start' }
  | { type: 'compression_complete'; mode: 'skip' | 'compress' }
  | {
      type: 'subagent_progress'
      agentId: string
      status: string
      summary: string
      timestamp: number
    }

/**
 * Minimal interface for objects that hold a draftAssistant.
 * The property is optional to accommodate both Conversation (where
 * draftAssistant? is optional) and ConversationRuntime (where
 * draftAssistant: is required). The reducer guards against null/undefined.
 */
export interface DraftAssistantHolder {
  draftAssistant?: DraftAssistantState | null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createDraftStepId(prefix: 'reasoning' | 'content' | 'compression'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function findDraftStep(draft: DraftAssistantState, stepId: string): DraftAssistantStep | undefined {
  return draft.steps.find((s) => s.id === stepId)
}

function findLatestToolStepByToolCallId(
  draft: DraftAssistantState,
  toolCallId: string,
  streamingOnly = false
): Extract<DraftAssistantStep, { type: 'tool_call' }> | undefined {
  for (let i = draft.steps.length - 1; i >= 0; i--) {
    const step = draft.steps[i]
    if (step.type !== 'tool_call') continue
    if (step.toolCall.id !== toolCallId) continue
    if (streamingOnly && !step.streaming) continue
    return step
  }
  return undefined
}

function ensureDraftTextStep(
  draft: DraftAssistantState,
  stepType: 'reasoning' | 'content'
): string {
  // Only reuse the last step if it is the same type AND still streaming.
  // Completed steps must NOT be reused — a new iteration of the agent loop
  // should produce a brand-new step so the UI shows distinct content blocks
  // in chronological order rather than overwriting the previous one.
  const last = draft.steps[draft.steps.length - 1]
  if (last && last.type === stepType && last.streaming) {
    if (!last.timestamp) {
      last.timestamp = Date.now()
    }
    return last.id
  }
  const now = Date.now()
  const stepId = createDraftStepId(stepType)
  draft.steps.push({
    id: stepId,
    timestamp: now,
    type: stepType,
    content: '',
    streaming: true,
  })
  return stepId
}

/**
 * For providers that inline reasoning in `<think>...</think>` inside content stream,
 * ensure we still have a dedicated reasoning step so streaming UI can render it.
 * The step is inserted before active content step to preserve logical order.
 */
function ensureImplicitReasoningStepForContentStream(draft: DraftAssistantState): string {
  if (draft.activeReasoningStepId) {
    const existing = findDraftStep(draft, draft.activeReasoningStepId)
    if (existing && existing.type === 'reasoning') {
      existing.streaming = true
      return existing.id
    }
  }

  const now = Date.now()
  const stepId = createDraftStepId('reasoning')
  const step: DraftAssistantStep = {
    id: stepId,
    timestamp: now,
    type: 'reasoning',
    content: '',
    streaming: true,
  }
  const activeContentIndex = draft.activeContentStepId
    ? draft.steps.findIndex((s) => s.id === draft.activeContentStepId)
    : -1
  if (activeContentIndex >= 0) {
    draft.steps.splice(activeContentIndex, 0, step)
  } else {
    draft.steps.push(step)
  }
  draft.activeReasoningStepId = stepId
  return stepId
}

function syncDraftTextStepContent(
  draft: DraftAssistantState,
  stepId: string | null | undefined,
  content: string,
  streaming: boolean
): void {
  if (!stepId) return
  const step = findDraftStep(draft, stepId)
  if (!step) return
  if (step.type !== 'reasoning' && step.type !== 'content') return
  step.content = content
  step.streaming = streaming
}

function hasExplicitReasoningStep(draft: DraftAssistantState): boolean {
  return draft.steps.some((step) => step.type === 'reasoning')
}

// ---------------------------------------------------------------------------
// State management
// ---------------------------------------------------------------------------

export function createEmptyDraftAssistant(): DraftAssistantState {
  return {
    reasoning: '',
    content: '',
    toolCalls: [],
    toolResults: {},
    toolCall: null,
    toolArgs: '',
    steps: [],
    activeReasoningStepId: null,
    activeContentStepId: null,
    activeToolStepId: null,
    activeCompressionStepId: null,
  }
}

function ensureDraftAssistantForMessageStart(conv: DraftAssistantHolder): DraftAssistantState {
  const previous = conv.draftAssistant
  const next: DraftAssistantState = {
    reasoning: '',
    content: '',
    toolCalls: previous?.toolCalls ? [...previous.toolCalls] : [],
    toolResults: previous?.toolResults ? { ...previous.toolResults } : {},
    toolCall: null,
    toolArgs: '',
    // Preserve steps from previous iterations, but only those that are still
    // actively streaming OR are tool_call/compression steps with results.
    // Completed content/reasoning/compression steps from previous iterations
    // are stale — their content has been persisted as committed messages.
    steps: previous?.steps
      ? previous.steps.filter((s) => {
          // Always keep streaming steps (actively in-progress)
          if (s.streaming) return true
          // Keep tool_call steps (they show tool execution progress + results)
          if (s.type === 'tool_call') return true
          // Drop completed content, reasoning, and compression steps — they're
          // now represented in committed messages via message_end → onMessagesUpdated
          return false
        })
      : [],
    activeReasoningStepId: null,
    activeContentStepId: null,
    activeToolStepId: null,
    activeCompressionStepId: null,
  }
  conv.draftAssistant = next
  return next
}

/**
 * The pure reducer that processes a DraftAssistantEvent and mutates
 * the draft state. Used by both main agent and subagent event pipelines.
 */
export function applyDraftAssistantEvent(conv: DraftAssistantHolder, event: DraftAssistantEvent): void {
  if (event.type === 'message_start') {
    ensureDraftAssistantForMessageStart(conv)
    return
  }

  const draft = conv.draftAssistant
  if (!draft) return

  switch (event.type) {
    case 'reasoning_start': {
      draft.activeReasoningStepId = ensureDraftTextStep(draft, 'reasoning')
      return
    }
    case 'reasoning_stream_sync': {
      draft.reasoning = event.reasoning
      syncDraftTextStepContent(draft, draft.activeReasoningStepId, event.reasoning, true)
      return
    }
    case 'reasoning_complete': {
      draft.reasoning = event.reasoning
      syncDraftTextStepContent(draft, draft.activeReasoningStepId, event.reasoning, false)
      draft.activeReasoningStepId = null
      return
    }
    case 'content_start': {
      draft.activeContentStepId = ensureDraftTextStep(draft, 'content')
      return
    }
    case 'content_stream_sync': {
      const parsedThink = parseThinkTags(event.content)
      draft.content = parsedThink.hasThinkTag ? parsedThink.content : event.content
      if (
        parsedThink.reasoning &&
        (!hasExplicitReasoningStep(draft) || !!draft.activeReasoningStepId)
      ) {
        draft.reasoning = parsedThink.reasoning
        const reasoningStepId = ensureImplicitReasoningStepForContentStream(draft)
        syncDraftTextStepContent(draft, reasoningStepId, parsedThink.reasoning, true)
      }
      syncDraftTextStepContent(draft, draft.activeContentStepId, draft.content, true)
      return
    }
    case 'content_complete': {
      const parsedThink = parseThinkTags(event.content)
      draft.content = parsedThink.hasThinkTag ? parsedThink.content : event.content
      if (
        parsedThink.reasoning &&
        (!hasExplicitReasoningStep(draft) || !!draft.activeReasoningStepId)
      ) {
        draft.reasoning = parsedThink.reasoning
        const reasoningStepId = ensureImplicitReasoningStepForContentStream(draft)
        syncDraftTextStepContent(draft, reasoningStepId, parsedThink.reasoning, false)
        draft.activeReasoningStepId = null
      }
      syncDraftTextStepContent(draft, draft.activeContentStepId, draft.content, false)
      draft.activeContentStepId = null
      return
    }
    case 'tool_start': {
      const stepId = `tool-${event.toolCall.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      const now = Date.now()
      draft.toolCall = event.toolCall
      if (!draft.toolCalls.some((x) => x.id === event.toolCall.id)) {
        draft.toolCalls.push(event.toolCall)
      }
      const activeStep = draft.activeToolStepId ? findDraftStep(draft, draft.activeToolStepId) : undefined
      const existing =
        activeStep && activeStep.type === 'tool_call' && activeStep.toolCall.id === event.toolCall.id
          ? activeStep
          : findLatestToolStepByToolCallId(draft, event.toolCall.id, true)
      if (existing && existing.type === 'tool_call') {
        existing.streaming = true
        existing.toolCall = event.toolCall
        if (!existing.timestamp) {
          existing.timestamp = now
        }
        draft.activeToolStepId = existing.id
      } else {
        const created: DraftAssistantStep = {
          id: stepId,
          timestamp: now,
          type: 'tool_call',
          toolCall: event.toolCall,
          args: '',
          streaming: true,
        }
        draft.steps.push(created)
        draft.activeToolStepId = created.id
      }
      return
    }
    case 'tool_delta': {
      if (event.isCurrentToolDelta) {
        draft.toolArgs += event.argsDelta
      }
      const step =
        event.toolCallId
          ? findLatestToolStepByToolCallId(draft, event.toolCallId, true) ||
            findLatestToolStepByToolCallId(draft, event.toolCallId, false)
          : (draft.activeToolStepId ? findDraftStep(draft, draft.activeToolStepId) : undefined)
      if (step && step.type === 'tool_call') {
        step.args += event.argsDelta
      }
      return
    }
    case 'tool_complete': {
      const activeStep = draft.activeToolStepId ? findDraftStep(draft, draft.activeToolStepId) : undefined
      const completedStep =
        activeStep && activeStep.type === 'tool_call' && activeStep.toolCall.id === event.toolCall.id
          ? activeStep
          : findLatestToolStepByToolCallId(draft, event.toolCall.id, true) ||
            findLatestToolStepByToolCallId(draft, event.toolCall.id, false)
      const completedStepId = completedStep?.id
      draft.toolResults[event.toolCall.id] = event.result || ''
      const streamedArgs = event.streamedArgsByCallId[event.toolCall.id] || ''
      if (streamedArgs && draft.toolCalls) {
        const toolCallIndex = draft.toolCalls.findIndex((t) => t.id === event.toolCall.id)
        if (toolCallIndex !== -1) {
          draft.toolCalls[toolCallIndex] = {
            ...draft.toolCalls[toolCallIndex],
            function: {
              ...draft.toolCalls[toolCallIndex].function,
              arguments: streamedArgs,
            },
          }
        }
      }
      if (completedStep && completedStep.type === 'tool_call') {
        completedStep.result = event.result || ''
        completedStep.streaming = false
      }
      if (!event.isCurrentTool) return
      draft.toolCall = null
      draft.toolArgs = ''
      if (completedStepId && draft.activeToolStepId === completedStepId) {
        draft.activeToolStepId = null
      }
      if (event.nextToolCall) {
        draft.toolCall = event.nextToolCall
        draft.toolArgs = event.streamedArgsByCallId[event.nextToolCall.id] || ''
        draft.activeToolStepId = `tool-${event.nextToolCall.id}`
      }
      return
    }
    case 'compression_start': {
      const now = Date.now()
      const stepId = createDraftStepId('compression')
      draft.steps.push({
        id: stepId,
        timestamp: now,
        type: 'compression',
        content: '正在压缩历史上下文...',
        streaming: true,
      })
      draft.activeCompressionStepId = stepId
      return
    }
    case 'compression_complete': {
      const stepId = draft.activeCompressionStepId
      if (stepId) {
        const step = findDraftStep(draft, stepId)
        if (step && step.type === 'compression') {
          step.content =
            event.mode === 'skip' ? '上下文压缩评估完成（跳过摘要）' : '上下文已压缩并生成摘要'
          step.streaming = false
        }
      }
      draft.activeCompressionStepId = null
      return
    }
    case 'subagent_progress': {
      // Bridge subagent notification to the active tool step
      if (!draft.activeToolStepId) return
      const step = findDraftStep(draft, draft.activeToolStepId)
      if (!step || step.type !== 'tool_call') return
      const toolName = step.toolCall.function.name
      if (toolName !== 'spawn_subagent' && toolName !== 'batch_spawn') return
      if (!step.subagentEvents) step.subagentEvents = []
      step.subagentEvents.push({
        agentId: event.agentId,
        status: event.status,
        summary: event.summary,
        timestamp: event.timestamp,
      })
      return
    }
  }
}
