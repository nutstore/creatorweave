/**
 * AgentPanel - main conversation interface for the AI agent.
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, FolderOpen, Settings, Plus, Trash2, StopCircle, MessageSquare } from 'lucide-react'
import { useAgentStore } from '@/store/agent.store'
import { useConversationStore } from '@/store/conversation.store'
import { useSettingsStore } from '@/store/settings.store'
import { MessageBubble } from './MessageBubble'
import { StreamingBubble } from './StreamingBubble'
import { ThinkingIndicator } from './ThinkingIndicator'
import { SettingsDialog } from '@/components/settings/SettingsDialog'
import { createUserMessage } from '@/agent/message-types'
import type { Message, ToolCall } from '@/agent/message-types'
import { AgentLoop } from '@/agent/agent-loop'
import { GLMProvider } from '@/agent/llm/glm-provider'
import { ContextManager } from '@/agent/context-manager'
import { getToolRegistry } from '@/agent/tool-registry'
import { loadApiKey } from '@/security/api-key-store'
import { selectFolderReadWrite } from '@/services/fsAccess.service'
import { LLM_PROVIDER_CONFIGS } from '@/agent/providers/types'

export function AgentPanel() {
  const [input, setInput] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [toolResults, setToolResults] = useState<Map<string, string>>(new Map())
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const agentLoopRef = useRef<AgentLoop | null>(null)

  const {
    status,
    streamingContent,
    currentToolCall,
    directoryHandle,
    directoryName,
    setStatus,
    appendStreamingContent,
    resetStreamingContent,
    setCurrentToolCall,
    setDirectoryHandle,
    setError,
    reset: resetAgent,
  } = useAgentStore()

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
  } = useConversationStore()

  const { providerType, modelName, maxTokens, hasApiKey } = useSettingsStore()

  // Load conversations on mount
  useEffect(() => {
    if (!loaded) loadFromDB()
  }, [loaded, loadFromDB])

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [activeConversation, streamingContent, status])

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

  const handleSelectFolder = async () => {
    try {
      const handle = await selectFolderReadWrite()
      setDirectoryHandle(handle)
    } catch (error) {
      if (error instanceof Error && error.message === 'User cancelled') return
      setError(error instanceof Error ? error.message : String(error))
    }
  }

  const handleSend = async () => {
    const text = input.trim()
    if (!text || status !== 'idle') return

    if (!hasApiKey) {
      setSettingsOpen(true)
      return
    }

    // Ensure we have a conversation
    let convId = activeConversationId
    if (!convId) {
      const conv = createNew(text.slice(0, 30))
      convId = conv.id
    }

    // Add user message
    const userMsg = createUserMessage(text)
    const conv = useConversationStore.getState().conversations.find((c) => c.id === convId)
    const currentMessages = conv ? [...conv.messages, userMsg] : [userMsg]
    updateMessages(convId!, currentMessages)
    setInput('')
    resetStreamingContent()

    // Setup agent
    try {
      const apiKey = await loadApiKey(providerType)
      if (!apiKey) {
        setError('API Key 未设置，请先在设置中配置')
        setSettingsOpen(true)
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

      const resultMessages = await agentLoop.run(currentMessages, {
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
          updateMessages(convId!, msgs)
          setToolResults(buildToolResultsMap(msgs))
          resetAgent()
        },
        onError: (err) => {
          setError(err.message)
        },
      })

      // Final update in case onComplete wasn't called
      updateMessages(convId!, resultMessages)
      setToolResults(buildToolResultsMap(resultMessages))
      resetAgent()
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        resetAgent()
        return
      }
      setError(error instanceof Error ? error.message : String(error))
    }
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
        <div className="w-48 shrink-0 overflow-y-auto border-r border-neutral-200 bg-neutral-50">
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
            {conversations.map((conv) => (
              <div
                key={conv.id}
                className={`group flex cursor-pointer items-center rounded-md px-2 py-1.5 text-xs ${
                  conv.id === activeConversationId
                    ? 'bg-primary-100 text-primary-700'
                    : 'text-neutral-600 hover:bg-neutral-200'
                }`}
                onClick={() => setActive(conv.id)}
              >
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
            ))}
          </div>
        </div>

        {/* Messages area */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            {messages.length === 0 && (
              <div className="flex h-full items-center justify-center">
                <div className="text-center text-neutral-400">
                  <MessageSquare className="mx-auto mb-2 h-8 w-8" />
                  <p className="text-sm">
                    {directoryHandle ? '输入消息开始对话' : '请先选择项目文件夹，然后开始对话'}
                  </p>
                </div>
              </div>
            )}

            {messages
              .filter((m) => m.role !== 'system' && m.role !== 'tool')
              .map((msg) => (
                <MessageBubble key={msg.id} message={msg} toolResults={toolResults} />
              ))}

            {/* Streaming assistant bubble */}
            {status === 'streaming' && streamingContent && (
              <StreamingBubble content={streamingContent} />
            )}

            {/* Thinking / tool calling indicator */}
            {(status === 'thinking' || status === 'tool_calling') && (
              <ThinkingIndicator status={status} toolName={currentToolCall?.function.name} />
            )}

            <div ref={messagesEndRef} />
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
