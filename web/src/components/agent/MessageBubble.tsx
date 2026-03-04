/**
 * MessageBubble - renders a single message (user or assistant) with optional streaming state.
 *
 * Handles both user and assistant messages in one unified component.
 * Streaming is just a transient state prop, not a different component.
 */

import { User, Bot } from 'lucide-react'
import type { Message } from '@/agent/message-types'
import { ReasoningSection } from './ReasoningSection'
import { MarkdownContent } from './MarkdownContent'
import { ToolCallDisplay } from './ToolCallDisplay'
import { CopyButton } from './CopyButton'

/** Format token count: 999 → "999", 1234 → "1.2K" */
function formatTokens(n: number): string {
  if (n < 1000) return String(n)
  return (n / 1000).toFixed(n < 10000 ? 2 : 1) + 'K'
}

interface StreamingState {
  /** Reasoning is actively streaming */
  reasoning?: boolean
  /** Content is actively streaming */
  content?: boolean
}

interface MessageBubbleProps {
  /** The message to display */
  message: Message

  /** Optional streaming state (only applies when processing this message) */
  streaming?: StreamingState

  /** Whether to show avatar (default: true) */
  showAvatar?: boolean

  /** For assistant messages: collapse reasoning section when not streaming */
  reasoningCollapsed?: boolean

  /** For assistant messages: tool results map */
  toolResults?: Map<string, string>
}

export function MessageBubble({
  message,
  streaming,
  showAvatar = true,
  reasoningCollapsed = true,
  toolResults,
}: MessageBubbleProps) {
  const isUser = message.role === 'user'
  const isStreamingReasoning = streaming?.reasoning ?? false
  const isStreamingContent = streaming?.content ?? false

  // User message rendering
  if (isUser) {
    return (
      <div className="flex flex-row-reverse gap-3">
        {/* Avatar */}
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300">
          <User className="h-4 w-4" />
        </div>

        {/* Content */}
        <div className="min-w-0 max-w-[80%]">
          <div className="inline-block rounded-lg bg-primary-600 px-4 py-2 text-sm text-white">
            <div className="whitespace-pre-wrap break-words">{message.content}</div>
          </div>

          {/* Timestamp + Copy button */}
          <div className="mt-1 flex items-center justify-end gap-2 text-xs text-neutral-400">
            <span>
              {new Date(message.timestamp).toLocaleTimeString('zh-CN', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
            <CopyButton content={message.content || ''} />
          </div>
        </div>
      </div>
    )
  }

  // Assistant message rendering
  const hasReasoning = !!(message.reasoning && (!reasoningCollapsed || isStreamingReasoning))
  const hasContent = !!message.content
  const hasToolCalls = message.toolCalls && message.toolCalls.length > 0

  // For assistant, avatar is on the left
  return (
    <div className="flex gap-3">
      {/* Avatar */}
      {showAvatar && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-700">
          <Bot className="h-4 w-4" />
        </div>
      )}

      {/* Content area */}
      <div className="min-w-0 max-w-[80%] space-y-2">
        {/* Reasoning */}
        {hasReasoning && (
          <ReasoningSection reasoning={message.reasoning!} streaming={isStreamingReasoning} />
        )}

        {/* Content */}
        {hasContent && (
          <div className="inline-block rounded-lg bg-white px-4 py-2 text-sm text-neutral-800 shadow-sm ring-1 ring-neutral-200 dark:bg-neutral-800 dark:text-neutral-100 dark:ring-neutral-700">
            <div className="prose-sm max-w-none break-words">
              <MarkdownContent content={message.content!} />
            </div>
            {/* Cursor when streaming */}
            {isStreamingContent && (
              <span className="ml-0.5 inline-block h-4 w-[2px] animate-pulse bg-neutral-400 align-text-bottom" />
            )}
          </div>
        )}

        {/* Tool calls */}
        {hasToolCalls && (
          <div className="space-y-1">
            {message.toolCalls!.map((tc) => (
              <ToolCallDisplay key={tc.id} toolCall={tc} result={toolResults?.get(tc.id)} />
            ))}
          </div>
        )}

        {/* Token usage (only show for completed messages, not streaming) */}
        {!isStreamingReasoning && !isStreamingContent && message.usage && (
          <div className="flex items-center gap-2 text-xs text-neutral-400">
            <span
              title={`输入 ${message.usage.promptTokens} + 输出 ${message.usage.completionTokens} = ${message.usage.totalTokens} tokens`}
            >
              ↑{formatTokens(message.usage.promptTokens)} ↓
              {formatTokens(message.usage.completionTokens)}
            </span>
            {message.content && <CopyButton content={message.content} />}
          </div>
        )}

        {/* Copy button for completed messages with content but no usage */}
        {!isStreamingReasoning && !isStreamingContent && !message.usage && message.content && (
          <CopyButton content={message.content} />
        )}
      </div>
    </div>
  )
}
