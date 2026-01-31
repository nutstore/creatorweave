/**
 * ConversationView - pure conversation display and interaction.
 *
 * Now uses conversation store for per-conversation runtime state.
 * Multiple conversations can run simultaneously.
 */

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { Send, StopCircle, MessageSquare, Bot } from 'lucide-react'
import { useAgentStore } from '@/store/agent.store'
import { useConversationStore } from '@/store/conversation.store'
import { useSettingsStore } from '@/store/settings.store'
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

  // Subscribe directly to conversations and activeConversationId to ensure updates trigger re-renders
  const conversations = useConversationStore((s) => s.conversations)
  const activeConversationId = useConversationStore((s) => s.activeConversationId)
  const activeConversation = activeConversationId
    ? conversations.find((c) => c.id === activeConversationId)
    : null
  const createNew = useConversationStore((s) => s.createNew)
  const updateMessages = useConversationStore((s) => s.updateMessages)
  const setActive = useConversationStore((s) => s.setActive)
  const runAgent = useConversationStore((s) => s.runAgent)
  const cancelAgent = useConversationStore((s) => s.cancelAgent)
  const isConversationRunning = useConversationStore((s) => s.isConversationRunning)
  const getSuggestedFollowUp = useConversationStore((s) => s.getSuggestedFollowUp)
  const clearSuggestedFollowUp = useConversationStore((s) => s.clearSuggestedFollowUp)

  const { providerType, modelName, maxTokens, hasApiKey } = useSettingsStore()

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [activeConversation])

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
      return buildToolResultsMap(activeConversation.messages)
    }
    return new Map<string, string>()
  }, [activeConversation, buildToolResultsMap])

  // Handle initial message from WelcomeScreen (one-shot).
  // The conversation is already created by WorkspaceLayout before this component mounts.
  const initialMessageHandled = useRef(false)
  const convId = activeConversationId
  const isRunning = convId ? isConversationRunning(convId) : false

  // Get follow-up suggestion for current conversation
  const suggestedFollowUp = convId ? getSuggestedFollowUp(convId) : ''

  useEffect(() => {
    if (initialMessage && !initialMessageHandled.current && !isRunning && convId) {
      initialMessageHandled.current = true
      sendMessage(initialMessage)
      onInitialMessageConsumed?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMessage])

  const sendMessage = async (text: string) => {
    if (!text) return

    if (!hasApiKey) {
      // TODO: Show error message
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
    const conv = conversations.find((c) => c.id === targetConvId)
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const status = activeConversation?.status || 'idle'
  const isProcessing = isRunning

  // Build streaming state for the last message when processing
  const streamingState = useMemo(() => {
    if (!activeConversation || !isProcessing) return undefined
    return {
      reasoning: activeConversation.isReasoningStreaming,
      content: activeConversation.isContentStreaming,
    }
  }, [activeConversation, isProcessing])

  // When processing, we have streaming content/reasoning that should be displayed
  const streamingContentMessage = useMemo(() => {
    if (!activeConversation || !isProcessing) return undefined
    const reasoning = activeConversation.completedReasoning || activeConversation.streamingReasoning
    const content = activeConversation.completedContent || activeConversation.streamingContent
    if (!reasoning && !content) return undefined
    return { reasoning, content }
  }, [activeConversation, isProcessing])

  const turns = useMemo(() => {
    const messages = activeConversation?.messages || []
    return groupMessagesIntoTurns(messages)
  }, [activeConversation?.messages])

  return (
    <div className="flex h-full flex-col bg-white">
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
                <MessageBubble key={turn.message.id} message={turn.message} />
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
                    isProcessing && idx === turns.length - 1 ? streamingContentMessage : undefined
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
                />
              )
            )}

            {/* Pending indicator - show when waiting for response and no assistant turn yet */}
            {isProcessing && status === 'pending' && (
              <div className="flex gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-700">
                  <Bot className="h-4 w-4" />
                </div>
                <div className="inline-block rounded-2xl bg-neutral-50 px-4 py-3 text-sm text-neutral-500 shadow-sm">
                  <span className="flex items-center gap-1">
                    <span
                      className="h-2 w-2 animate-bounce rounded-full bg-primary-400"
                      style={{ animationDelay: '0ms' }}
                    />
                    <span
                      className="h-2 w-2 animate-bounce rounded-full bg-primary-500"
                      style={{ animationDelay: '160ms' }}
                    />
                    <span
                      className="h-2 w-2 animate-bounce rounded-full bg-primary-600"
                      style={{ animationDelay: '320ms' }}
                    />
                  </span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>
      </div>

      {/* Input area */}
      <div className="border-t border-neutral-200 bg-white px-4 py-3">
        <div className="mx-auto flex max-w-3xl items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              suggestedFollowUp ||
              (hasApiKey ? '输入消息... (Shift+Enter 换行)' : '请先在设置中配置 API Key')
            }
            rows={1}
            className="max-h-32 min-h-[38px] flex-1 resize-none rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-2.5 text-sm focus:border-primary-300 focus:bg-white focus:outline-none focus:ring-1 focus:ring-primary-300"
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
    </div>
  )
}
