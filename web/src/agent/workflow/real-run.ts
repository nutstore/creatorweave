import { stream, type Api, type Context, type Model } from '@mariozechner/pi-ai'
import { resolvePiAIModel } from '@/agent/llm/pi-ai-model-resolver'
import { ensurePiAICustomProvidersRegistered } from '@/agent/llm/pi-ai-custom-openai-fetch'
import type { LLMProviderType } from '@/agent/providers/types'
import type { RubricDefinition } from './rubric'
import type { WorkflowNodeKind } from './types'
import { executeWorkflowRun, type ExecuteWorkflowRunResult } from './workflow-executor'
import { NodeOutputStore, gatherInputs } from './node-io'
import { buildNodeSystemPrompt, buildNodeUserMessage } from './node-prompts'
import { getWorkflowTemplateBundle } from './templates'
import { parseRubricDsl } from './rubric'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface RealRunOptions {
  templateId: string
  rubricDsl?: string
  initialInputs?: Record<string, string>
  apiKey: string
  providerType: LLMProviderType
  baseUrl: string
  model: string
  /** API mode for custom providers: 'chat-completions' or 'responses' */
  apiMode?: 'chat-completions' | 'responses'
  abortSignal?: AbortSignal
  onNodeStart?: (nodeId: string, kind: WorkflowNodeKind) => void
  onNodeComplete?: (nodeId: string, output: string) => void
  onNodeError?: (nodeId: string, error: string) => void
  onNodeReasoningDelta?: (nodeId: string, delta: string) => void
  onNodeContentDelta?: (nodeId: string, delta: string) => void
  onNodeStepStart?: (nodeId: string, stepId: string, stepType: 'reasoning' | 'content') => void
  onNodeStepEnd?: (nodeId: string, stepId: string) => void
  /**
   * Optional enhancement function applied to each node's system prompt.
   * When provided, this replaces the bare LLM call with one that reuses
   * AgentLoop's enhancement pipeline (skills, MCP tools, intelligence coordinator).
   */
  enhanceSystemPrompt?: (
    basePrompt: string,
    userMessage: string,
  ) => Promise<string>
}

export interface RealRunSuccess {
  ok: true
  templateId: string
  label: string
  status: ExecuteWorkflowRunResult['status']
  summary: string
  execution: ExecuteWorkflowRunResult
  nodeOutputs: Record<string, string>
  totalTokens: number
}

export interface RealRunFailure {
  ok: false
  errors: string[]
}

export type RealRunResult = RealRunSuccess | RealRunFailure

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function textFromPiContent(content: Array<unknown>): string {
  const parts: string[] = []
  for (const item of content) {
    if ((item as { type?: string }).type === 'text') {
      parts.push((item as { text: string }).text)
    }
  }
  return parts.join('')
}

function textFromPiThinking(content: Array<unknown>): string {
  const parts: string[] = []
  for (const item of content) {
    if ((item as { type?: string }).type === 'thinking') {
      parts.push((item as { thinking: string }).thinking)
    }
  }
  return parts.join('')
}

interface ReviewScore {
  score: number
  passed: boolean
  issues?: string[]
  suggestions?: string[]
}

export function parseReviewResult(raw: string): ReviewScore | null {
  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return null

  try {
    const parsed = JSON.parse(jsonMatch[0])
    if (typeof parsed.score === 'number' && typeof parsed.passed === 'boolean') {
      return {
        score: parsed.score,
        passed: parsed.passed,
        issues: Array.isArray(parsed.issues) ? parsed.issues : [],
        suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
      }
    }
  } catch {
    // not valid JSON
  }
  return null
}

function evaluateReviewResult(
  rawContent: string,
  _rubric: RubricDefinition
): { status: 'success' | 'review_failed'; output?: string; reason?: string } {
  const review = parseReviewResult(rawContent)

  if (!review) {
    return {
      status: 'review_failed',
      reason: 'Cannot parse review result, LLM did not return valid JSON score',
    }
  }

  if (review.passed && review.score >= 80) {
    return { status: 'success', output: rawContent }
  }

  const issues = review.issues?.length
    ? review.issues.join('; ')
    : `Score ${review.score} did not meet passing standard`

  return {
    status: 'review_failed',
    reason: issues,
  }
}

