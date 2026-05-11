/**
 * MessageBubble - renders a single message (user or assistant) with optional streaming state.
 *
 * Handles both user and assistant messages in one unified component.
 * Streaming is just a transient state prop, not a different component.
 */

import { useState, memo } from 'react'
import { User, Bot, Trash2, Pencil } from 'lucide-react'
import type { Message } from '@/agent/message-types'
import { ReasoningSection } from './ReasoningSection'
import { MarkdownContent } from './MarkdownContent'
import { ToolCallDisplay } from './ToolCallDisplay'
import { CopyButton } from './CopyButton'
import { RegenerateButton } from './RegenerateButton'
import { AssetList } from './AssetCard'
import { InlineMessageEditor } from './InlineMessageEditor'
import { useT } from '@/i18n'

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
  /** For user messages: delete this user message and its whole agent loop */
  onDeleteAgentLoop?: (userMessageId: string) => void
  /** Disable delete action */
  disableDeleteActions?: boolean
  /** Regenerate callback */
  onRegenerate?: (userMessageId: string) => void
  /** Cancel current streaming output callback */
  onCancel?: () => void
  /** Whether is processing (streaming output) */
  isProcessing?: boolean
  /** Edit and resend callback */
  onEditAndResend?: (userMessageId: string, newContent: string) => void
  /** Agent candidates for @ mention in edit mode */
  mentionAgents?: { id: string; name?: string }[]
  /** Async file search callback for # file mention in edit mode */
  onSearchFiles?: (query: string) => Promise<import('./FileMentionExtension').FileMentionItem[]>
}

export const MessageBubble = memo(function MessageBubble({
  message,
  streaming,
  showAvatar = true,
  reasoningCollapsed = true,
  toolResults,
  onDeleteAgentLoop,
  disableDeleteActions = false,
  onRegenerate,
  onCancel,
  isProcessing = false,
  onEditAndResend,
  mentionAgents = [],
  onSearchFiles,
}: MessageBubbleProps) {
  const t = useT()
  const isUser = message.role === 'user'
  const isStreamingReasoning = streaming?.reasoning ?? false
  const isStreamingContent = streaming?.content ?? false

  // Edit state for user messages
  const [isEditing, setIsEditing] = useState(false)

  const handleStartEdit = () => {
    setIsEditing(true)
  }

  const handleCancelEdit = () => {
    setIsEditing(false)
  }

  const handleSubmitEdit = (newContent: string) => {
    const trimmed = newContent.trim()
    if (trimmed && onEditAndResend) {
      onEditAndResend(message.id, trimmed)
    }
    setIsEditing(false)
  }

  // User message rendering
  if (isUser) {
    return (
      <div className="flex flex-row-reverse gap-3">
        {/* Avatar */}
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300">
          <User className="h-4 w-4" />
        </div>

        {/* Content */}
        <div className={`min-w-0 flex flex-col ${isEditing ? 'flex-1' : 'max-w-[90%] items-end'}`}>
          {isEditing ? (
            <InlineMessageEditor
              initialContent={message.content || ''}
              agents={mentionAgents}
              onSearchFiles={onSearchFiles}
              onSubmit={handleSubmitEdit}
              onCancel={handleCancelEdit}
              cancelLabel={t('common.cancel')}
              submitLabel={t('conversation.buttons.send')}
            />
          ) : (
            <div className="w-fit max-w-full rounded-lg bg-primary-600 px-4 py-2 text-base text-white">
              <div className="whitespace-pre-wrap break-words overflow-x-auto">{message.content}</div>
            </div>
          )}

          {/* User uploaded assets */}
          {message.assets && message.assets.length > 0 && (
            <div className="mt-1">
              <AssetList assets={message.assets} compact />
            </div>
          )}

          {/* Timestamp + Copy + Delete buttons */}
          <div className="mt-1 flex items-center justify-end gap-2 text-xs text-neutral-400">
            <span>
              {new Date(message.timestamp).toLocaleTimeString('zh-CN', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
            {/* Edit button */}
            {onEditAndResend && !isEditing && (
              <button
                type="button"
                className="inline-flex items-center rounded p-1 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
                disabled={isProcessing}
                onClick={handleStartEdit}
                title={t('conversation.editAndResend')}
                aria-label={t('conversation.editAndResend')}
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
            {/* Order: Regenerate → Copy → Delete */}
            {onRegenerate && !isEditing && (
              <RegenerateButton
                userMessageId={message.id}
                messageContent={message.content || ''}
                conversationId={''}
                onRegenerate={onRegenerate}
                onCancel={onCancel}
                isRunning={isProcessing}
              />
            )}
            {!isEditing && <CopyButton content={message.content || ''} title={t('common.copy')} />}
            {onDeleteAgentLoop && !isEditing && (
              <button
                type="button"
                className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
                disabled={disableDeleteActions}
                onClick={() => onDeleteAgentLoop(message.id)}
                title={t('conversation.buttons.deleteTurn')}
                aria-label={t('conversation.buttons.deleteTurn')}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
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
      <div className="min-w-0 w-[90%] space-y-2">
        {/* Reasoning */}
        {hasReasoning && (
          <ReasoningSection reasoning={message.reasoning!} streaming={isStreamingReasoning} />
        )}

        {/* Content */}
        {hasContent && (
          <div className="inline-block max-w-full rounded-lg bg-white px-4 py-2 text-base text-neutral-800 shadow-sm ring-1 ring-neutral-200 dark:bg-neutral-800 dark:text-neutral-100 dark:ring-neutral-700">
            <div className="prose max-w-none break-words overflow-x-auto">
              <MarkdownContent content={message.content!} />
            </div>
            {/* Cursor when streaming */}
            {isStreamingContent && (
              <span className="ml-0.5 inline-block h-4 w-[2px] animate-pulse bg-neutral-400 align-text-bottom" />
            )}
          </div>
        )}

        {/* Agent generated assets */}
        {message.assets && message.assets.length > 0 && (
          <AssetList assets={message.assets} />
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
              title={t('conversation.usage.tokenUsage', { promptTokens: message.usage.promptTokens, completionTokens: message.usage.completionTokens, totalTokens: message.usage.totalTokens })}
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
})
