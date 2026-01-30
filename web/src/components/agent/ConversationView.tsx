/**
 * ConversationView - pure conversation display and interaction.
 *
 * Extracted from AgentPanel: contains only the message list, streaming indicator,
 * input area, and agent loop logic. No internal sidebar or top bar.
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, StopCircle, MessageSquare } from 'lucide-react'
import { useAgentStore } from '@/store/agent.store'
import { useConversationStore } from '@/store/conversation.store'
import { useSettingsStore } from '@/store/settings.store'
import { MessageBubble } from './MessageBubble'
import { StreamingBubble } from './StreamingBubble'
import { ThinkingIndicator } from './ThinkingIndicator'
import { createUserMessage } from '@/agent/message-types'
import type { Message, ToolCall } from '@/agent/message-types'
import { AgentLoop } from '@/agent/agent-loop'
import { GLMProvider } from '@/agent/llm/glm-provider'
import { ContextManager } from '@/agent/context-manager'
import { getToolRegistry } from '@/agent/tool-registry'
import { loadApiKey } from '@/security/api-key-store'
import { LLM_PROVIDER_CONFIGS } from '@/agent/providers/types'

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
  const [toolResults, setToolResults] = useState<Map<string, string>>(new Map())
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const agentLoopRef = useRef<AgentLoop | null>(null)

  const {
    status,
    streamingContent,
    currentToolCall,
    directoryHandle,
    setStatus,
    appendStreamingContent,
    resetStreamingContent,
    setCurrentToolCall,
    setError,
    reset: resetAgent,
  } = useAgentStore()

  const { activeConversation, createNew, updateMessages } = useConversationStore()

  const { providerType, modelName, maxTokens, hasApiKey } = useSettingsStore()

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [streamingContent, status])

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

  const conversation = activeConversation()

  // Update tool results when conversation changes
  useEffect(() => {
    if (conversation) {
      setToolResults(buildToolResultsMap(conversation.messages))
    }
  }, [conversation, buildToolResultsMap])

  // Handle initial message from WelcomeScreen (one-shot).
  // The conversation is already created by WorkspaceLayout before this component mounts.
  const initialMessageHandled = useRef(false)
  useEffect(() => {
    if (initialMessage && !initialMessageHandled.current && status === 'idle') {
      initialMessageHandled.current = true
      sendMessage(initialMessage)
      onInitialMessageConsumed?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMessage])

  const sendMessage = async (text: string) => {
    if (!text.trim() || status !== 'idle') return

    if (!hasApiKey) {
      setError('API Key 未设置，请先在设置中配置')
      return
    }

    // Use the current active conversation — it must already exist.
    // (WorkspaceLayout creates it before mounting ConversationView,
    //  or user clicks on an existing one from the sidebar.)
    const convId = useConversationStore.getState().activeConversationId
    if (!convId) {
      // Fallback: create one if somehow missing
      const conv = createNew(text.slice(0, 30))
      useConversationStore.getState().setActive(conv.id)
    }
    const resolvedConvId = useConversationStore.getState().activeConversationId!

    // Add user message
    const userMsg = createUserMessage(text)
    const conv = useConversationStore.getState().conversations.find((c) => c.id === resolvedConvId)
    const currentMessages = conv ? [...conv.messages, userMsg] : [userMsg]
    updateMessages(resolvedConvId, currentMessages)
    setInput('')
    resetStreamingContent()

    // Setup agent
    try {
      const apiKey = await loadApiKey(providerType)
      if (!apiKey) {
        setError('API Key 未设置，请先在设置中配置')
        return
      }

      const config = LLM_PROVIDER_CONFIGS[providerType]
      const provider = new GLMProvider({
        apiKey,
        baseUrl: config.baseURL,
        model: modelName,
      })

      const contextManager = new ContextManager({
        maxContextTokens: provider.maxContextTokens,
        reserveTokens: maxTokens,
      })

      const toolRegistry = getToolRegistry()

      const agentLoop = new AgentLoop({
        provider,
        toolRegistry,
        contextManager,
        toolContext: {
          directoryHandle: directoryHandle,
        },
        maxIterations: 20,
      })
      agentLoopRef.current = agentLoop

      setStatus('thinking')

      await agentLoop.run(currentMessages, {
        onMessageStart: () => {
          resetStreamingContent()
          setStatus('streaming')
        },
        onContentDelta: (delta) => {
          appendStreamingContent(delta)
        },
        onContentComplete: () => {
          resetStreamingContent()
        },
        onToolCallStart: (tc: ToolCall) => {
          setStatus('tool_calling')
          setCurrentToolCall(tc)
        },
        onToolCallComplete: (tc: ToolCall, result: string) => {
          setToolResults((prev) => {
            const next = new Map(prev)
            next.set(tc.id, result)
            return next
          })
          setCurrentToolCall(null)
        },
        onComplete: (msgs) => {
          updateMessages(resolvedConvId, msgs)
          setToolResults(buildToolResultsMap(msgs))
          resetAgent()
        },
        onError: (err) => {
          setError(err.message)
        },
      })
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        resetAgent()
        return
      }
      setError(error instanceof Error ? error.message : String(error))
    }
  }

  const handleSend = () => {
    sendMessage(input)
  }

  const handleCancel = () => {
    agentLoopRef.current?.cancel()
    resetAgent()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const isProcessing = status !== 'idle' && status !== 'error'
  const messages = conversation?.messages || []

  return (
    <div className="flex h-full flex-col bg-white">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 && !isProcessing && (
          <div className="flex h-full items-center justify-center">
            <div className="text-center text-neutral-400">
              <MessageSquare className="mx-auto mb-2 h-8 w-8" />
              <p className="text-sm">输入消息开始对话</p>
            </div>
          </div>
        )}

        <div className="mx-auto max-w-3xl space-y-4">
          {messages
            .filter((m) => m.role !== 'system' && m.role !== 'tool')
            .map((msg) => (
              <MessageBubble key={msg.id} message={msg} toolResults={toolResults} />
            ))}

          {/* Streaming assistant bubble — shows live markdown as tokens arrive */}
          {status === 'streaming' && streamingContent && (
            <StreamingBubble content={streamingContent} />
          )}

          {/* Thinking / tool calling indicator */}
          {(status === 'thinking' || status === 'tool_calling') && (
            <ThinkingIndicator status={status} toolName={currentToolCall?.function.name} />
          )}

          <div ref={messagesEndRef} />
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
            placeholder={hasApiKey ? '输入消息... (Shift+Enter 换行)' : '请先在设置中配置 API Key'}
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
              disabled={!input.trim() || !hasApiKey}
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
