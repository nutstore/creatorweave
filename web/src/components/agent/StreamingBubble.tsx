/**
 * StreamingBubble - renders streaming assistant content as a live message bubble
 * with markdown rendering and a blinking cursor.
 */

import { Bot } from 'lucide-react'
import { MarkdownContent } from './MarkdownContent'

interface StreamingBubbleProps {
  content: string
}

export function StreamingBubble({ content }: StreamingBubbleProps) {
  return (
    <div className="flex gap-3">
      {/* Avatar */}
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-700">
        <Bot className="h-4 w-4" />
      </div>

      {/* Content */}
      <div className="min-w-0 max-w-[80%]">
        <div className="inline-block rounded-lg bg-white px-4 py-2 text-sm text-neutral-800 shadow-sm ring-1 ring-neutral-200">
          <div className="prose-sm max-w-none break-words">
            <MarkdownContent content={content} />
            <span className="ml-0.5 inline-block h-4 w-[2px] animate-pulse bg-neutral-400 align-text-bottom" />
          </div>
        </div>
      </div>
    </div>
  )
}