function formatRealRunSummary(
  templateId: string,
  label: string,
  execution: ExecuteWorkflowRunResult,
  totalTokens: number
): string {
  const lines: string[] = [
    `Workflow real run: ${label} (${templateId})`,
    `Status: ${execution.status}`,
    `Execution order: ${execution.executionOrder.join(' → ')}`,
    `Executed nodes: ${execution.executedNodeIds.join(' → ') || '(none)'}`,
    `Repair rounds: ${execution.repairRound}`,
    `Token consumption: ${totalTokens}`,
  ]

  if (execution.errors.length > 0) {
    lines.push('Errors:')
    for (const error of execution.errors) {
      lines.push(`- ${error}`)
    }
  }

  return lines.join('\n')
}

function createAbortError(): Error {
  const error = new Error('workflow real-run aborted')
  error.name = 'AbortError'
  return error
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw createAbortError()
  }
}

async function callLLM(params: {
  apiKey: string
  model: Model<Api>
  systemPrompt: string
  userMessage: string
  abortSignal?: AbortSignal
  nodeId?: string
  enhanceSystemPrompt?: (basePrompt: string, userMessage: string) => Promise<string>
  onReasoningDelta?: (nodeId: string, delta: string) => void
  onContentDelta?: (nodeId: string, delta: string) => void
  onStepStart?: (nodeId: string, stepId: string, stepType: 'reasoning' | 'content') => void
  onStepEnd?: (nodeId: string, stepId: string) => void
}): Promise<{ content: string; reasoning: string; tokens: number }> {
  const {
    apiKey,
    model,
    systemPrompt: rawSystemPrompt,
    userMessage,
    abortSignal,
    nodeId,
    enhanceSystemPrompt,
    onReasoningDelta,
    onContentDelta,
    onStepStart,
    onStepEnd,
  } = params

  throwIfAborted(abortSignal)

  // Apply enhancement pipeline (skills, MCP, intelligence coordinator)
  let systemPrompt = rawSystemPrompt
  if (enhanceSystemPrompt) {
    try {
      systemPrompt = await enhanceSystemPrompt(rawSystemPrompt, userMessage)
    } catch (error) {
      console.warn('[workflow-callLLM] System prompt enhancement failed, using raw prompt:', error)
    }
  }

  const context: Context = {
    systemPrompt,
    messages: [
      { role: 'user', content: userMessage, timestamp: Date.now() },
    ],
    tools: [],
  }

  const eventStream = stream(model, context, {
    apiKey,
    maxTokens: 4096,
    signal: abortSignal,
  })

  let content = ''
  let reasoning = ''
  let tokens = 0
  let reasoningStepId: string | null = null
  let contentStepId: string | null = null

  for await (const event of eventStream) {
    throwIfAborted(abortSignal)

    if (event.type === 'thinking_start') {
      reasoningStepId = `step-r-${Date.now()}`
      if (nodeId) onStepStart?.(nodeId, reasoningStepId, 'reasoning')
    }
    if (event.type === 'thinking_delta') {
      reasoning += event.delta
      if (nodeId) onReasoningDelta?.(nodeId, event.delta)
    }
    if (event.type === 'thinking_end') {
      reasoning = textFromPiThinking(event.partial.content as Array<unknown>) || reasoning
      if (nodeId && reasoningStepId) onStepEnd?.(nodeId, reasoningStepId)
      reasoningStepId = null
    }
    if (event.type === 'text_start') {
      contentStepId = `step-c-${Date.now()}`
      if (nodeId) onStepStart?.(nodeId, contentStepId, 'content')
    }
    if (event.type === 'text_delta') {
      content += event.delta
      if (nodeId) onContentDelta?.(nodeId, event.delta)
    }
    if (event.type === 'text_end') {
      content = textFromPiContent(event.partial.content as Array<unknown>) || content
      if (nodeId && contentStepId) onStepEnd?.(nodeId, contentStepId)
      contentStepId = null
    }
    if (event.type === 'done') {
      tokens = event.message.usage.totalTokens
    }
    if (event.type === 'error') {
      throw new Error(event.error.errorMessage || 'LLM streaming failed')
    }
  }

  return { content, reasoning, tokens }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function runRealWorkflow(options: RealRunOptions): Promise<RealRunResult> {
  throwIfAborted(options.abortSignal)

  const bundle = getWorkflowTemplateBundle(options.templateId)
  if (!bundle) {
    return { ok: false, errors: [`unknown workflow template: ${options.templateId}`] }
  }

  let rubric = bundle.rubric
  const trimmedRubricDsl = options.rubricDsl?.trim()
  if (trimmedRubricDsl) {
    const parsed = parseRubricDsl(trimmedRubricDsl)
    if (!parsed.ok) {
      return { ok: false, errors: parsed.errors }
    }
    rubric = parsed.rubric
  }

  ensurePiAICustomProvidersRegistered()
  const piModel = resolvePiAIModel(options.providerType, options.model, options.baseUrl, options.apiMode)

  const outputStore = new NodeOutputStore()
  const initialInputs = new Map<string, string>(Object.entries(options.initialInputs || {}))
  let totalTokens = 0

  const execution = await executeWorkflowRun({
    workflow: bundle.workflow,
    rubric,
    executeNode: async ({ node }) => {
      if (options.abortSignal?.aborted) {
        return { status: 'fatal_error', reason: 'workflow real-run aborted' } as const
      }

      const inputs = gatherInputs(node.inputRefs, outputStore)
      if (node.inputRefs.length === 0 && initialInputs.size > 0) {
        for (const [key, value] of initialInputs.entries()) {
          if (!inputs.has(key)) {
            inputs.set(key, value)
          }
        }
      }
      const systemPrompt = buildNodeSystemPrompt(node.kind, node.agentRole, node.taskInstruction)
      const userMessage = buildNodeUserMessage(inputs)

      options.onNodeStart?.(node.id, node.kind)

      try {
        const result = await callLLM({
          apiKey: options.apiKey,
          model: piModel,
          systemPrompt,
          userMessage,
          abortSignal: options.abortSignal,
          nodeId: node.id,
          enhanceSystemPrompt: options.enhanceSystemPrompt,
          onReasoningDelta: (nodeId, delta) => options.onNodeReasoningDelta?.(nodeId, delta),
          onContentDelta: (nodeId, delta) => options.onNodeContentDelta?.(nodeId, delta),
          onStepStart: (nodeId, stepId, stepType) => options.onNodeStepStart?.(nodeId, stepId, stepType),
          onStepEnd: (nodeId, stepId) => options.onNodeStepEnd?.(nodeId, stepId),
        })

        totalTokens += result.tokens

        if (result.content && node.outputKey) {
          outputStore.set(node.outputKey, result.content)
        }

        options.onNodeComplete?.(node.id, result.content)

        if (node.kind === 'review') {
          return evaluateReviewResult(result.content, rubric)
        }

        return { status: 'success', output: result.content }
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        options.onNodeError?.(node.id, reason)
        return { status: 'fatal_error', reason }
      }
    },
    repair: async () => {
      // repair is handled by the executor's retry loop
    },
  })

  const nodeOutputs: Record<string, string> = {}
  for (const node of bundle.workflow.nodes) {
    const content = outputStore.get(node.outputKey)
    if (content !== undefined) {
      nodeOutputs[node.outputKey] = content
    }
  }

  return {
    ok: true,
    templateId: bundle.id,
    label: bundle.label,
    status: execution.status,
    summary: formatRealRunSummary(bundle.id, bundle.label, execution, totalTokens),
    execution,
    nodeOutputs,
    totalTokens,
  }
}
