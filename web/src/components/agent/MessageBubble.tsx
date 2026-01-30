/**
 * MessageBubble - renders a single message in the conversation.
 */

import { User, Bot } from 'lucide-react'
import type { Message } from '@/agent/message-types'
import { ToolCallDisplay } from './ToolCallDisplay'
import { MarkdownContent } from './MarkdownContent'

interface MessageBubbleProps {
  message: Message
  toolResults?: Map<string, string>
}

export function MessageBubble({ message, toolResults }: MessageBubbleProps) {
  if (message.role === 'system') return null
  if (message.role === 'tool') return null // Tool results are shown inline with tool calls

  const isUser = message.role === 'user'

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      {/* Avatar */}
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
          isUser ? 'bg-primary-100 text-primary-700' : 'bg-neutral-100 text-neutral-700'
        }`}
      >
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>

      {/* Content */}
      <div className={`min-w-0 max-w-[80%] ${isUser ? 'text-right' : ''}`}>
        {/* Text content */}
        {message.content && (
          <div
            className={`inline-block rounded-lg px-4 py-2 text-sm ${
              isUser
                ? 'bg-primary-600 text-white'
                : 'bg-white text-neutral-800 shadow-sm ring-1 ring-neutral-200'
            }`}
          >
            {isUser ? (
              <div className="whitespace-pre-wrap break-words">{message.content}</div>
            ) : (
              <div className="prose-sm max-w-none break-words">
                <MarkdownContent content={message.content} />
              </div>
            )}
          </div>
        )}

        {/* Tool calls */}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="mt-2 space-y-1">
            {message.toolCalls.map((tc) => (
              <ToolCallDisplay key={tc.id} toolCall={tc} result={toolResults?.get(tc.id)} />
            ))}
          </div>
        )}

        {/* Timestamp */}
        <div className={`mt-1 text-xs text-neutral-400 ${isUser ? 'text-right' : ''}`}>
          {new Date(message.timestamp).toLocaleTimeString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </div>
      </div>
    </div>
  )
}
