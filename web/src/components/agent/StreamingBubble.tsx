/**
 * StreamingBubble - renders streaming assistant content as a live message bubble
 * with markdown rendering and a blinking cursor.
 * Optionally displays collapsed reasoning/thinking content above the response.
 */

import { useState } from 'react'
import { Bot, ChevronDown, ChevronRight, Brain } from 'lucide-react'
import { MarkdownContent } from './MarkdownContent'

interface StreamingBubbleProps {
  content: string
  /** Optional reasoning/thinking content from GLM-4.7+ models */
  reasoning?: string
}

export function StreamingBubble({ content, reasoning }: StreamingBubbleProps) {
  const [reasoningOpen, setReasoningOpen] = useState(false)

  return (
    <div className="flex gap-3">
      {/* Avatar */}
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-700">
        <Bot className="h-4 w-4" />
      </div>

      {/* Content */}
      <div className="min-w-0 max-w-[80%]">
        <div className="inline-block rounded-lg bg-white px-4 py-2 text-sm text-neutral-800 shadow-sm ring-1 ring-neutral-200">
          {/* Collapsible reasoning section */}
          {reasoning && (
            <div className="mb-2 border-b border-neutral-100 pb-2">
              <button
                type="button"
                onClick={() => setReasoningOpen(!reasoningOpen)}
                className="flex items-center gap-1 text-xs text-neutral-400 hover:text-neutral-600"
              >
                <Brain className="h-3 w-3" />
                <span>思考过程</span>
                {reasoningOpen ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
              </button>
              {reasoningOpen && (
                <div className="mt-1 max-h-48 overflow-y-auto whitespace-pre-wrap text-xs text-neutral-400">
                  {reasoning}
                </div>
              )}
            </div>
          )}
          <div className="prose-sm max-w-none break-words">
            <MarkdownContent content={content} />
            <span className="ml-0.5 inline-block h-4 w-[2px] animate-pulse bg-neutral-400 align-text-bottom" />
          </div>
        </div>
      </div>
    </div>
  )
}
