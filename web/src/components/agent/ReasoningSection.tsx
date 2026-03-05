/**
 * ReasoningSection - collapsible "thinking process" block shared by
 * MessageBubble, AssistantTurnBubble, and StreamingBubble.
 */

import { useEffect, useState } from 'react'
import { Brain, ChevronDown, ChevronRight } from 'lucide-react'

interface ReasoningSectionProps {
  reasoning: string
  /** If true, show "思考中..." label instead of "思考过程" */
  streaming?: boolean
}

export function ReasoningSection({ reasoning, streaming }: ReasoningSectionProps) {
  const [open, setOpen] = useState(!!streaming)

  useEffect(() => {
    if (streaming) {
      setOpen(true)
    }
  }, [streaming])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`flex w-full items-center gap-2 bg-neutral-50 px-3 py-2 text-left text-xs text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 ${
          open
            ? 'rounded-t border border-b-0 border-neutral-200'
            : 'rounded border border-neutral-200'
        }`}
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        <Brain className="h-3.5 w-3.5" />
        <span>{streaming ? '思考中...' : '思考过程'}</span>
      </button>
      {open && (
        <div className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-b border border-t-0 border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-400">
          {reasoning}
        </div>
      )}
    </>
  )
}
