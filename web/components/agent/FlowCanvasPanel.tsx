/**
 * FlowCanvasPanel — workflow canvas overlay, opened from the TopBar entry.
 *
 * States:
 * - Closed: not rendered (entry point is the TopBar "Workflow" button).
 * - Empty panel: open but no nodes — user can load templates or add nodes.
 * - Active panel: canvas with nodes, properties panel, toolbar.
 *
 * The panel floats above the conversation so it never compresses the chat area.
 * Visibility is controlled via the FlowStore (`panelOpen`) so the TopBar entry
 * and the panel itself share one source of truth. It auto-opens when nodes
 * first appear (e.g. the AI just built a workflow).
 */

import { useEffect, useRef, useState } from 'react'
import { X, Sparkles, Maximize2, Minimize2 } from 'lucide-react'
import { cn } from '@creatorweave/ui'
import { FlowEditor } from '../flow-editor/FlowEditor'
import { useFlowStore } from '@/store/flow.store'

interface FlowCanvasPanelProps {
  conversationId: string | null
}

export function FlowCanvasPanel({ conversationId }: FlowCanvasPanelProps) {
  const activeInstance = useFlowStore((s) => s.activeInstance)
  const initInstance = useFlowStore((s) => s.initInstance)
  const loadInstanceForConversation = useFlowStore((s) => s.loadInstanceForConversation)
  const clearInstance = useFlowStore((s) => s.clearInstance)
  const panelOpen = useFlowStore((s) => s.panelOpen)
  const setPanelOpen = useFlowStore((s) => s.setPanelOpen)
  const [isFullscreen, setIsFullscreen] = useState(false)

  // Close the panel when switching to a different conversation
  const prevConversationId = useRef<string | null>(conversationId)
  useEffect(() => {
    if (prevConversationId.current !== conversationId) {
      setPanelOpen(false)
      clearInstance()
      prevConversationId.current = conversationId
    }
  }, [conversationId, setPanelOpen, clearInstance])

  // Initialize an empty instance if none exists when opening from the TopBar
  useEffect(() => {
    if (!panelOpen || !conversationId) return
    let cancelled = false
    void loadInstanceForConversation(conversationId).then((instance) => {
      if (cancelled) return
      if (!instance) initInstance(conversationId)
    })
    return () => { cancelled = true }
  }, [panelOpen, conversationId, initInstance, loadInstanceForConversation])

  const nodeCount = activeInstance?.nodes.length ?? 0

  // ── Closed: nothing rendered (entry is the TopBar Workflow button) ──
  if (!panelOpen) {
    return null
  }

  // ── Expanded: floating overlay panel ──
  return (
    <div
      className={cn(
        'fixed z-50 flex flex-col rounded-2xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-700 dark:bg-neutral-900',
        isFullscreen
          ? 'inset-4'
          : 'bottom-20 right-6 top-20 w-[680px]'
      )}
    >
      {/* Drag handle / title bar */}
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-neutral-200 bg-neutral-50 px-3 dark:border-neutral-700 dark:bg-neutral-800">
        <div className="flex h-4 w-4 items-center justify-center rounded bg-primary-100 dark:bg-primary-950/40">
          <Sparkles className="h-2.5 w-2.5 text-primary-500" />
        </div>
        <span className="text-[11px] font-semibold text-neutral-700 dark:text-neutral-200">
          工作流白板
        </span>
        {nodeCount > 0 && (
          <span className="text-[10px] text-neutral-400">
            {nodeCount} 节点 · {activeInstance?.edges.length ?? 0} 连线
          </span>
        )}

        <div className="flex-1" />

        {/* Fullscreen toggle */}
        <button
          onClick={() => setIsFullscreen(!isFullscreen)}
          className="text-neutral-400 transition-colors hover:text-neutral-700 dark:hover:text-neutral-200"
          title={isFullscreen ? '退出全屏' : '全屏'}
        >
          {isFullscreen ? (
            <Minimize2 className="h-3.5 w-3.5" />
          ) : (
            <Maximize2 className="h-3.5 w-3.5" />
          )}
        </button>

        {/* Close (hide panel; TopBar button reopens it) */}
        <button
          onClick={() => setPanelOpen(false)}
          className="text-neutral-400 transition-colors hover:text-danger-500"
          title="收起"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Flow editor */}
      <div className="min-h-0 w-full flex-1">
        <FlowEditor isFullscreen={isFullscreen} />
      </div>
    </div>
  )
}
