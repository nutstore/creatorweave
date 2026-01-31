/**
 * AgentPanel - main conversation interface for the AI agent.
 *
 * Now uses conversation store for per-conversation runtime state.
 * Multiple conversations can run simultaneously.
 */

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import {
  Send,
  FolderOpen,
  Settings,
  Plus,
  Trash2,
  StopCircle,
  MessageSquare,
  Bot,
} from 'lucide-react'
import { useAgentStore } from '@/store/agent.store'
import { useConversationStore } from '@/store/conversation.store'
import { useSettingsStore } from '@/store/settings.store'
import { MessageBubble } from './MessageBubble'
import { AssistantTurnBubble } from './AssistantTurnBubble'
import { groupMessagesIntoTurns } from './group-messages'
import { SettingsDialog } from '@/components/settings/SettingsDialog'
import { createUserMessage } from '@/agent/message-types'
import type { Message } from '@/agent/message-types'
import { selectFolderReadWrite } from '@/services/fsAccess.service'

export function AgentPanel() {
  const [input, setInput] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const { directoryHandle, directoryName, setDirectoryHandle } = useAgentStore()

  const {
    conversations,
    activeConversationId,
    activeConversation,
    loaded,
    loadFromDB,
    createNew,
    setActive,
    updateMessages,
    deleteConversation,
    runAgent,
    cancelAgent,
    isConversationRunning,
  } = useConversationStore()

  const { providerType, modelName, maxTokens, hasApiKey } = useSettingsStore()

  // Load conversations on mount
  useEffect(() => {
    if (!loaded) loadFromDB()
  }, [loaded, loadFromDB])

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [activeConversation])

  const conversation = activeConversation()
  const convId = activeConversationId

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
    if (conversation) {
      return buildToolResultsMap(conversation.messages)
    }
    return new Map<string, string>()
  }, [conversation, buildToolResultsMap])

  const handleSelectFolder = async () => {
    try {
      const handle = await selectFolderReadWrite()
      setDirectoryHandle(handle)
    } catch (error) {
      if (error instanceof Error && error.message === 'User cancelled') return
      // Error handling can be added here if needed
    }
  }

  const handleSend = async () => {
    const text = input.trim()
    if (!text) return

    if (!convId) {
      const conv = createNew(text.slice(0, 30))
      setActive(conv.id)
      // Wait for state to update
      await new Promise((resolve) => setTimeout(resolve, 0))
      const newConvId = conv.id
      await handleSendToConversation(newConvId, text)
    } else {
      // Check if already running
      if (isConversationRunning(convId)) {
        return
      }
      await handleSendToConversation(convId, text)
    }
  }

  const handleSendToConversation = async (conversationId: string, text: string) => {
    if (!hasApiKey) {
      setSettingsOpen(true)
      return
    }

    // Add user message
    const userMsg = createUserMessage(text)
    const conv = conversations.find((c) => c.id === conversationId)
    const currentMessages = conv ? [...conv.messages, userMsg] : [userMsg]
    updateMessages(conversationId, currentMessages)
    setInput('')

    // Run agent
    await runAgent(conversationId, providerType, modelName, maxTokens, directoryHandle)
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

  // Get current conversation status
  const isProcessing = conversation ? isConversationRunning(conversation.id) : false
  const status = conversation?.status || 'idle'

  // Build streaming state for the last message when processing
  const streamingState = useMemo(() => {
    if (!conversation || !isProcessing) return undefined
    return {
      reasoning: conversation.isReasoningStreaming,
      content: conversation.isContentStreaming,
    }
  }, [conversation, isProcessing])

  // When processing, we have streaming content/reasoning that should be displayed
  const streamingContentMessage = useMemo(() => {
    if (!conversation || !isProcessing) return undefined
    const reasoning = conversation.completedReasoning || conversation.streamingReasoning
    const content = conversation.completedContent || conversation.streamingContent
    if (!reasoning && !content) return undefined
    return { reasoning, content }
  }, [conversation, isProcessing])

  const turns = useMemo(() => {
    const messages = conversation?.messages || []
    return groupMessagesIntoTurns(messages)
  }, [conversation?.messages])

  return (
    <div className="flex h-full flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-neutral-200 bg-white px-4 py-2">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-neutral-500" />
          <span className="text-sm font-medium text-neutral-700">
            {conversation?.title || 'AI 助手'}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {directoryHandle ? (
            <button
              type="button"
              onClick={handleSelectFolder}
              className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-green-700 hover:bg-green-50"
              title="切换项目文件夹"
            >
              <FolderOpen className="h-3.5 w-3.5" />
              {directoryName}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSelectFolder}
              className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-100"
            >
              <FolderOpen className="h-3.5 w-3.5" />
              选择文件夹
            </button>
          )}
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="rounded-md p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
            title="设置"
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Conversation list sidebar */}
        <div className="custom-scrollbar w-48 shrink-0 overflow-y-auto border-r border-neutral-200 bg-neutral-50">
          <div className="p-2">
            <button
              type="button"
              onClick={() => createNew()}
              className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-200"
            >
              <Plus className="h-3.5 w-3.5" />
              新对话
            </button>
          </div>
          <div className="space-y-0.5 px-2">
            {conversations.map((conv) => {
              const isRunning = isConversationRunning(conv.id)
              return (
                <div
                  key={conv.id}
                  className={`group flex cursor-pointer items-center rounded-md px-2 py-1.5 text-xs ${
                    conv.id === activeConversationId
                      ? 'bg-primary-100 text-primary-700'
                      : 'text-neutral-600 hover:bg-neutral-200'
                  }`}
                  onClick={() => setActive(conv.id)}
                >
                  {/* Status indicator */}
                  {isRunning && (
                    <span className="mr-1.5 h-2 w-2 animate-pulse rounded-full bg-yellow-500" />
                  )}
                  <span className="min-w-0 flex-1 truncate">{conv.title}</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      deleteConversation(conv.id)
                    }}
                    className="ml-1 hidden shrink-0 rounded p-0.5 text-neutral-400 hover:text-red-500 group-hover:block"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              )
            })}
          </div>
        </div>

        {/* Messages area */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="custom-scrollbar flex-1 overflow-y-auto">
            <div className="space-y-4 p-4">
              {turns.length === 0 && (
                <div className="flex h-full items-center justify-center">
                  <div className="text-center text-neutral-400">
                    <MessageSquare className="mx-auto mb-2 h-8 w-8" />
                    <p className="text-sm">
                      {directoryHandle ? '输入消息开始对话' : '请先选择项目文件夹，然后开始对话'}
                    </p>
                  </div>
                </div>
              )}

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
                        ? conversation?.currentToolCall
                        : undefined
                    }
                    streamingToolArgs={
                      // Pass streaming tool args to the last assistant turn when in tool_calling phase
                      isProcessing && idx === turns.length - 1 && status === 'tool_calling'
                        ? conversation?.streamingToolArgs
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

          {/* Input area */}
          <div className="border-t border-neutral-200 bg-white p-3">
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  hasApiKey ? '输入消息... (Shift+Enter 换行)' : '请先在设置中配置 API Key'
                }
                rows={1}
                className="max-h-32 min-h-[38px] flex-1 resize-none rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                disabled={isProcessing}
              />
              {isProcessing ? (
                <button
                  type="button"
                  onClick={handleCancel}
                  className="flex h-[38px] w-[38px] items-center justify-center rounded-lg bg-red-500 text-white hover:bg-red-600"
                  title="停止"
                >
                  <StopCircle className="h-4 w-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={!input.trim()}
                  className="flex h-[38px] w-[38px] items-center justify-center rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
                  title="发送"
                >
                  <Send className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Settings dialog */}
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  )
}
