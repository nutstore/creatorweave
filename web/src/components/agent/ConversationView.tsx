/**
 * ConversationView - pure conversation display and interaction.
 *
 * Now uses conversation store for per-conversation runtime state.
 * Multiple conversations can run simultaneously.
 */

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { Send, StopCircle, MessageSquare } from 'lucide-react'
import { toast } from 'sonner'
import { useAgentStore } from '@/store/agent.store'
import { useConversationStore } from '@/store/conversation.store'
import { useSettingsStore } from '@/store/settings.store'
import { ErrorBoundary } from '@/components/error/ErrorBoundary'
import { MessageBubble } from './MessageBubble'
import { AssistantTurnBubble } from './AssistantTurnBubble'
import { groupMessagesIntoTurns } from './group-messages'
import { createUserMessage } from '@/agent/message-types'
import type { Message } from '@/agent/message-types'

interface ConversationViewProps {
  /** Optional initial message to send immediately (from WelcomeScreen) */
  initialMessage?: string | null
  onInitialMessageConsumed?: () => void
}

export function ConversationView({
  initialMessage,
  onInitialMessageConsumed,
}: ConversationViewProps) {
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const { directoryHandle } = useAgentStore()

  const activeConversationId = useConversationStore((s) => s.activeConversationId)
  const activeConversation = useConversationStore((s) => {
    if (!s.activeConversationId) return null
    return s.conversations.find((c) => c.id === s.activeConversationId) || null
  })
  const createNew = useConversationStore((s) => s.createNew)
  const updateMessages = useConversationStore((s) => s.updateMessages)
  const deleteAgentLoop = useConversationStore((s) => s.deleteAgentLoop)
  const setActive = useConversationStore((s) => s.setActive)
  const runAgent = useConversationStore((s) => s.runAgent)
  const cancelAgent = useConversationStore((s) => s.cancelAgent)
  const isConversationRunning = useConversationStore((s) => s.isConversationRunning)
  const getSuggestedFollowUp = useConversationStore((s) => s.getSuggestedFollowUp)
  const clearSuggestedFollowUp = useConversationStore((s) => s.clearSuggestedFollowUp)
  const mountConversation = useConversationStore((s) => s.mountConversation)
  const unmountConversation = useConversationStore((s) => s.unmountConversation)

  const { providerType, modelName, maxTokens, hasApiKey } = useSettingsStore()

  // Must be declared before useEffect that uses it
  const initialMessageHandled = useRef(false)
  const initialMessageKeyRef = useRef<string | null>(null)
  const lastRenderedMessageCountRef = useRef(0)
  const convId = activeConversationId
  const isRunning = convId ? isConversationRunning(convId) : false

  // Mount/unmount tracking - StrictMode-safe via ref counting in store
  useEffect(() => {
    if (convId) {
      mountConversation(convId)
    }
    return () => {
      if (convId) {
        unmountConversation(convId)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convId])

  useEffect(() => {
    initialMessageHandled.current = false
    initialMessageKeyRef.current = null
  }, [convId])

  // Auto-scroll to bottom on committed message append / finalization edges.
  useEffect(() => {
    const messageCount = activeConversation?.messages.length || 0
    const behavior: ScrollBehavior =
      messageCount > lastRenderedMessageCountRef.current ? 'smooth' : 'auto'
    lastRenderedMessageCountRef.current = messageCount
    messagesEndRef.current?.scrollIntoView({ behavior })
  }, [activeConversation?.messages.length, activeConversation?.status])

  // Build tool results map from conversation messages
  const buildToolResultsMap = useCallback((messages: Message[]) => {
    const map = new Map<string, string>()
    for (const msg of messages) {
      if (msg.role === 'tool' && msg.toolCallId) {
        map.set(msg.toolCallId, msg.content || '')
      }
    }
    return map
  }, [])

  // Update tool results when conversation changes
  const toolResults = useMemo(() => {
    if (activeConversation) {
      const merged = buildToolResultsMap(activeConversation.messages)
      const runtimeResults = activeConversation.draftAssistant?.toolResults || {}
      for (const [toolCallId, result] of Object.entries(runtimeResults)) {
        if (!merged.has(toolCallId)) {
          merged.set(toolCallId, result)
        }
      }
      return merged
    }
    return new Map<string, string>()
  }, [activeConversation, buildToolResultsMap])

  // Get follow-up suggestion for current conversation
  const suggestedFollowUp = convId ? getSuggestedFollowUp(convId) : ''

  useEffect(() => {
    if (!initialMessage || !convId || isRunning) return
    const key = `${convId}:${initialMessage}`
    if (initialMessageKeyRef.current === key || initialMessageHandled.current) return
    initialMessageKeyRef.current = key
    if (!initialMessageHandled.current) {
      initialMessageHandled.current = true
      sendMessage(initialMessage)
      onInitialMessageConsumed?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMessage, convId, isRunning])

  const sendMessage = async (text: string) => {
    if (!text) return

    if (!hasApiKey) {
      toast.error('请先在设置中配置 API Key')
      return
    }

    // Use the current active conversation — it must already exist.
    let targetConvId = convId
    if (!targetConvId) {
      // Fallback: create one if somehow missing
      const conv = createNew(text.slice(0, 30))
      targetConvId = conv.id
      setActive(targetConvId)
    }

    // Check if already running
    if (isConversationRunning(targetConvId)) {
      return
    }

    // Add user message
    const userMsg = createUserMessage(text)
    const conv = useConversationStore.getState().conversations.find((c) => c.id === targetConvId)
    const currentMessages = conv ? [...conv.messages, userMsg] : [userMsg]
    updateMessages(targetConvId, currentMessages)
    setInput('')

    // Run agent
    await runAgent(targetConvId, providerType, modelName, maxTokens, directoryHandle)
  }

  const handleSend = () => {
    // Use follow-up suggestion if input is empty
    const textToSend = input || suggestedFollowUp
    if (textToSend) {
      sendMessage(textToSend)
      // Clear the follow-up suggestion after sending
      if (!input && convId) {
        clearSuggestedFollowUp(convId)
      }
    }
  }

  const handleCancel = () => {
    if (convId) {
      cancelAgent(convId)
    }
  }

  const handleDeleteAgentLoop = (messageId: string) => {
    if (!convId) return
    const ok = deleteAgentLoop(convId, messageId)
    if (ok) {
      toast.success('已删除完整对话轮次')
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      // 检测是否处于输入法状态，如果是则不发送消息
      if (e.nativeEvent.isComposing) {
        return
      }
      e.preventDefault()
      handleSend()
    }
  }

  // 自动调整 textarea 高度
  const adjustTextareaHeight = useCallback(() => {
    const textarea = inputRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      const newHeight = Math.min(textarea.scrollHeight, 4 * 24) // 4 行，每行约 24px
      textarea.style.height = `${newHeight}px`
    }
  }, [])

  // 输入时自动调整高度
  useEffect(() => {
    adjustTextareaHeight()
  }, [input, adjustTextareaHeight])

  const status = activeConversation?.status || 'idle'
  const isProcessing = isRunning
  const conversationError =
    activeConversation?.status === 'error' ? activeConversation.error?.trim() || null : null

  // Build streaming state for the last message when processing (direct calculation for streaming performance)
  const streamingState =
    !activeConversation || !isProcessing
      ? undefined
      : {
          reasoning: activeConversation.isReasoningStreaming,
          content: activeConversation.isContentStreaming,
        }

  // When processing, we have streaming content/reasoning that should be displayed (direct calculation for streaming performance)
  const streamingContentMessage =
    !activeConversation || !isProcessing
      ? undefined
      : (() => {
          const draft = activeConversation.draftAssistant
          const reasoning = draft?.reasoning || activeConversation.streamingReasoning
          const content = draft?.content || activeConversation.streamingContent
          if (!reasoning && !content) return undefined
          const lastAssistant = [...activeConversation.messages]
            .reverse()
            .find((m) => m.role === 'assistant')
          if (
            lastAssistant &&
            (lastAssistant.reasoning || '') === (reasoning || '') &&
            (lastAssistant.content || '') === (content || '')
          ) {
            return undefined
          }
          return { reasoning, content }
        })()

  const turns = useMemo(() => {
    const messages = activeConversation?.messages || []
    return groupMessagesIntoTurns(messages)
  }, [activeConversation?.messages])
  const lastTurn = turns[turns.length - 1]
  // Render draft assistant loading when:
  // 1. Processing AND (no last turn OR last turn is not assistant)
  // 2. OR processing AND last turn is assistant but we're in pending/tool_calling state (meaning new loop iteration)
  const shouldRenderDraftAssistant = isProcessing && (
    !lastTurn ||
    lastTurn.type !== 'assistant' ||
    status === 'pending' ||
    status === 'tool_calling'
  )
  const isWaitingForModel =
    status === 'pending' ||
    (status === 'tool_calling' &&
      !activeConversation?.currentToolCall &&
      (activeConversation?.activeToolCalls?.length || 0) === 0)

  // Context window usage
  const contextWindowUsage =
    activeConversation?.contextWindowUsage || activeConversation?.lastContextWindowUsage || null

  const getUsageToneClass = (usagePercent: number): { text: string; label: string } => {
    if (usagePercent >= 90) {
      return { text: 'text-red-600 dark:text-red-400', label: '高风险' }
    }
    if (usagePercent >= 75) {
      return { text: 'text-amber-600 dark:text-amber-400', label: '接近上限' }
    }
    return { text: 'text-emerald-600 dark:text-emerald-400', label: '宽裕' }
  }

  const usageTone = contextWindowUsage ? getUsageToneClass(contextWindowUsage.usagePercent) : null

  const formatTokenCompact = (value: number): string => {
    if (value >= 1000) {
      return `${(value / 1000).toFixed(1)}k`
    }
    return `${value}`
  }

  const renderContextUsage = () => {
    if (!contextWindowUsage || !usageTone) return null

    return (
      <div className="mt-2 flex items-center justify-end gap-2 text-xs text-neutral-500 dark:text-neutral-400">
        <span className={`font-medium ${usageTone.text}`}>
          {contextWindowUsage.usagePercent.toFixed(0)}%
        </span>
        <span className="opacity-40">·</span>
        <span className="tabular-nums">{formatTokenCompact(contextWindowUsage.usedTokens)}</span>
        <span className="opacity-40">/</span>
        <span className="tabular-nums opacity-60">{formatTokenCompact(contextWindowUsage.maxTokens)}</span>
        {isProcessing && (
          <span className="ml-1 h-1.5 w-1.5 animate-pulse rounded-full bg-neutral-400 dark:bg-neutral-500" />
        )}
      </div>
    )
  }

  return (
    <ErrorBoundary
      onError={(error) => {
        console.error('[ConversationView] Error:', error)
        // Reset conversation state on error
        if (convId) {
          const { resetConversationState } = useConversationStore.getState()
          resetConversationState(convId)
        }
      }}
    >
      <div className="flex h-full flex-col bg-white dark:bg-neutral-950">
        {/* Messages area */}
        <div className="custom-scrollbar flex-1 overflow-y-auto">
          <div className="px-4 py-4">
            {activeConversation?.messages.length === 0 && !isProcessing && (
              <div className="flex h-full items-center justify-center">
                <div className="text-center text-neutral-400">
                  <MessageSquare className="mx-auto mb-2 h-8 w-8" />
                  <p className="text-sm">输入消息开始对话</p>
                </div>
              </div>
            )}

            <div className="mx-auto max-w-3xl space-y-4">
              {turns.map((turn, idx) =>
                turn.type === 'user' ? (
                  <MessageBubble
                    key={turn.message.id}
                    message={turn.message}
                    onDeleteAgentLoop={handleDeleteAgentLoop}
                    disableDeleteActions={isProcessing}
                  />
                ) : (
                  <AssistantTurnBubble
                    key={turn.messages[0].id}
                    turn={turn}
                    toolResults={toolResults}
                    isProcessing={isProcessing}
                    isWaiting={false}
                    streamingState={
                      // Only pass streaming state to the last assistant turn when processing
                      isProcessing && idx === turns.length - 1 ? streamingState : undefined
                    }
                    streamingContent={
                      // Pass streaming content to the last assistant turn when processing
                      isProcessing && idx === turns.length - 1
                        ? streamingContentMessage
                        : undefined
                    }
                    currentToolCall={
                      // Pass current tool call to the last assistant turn when in tool_calling phase
                      isProcessing && idx === turns.length - 1 && status === 'tool_calling'
                        ? activeConversation?.currentToolCall
                        : undefined
                    }
                    streamingToolArgs={
                      // Pass streaming tool args to the last assistant turn when in tool_calling phase
                      isProcessing && idx === turns.length - 1 && status === 'tool_calling'
                        ? activeConversation?.streamingToolArgs
                        : undefined
                    }
                    streamingToolArgsByCallId={
                      isProcessing && idx === turns.length - 1
                        ? activeConversation?.streamingToolArgsByCallId
                        : undefined
                    }
                    runtimeToolCalls={
                      isProcessing && idx === turns.length - 1
                        ? activeConversation?.draftAssistant?.toolCalls
                        : undefined
                    }
                    runtimeSteps={
                      isProcessing && idx === turns.length - 1
                        ? activeConversation?.draftAssistant?.steps
                        : undefined
                    }
                  />
                )
              )}

              {/* Draft assistant turn while waiting for current run's first committed assistant message */}
              {shouldRenderDraftAssistant && (
                <AssistantTurnBubble
                  key="draft-assistant"
                  turn={{
                    type: 'assistant',
                    messages: [],
                    timestamp: Date.now(),
                    totalUsage: null,
                  }}
                  toolResults={toolResults}
                  isProcessing={true}
                  isWaiting={isWaitingForModel}
                  streamingState={streamingState}
                  streamingContent={streamingContentMessage}
                  currentToolCall={status === 'tool_calling' ? activeConversation?.currentToolCall : undefined}
                  streamingToolArgs={status === 'tool_calling' ? activeConversation?.streamingToolArgs : undefined}
                  streamingToolArgsByCallId={activeConversation?.streamingToolArgsByCallId}
                  runtimeToolCalls={activeConversation?.draftAssistant?.toolCalls}
                  runtimeSteps={activeConversation?.draftAssistant?.steps}
                />
              )}

              <div ref={messagesEndRef} />
            </div>
          </div>
        </div>

        {conversationError && (
          <div className="border-t border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
            <div className="mx-auto max-w-3xl">
              <span className="font-medium">请求失败：</span>
              <span>{conversationError}</span>
            </div>
          </div>
        )}

        {/* Input area */}
        <div className="border-t border-neutral-200 bg-white px-4 py-3 dark:border-neutral-700 dark:bg-neutral-900">
          <div className="mx-auto flex max-w-3xl flex-col">
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  suggestedFollowUp ||
                  (hasApiKey ? '输入消息... (Shift+Enter 换行)' : '请先在设置中配置 API Key')
                }
                aria-label="输入消息"
                style={{ height: '38px', maxHeight: '96px' }}
                className="scrollbar-hide focus:border-primary-300 focus:ring-primary-300 flex-1 resize-none overflow-y-auto rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-2.5 text-sm focus:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-1 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:placeholder:text-neutral-500 dark:focus:bg-neutral-900"
                disabled={isProcessing || !hasApiKey}
              />
              {isProcessing ? (
                <button
                  type="button"
                  onClick={handleCancel}
                  className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-xl bg-red-500 text-white hover:bg-red-600"
                  title="停止"
                >
                  <StopCircle className="h-4 w-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={(!input.trim() && !suggestedFollowUp) || !hasApiKey}
                  className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-xl bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-30"
                  title="发送"
                >
                  <Send className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
          {renderContextUsage()}
        </div>
      </div>
    </ErrorBoundary>
  )
}
