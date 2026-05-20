import type { ChatMessage } from '../llm/llm-provider'
import { createAssistantMessage, type Message } from '../message-types'

/**
 * Compression trigger threshold as a fraction of the model's context window.
 * When real token usage exceeds this ratio, context compression is activated.
 * Adjust this value to control when compression kicks in (default: 0.85).
 */
export const COMPRESSION_TRIGGER_RATIO = 0.85

export interface CompressionBaselineState {
  summary: string
  cutoffTimestamp: number
}

export interface ShouldCallLLMSummaryInput {
  droppedGroups: number
  droppedContent: string
  convertCallCount: number
  lastSummaryConvertCall: number
  minDroppedGroups: number
  minDroppedContentChars: number
  minIntervalConvertCalls: number
}

export function createHeuristicSummary(
  droppedContent: string,
  maxSummaryTokens: number,
  compressedMemoryPrefix: string
): string {
  const lines = droppedContent
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  const userGoals: string[] = []
  const decisions: string[] = []
  const files: string[] = []
  const toolFindings: string[] = []

  for (const line of lines) {
    if (line.startsWith('User:') && userGoals.length < 10) {
      userGoals.push(line.slice(5).trim())
    } else if (line.startsWith('Assistant:') && decisions.length < 10) {
      decisions.push(line.slice(10).trim().slice(0, 500))
    } else if (line.startsWith('Tool result:') && toolFindings.length < 8) {
      toolFindings.push(line.slice(12).trim().slice(0, 400))
    }
  }

  const parts: string[] = [compressedMemoryPrefix]
  if (userGoals.length > 0) {
    parts.push('**User Goal**: ' + userGoals[userGoals.length - 1]) // Most recent goal first
  }
  if (decisions.length > 0) {
    parts.push('**Key Decisions**:')
    decisions.slice(-5).forEach((d) => parts.push(`- ${d}`))
  }
  if (files.length > 0) {
    parts.push('**Files**: ' + files.join(', '))
  }
  if (toolFindings.length > 0) {
    parts.push('**Tool Findings**:')
    toolFindings.slice(-5).forEach((f) => parts.push(`- ${f}`))
  }

  const roughMaxChars = Math.max(200, maxSummaryTokens * 3)
  const combined = parts.join('\n')
  if (combined.length <= roughMaxChars) return combined
  return combined.slice(0, roughMaxChars) + '\n...[truncated]'
}

export function injectSummaryMessage(
  messages: ChatMessage[],
  summary: string,
  compressedMemoryPrefix: string
): ChatMessage[] {
  // Inject as a user message so internalToPiMessages() can correctly map it
  // (system-role ChatMessages are silently dropped by internalToPiMessages).
  const summaryMessage: ChatMessage = {
    role: 'user',
    content: `${compressedMemoryPrefix}\n${summary}`,
  }

  return [summaryMessage, ...messages]
}

/**
 * Find cutoff timestamp for rebuilding context after compression.
 * We drop all current messages covered by the summary, and keep only messages
 * that arrive after compression.
 */
export function getCompressionCutoffTimestamp(messages: Message[]): number | null {
  const latestTimestamp = messages.reduce<number | null>((max, msg) => {
    if (typeof msg.timestamp !== 'number') return max
    if (max == null || msg.timestamp > max) return msg.timestamp
    return max
  }, null)
  if (latestTimestamp == null) return null
  // Set cutoff strictly after the latest summarized message so the immediate
  // compressed request can be summary-only.
  return latestTimestamp + 1
}

/**
 * Rebuild model input context from compression baseline:
 * [summary] + [messages at/after cutoff].
 */
export function applyCompressionBaseline(
  messages: Message[],
  baseline: CompressionBaselineState,
  compressedMemoryPrefix: string
): Message[] {
  const retained = messages.filter(
    (msg) => typeof msg.timestamp === 'number' && msg.timestamp >= baseline.cutoffTimestamp
  )

  // Use createAssistantMessage with kind='context_summary' so that
  // internalToPiMessages() can recognise and correctly map it to a system-context
  // message for the LLM.  The kind flag also allows the store layer to strip
  // it from persisted conversation history.
  const summaryMessage = createAssistantMessage(
    `${compressedMemoryPrefix}\n${baseline.summary}`,
    undefined,
    undefined,
    null,
    'context_summary'
  )
  summaryMessage.timestamp = Math.max(0, baseline.cutoffTimestamp - 1)
  return [summaryMessage, ...retained]
}

export function shouldCallLLMSummary(input: ShouldCallLLMSummaryInput): boolean {
  if (input.droppedGroups < input.minDroppedGroups) return false
  if (input.droppedContent.trim().length < input.minDroppedContentChars) return false
  if (input.convertCallCount - input.lastSummaryConvertCall < input.minIntervalConvertCalls) {
    return false
  }
  return true
}
