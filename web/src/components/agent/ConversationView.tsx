/**
 * ConversationView - pure conversation display and interaction.
 *
 * Now uses conversation store for per-conversation runtime state.
 * Multiple conversations can run simultaneously.
 */

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { Send, StopCircle, MessageSquare, ChevronDown, Plus, Trash2, Check } from 'lucide-react'
import { toast } from 'sonner'
import { useAgentStore } from '@/store/agent.store'
import { useConversationStore } from '@/store/conversation.store'
import { useSettingsStore } from '@/store/settings.store'
import { useProjectStore } from '@/store/project.store'
import { useAgentsStore } from '@/store/agents.store'
import { useT } from '@/i18n'
import { ErrorBoundary } from '@/components/error/ErrorBoundary'
import { MessageBubble } from './MessageBubble'
import { AssistantTurnBubble } from './AssistantTurnBubble'
import { AgentRichInput } from './AgentRichInput'
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
  const [mentionedAgentIds, setMentionedAgentIds] = useState<string[]>([])
  const [inputResetToken, setInputResetToken] = useState(0)
  const [isAgentDropdownOpen, setIsAgentDropdownOpen] = useState(false)
  const [isCreatingAgent, setIsCreatingAgent] = useState(false)
  const [newAgentId, setNewAgentId] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const { directoryHandle } = useAgentStore()
  const activeProjectId = useProjectStore((s) => s.activeProjectId)
  const isAgentsLoading = useAgentsStore((s) => s.isLoading)
  const isAgentsInitialized = useAgentsStore((s) => s.isInitialized)
  const allAgents = useAgentsStore((s) => s.agents)
  const activeAgentId = useAgentsStore((s) => s.activeAgentId)
  const setActiveAgent = useAgentsStore((s) => s.setActiveAgent)
  const createAgent = useAgentsStore((s) => s.createAgent)
  const deleteAgent = useAgentsStore((s) => s.deleteAgent)
  const mentionAgents = useAgentsStore((s) =>
    s.agents
      .filter((agent) => agent.id !== 'default')
      .map((agent) => ({ id: agent.id, name: agent.name }))
  )

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
  const regenerateUserMessage = useConversationStore((s) => s.regenerateUserMessage)

  const { providerType, modelName, maxTokens, hasApiKey } = useSettingsStore()
  const t = useT()

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

  useEffect(() => {
    if (!activeProjectId) return
    if (isAgentsLoading) return
    if (mentionAgents.length > 0 && isAgentsInitialized) return

    let cancelled = false
    ;(async () => {
      try {
        const { ProjectManager } = await import('@/opfs')
        const pm = await ProjectManager.create()
        const store = useAgentsStore.getState()
        store.setProjectManager(pm)
        await store.initialize(activeProjectId)
      } catch (error) {
        if (!cancelled) {
          console.warn('[ConversationView] Failed to initialize agents for mentions:', error)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [activeProjectId, isAgentsInitialized, isAgentsLoading, mentionAgents.length])

  // Close agent dropdown when clicking outside
  useEffect(() => {
    if (!isAgentDropdownOpen) return

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('.agent-dropdown-container')) {
        setIsAgentDropdownOpen(false)
        setIsCreatingAgent(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isAgentDropdownOpen])

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

    // StrictMode in dev can re-run mount effects. If the same initial message
    // has already been appended to this conversation, do not send it again.
    const currentConv = useConversationStore
      .getState()
      .conversations.find((c) => c.id === convId)
    const lastMessage = currentConv?.messages[currentConv.messages.length - 1]
    if (lastMessage?.role === 'user' && lastMessage.content === initialMessage) {
      initialMessageHandled.current = true
      initialMessageKeyRef.current = key
      onInitialMessageConsumed?.()
      return
    }

    initialMessageKeyRef.current = key
    if (!initialMessageHandled.current) {
      initialMessageHandled.current = true
      sendMessage(initialMessage)
      onInitialMessageConsumed?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMessage, convId, isRunning])

  const sendMessage = async (text: string, options?: { agentOverrideId?: string | null }) => {
    if (!text.trim()) return

    if (!hasApiKey) {
      toast.error(t('conversation.toast.noApiKey'))
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
    setMentionedAgentIds([])
    setInputResetToken((v) => v + 1)

    // Run agent
    await runAgent(
      targetConvId,
      providerType,
      modelName,
      maxTokens,
      directoryHandle,
      options?.agentOverrideId ?? null
    )
  }

  const handleSend = () => {
    const inputTrimmed = input.trim()
    const textToSend = inputTrimmed ? input : suggestedFollowUp
    if (textToSend) {
      const agentOverrideId = inputTrimmed ? (mentionedAgentIds[0] ?? null) : null
      sendMessage(textToSend, { agentOverrideId })
      // Clear the follow-up suggestion after sending
      if (!inputTrimmed && convId) {
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
      toast.success(t('conversation.toast.deletedTurn'))
    }
  }

  const handleCreateAgent = async () => {
    const id = newAgentId.trim()
    if (!id) return
    const created = await createAgent(id)
    if (!created) return
    await setActiveAgent(created.id)
    setNewAgentId('')
    setIsCreatingAgent(false)
  }

  const handleDeleteAgent = async (agentId: string) => {
    if (agentId === 'default') return
    if (!window.confirm(`Delete agent "${agentId}"?`)) return
    await deleteAgent(agentId)
  }

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
      return { text: 'text-red-600 dark:text-red-400', label: t('conversation.usage.highRisk') }
    }
    if (usagePercent >= 75) {
      return { text: 'text-amber-600 dark:text-amber-400', label: t('conversation.usage.nearLimit') }
    }
    return { text: 'text-emerald-600 dark:text-emerald-400', label: t('conversation.usage.comfortable') }
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
      <div className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden bg-white dark:bg-neutral-950">
        {/* Messages area - allow shrink with min-h-0 so input stays visible */}
        <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto">
          {activeConversation?.messages.length === 0 && !isProcessing ? (
            <div className="flex h-full items-center justify-center">
              <div className="flex flex-col items-center text-center">
                <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-primary-500 to-primary-600 shadow-2xl shadow-primary-500/30 ring-4 ring-primary-500/10 dark:ring-primary-500/20">
                  <MessageSquare className="h-10 w-10 text-white" />
                </div>
                <h3 className="mb-3 text-xl font-semibold text-neutral-900 dark:text-neutral-100">
                  {t('conversation.empty.title')}
                </h3>
                <p className="max-w-md text-sm leading-relaxed text-neutral-500 dark:text-neutral-400">
                  {t('conversation.empty.description')}
                </p>
              </div>
            </div>
          ) : (
            <div className="min-h-0 px-4 py-4">
              <div className="mx-auto w-full max-w-3xl space-y-4">
              {turns.map((turn, idx) =>
                turn.type === 'user' ? (
                  <MessageBubble
                    key={turn.message.id}
                    message={turn.message}
                    onDeleteAgentLoop={handleDeleteAgentLoop}
                    onRegenerate={
                      convId ? (userMessageId: string) => regenerateUserMessage(convId, userMessageId) : undefined
                    }
                    onCancel={handleCancel}
                    disableDeleteActions={isProcessing}
                    isProcessing={isProcessing}
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
          )}
        </div>

        {conversationError && (
          <div className="border-t border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
            <div className="mx-auto max-w-3xl">
              <span className="font-medium">{t('conversation.error.requestFailed')}</span>
              <span>{conversationError}</span>
            </div>
          </div>
        )}

        {/* Input area */}
        <div className="shrink-0 border-t border-neutral-200 bg-white px-4 py-3 dark:border-neutral-700 dark:bg-neutral-900">
          <div className="mx-auto flex max-w-3xl flex-col">
            <div className="relative">
              <AgentRichInput
                placeholder={
                  suggestedFollowUp ||
                  (hasApiKey ? t('conversation.input.placeholder') : t('conversation.input.placeholderNoKey'))
                }
                ariaLabel={t('conversation.input.ariaLabel')}
                disabled={isProcessing || !hasApiKey}
                resetToken={inputResetToken}
                agents={mentionAgents}
                activeAgentId={activeAgentId}
                allAgents={allAgents}
                onSetActiveAgent={setActiveAgent}
                onCreateAgent={createAgent}
                onDeleteAgent={deleteAgent}
                onChange={({ text, mentionedAgentIds: mentionedIds }) => {
                  setInput(text)
                  setMentionedAgentIds(mentionedIds)
                }}
                onSubmit={handleSend}
              />
              {isProcessing ? (
                <button
                  type="button"
                  onClick={handleCancel}
                  className="absolute bottom-4 right-4 rounded-xl bg-red-500 p-2 text-white shadow-sm transition-colors hover:bg-red-600"
                  title={t('conversation.buttons.stop')}
                >
                  <StopCircle className="h-4 w-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={(!input.trim() && !suggestedFollowUp) || !hasApiKey}
                  className="absolute bottom-4 right-4 rounded-xl bg-primary-600 p-2 text-white shadow-sm transition-colors hover:bg-primary-700 disabled:opacity-30 disabled:hover:bg-primary-600"
                  title={t('conversation.buttons.send')}
                >
                  <Send className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {/* Compact agent selector row */}
          <div className="mx-auto mt-2 flex max-w-3xl items-center justify-between">
            <div className="agent-dropdown-container relative">
              <button
                type="button"
                onClick={() => setIsAgentDropdownOpen((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-xs font-medium text-neutral-600 transition-colors hover:border-neutral-300 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:border-neutral-600 dark:hover:bg-neutral-700"
              >
                <span className={`h-1.5 w-1.5 rounded-full ${activeAgentId ? 'bg-emerald-500' : 'bg-neutral-400'}`} />
                <span className="max-w-[120px] truncate">@{activeAgentId || 'default'}</span>
                <ChevronDown className={`h-3 w-3 transition-transform ${isAgentDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {/* Dropdown menu */}
              {isAgentDropdownOpen && (
                <div className="absolute bottom-full left-0 z-50 mb-1 w-52 overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
                  <div className="max-h-48 overflow-y-auto py-1">
                    {allAgents.map((agent) => {
                      const isActive = activeAgentId === agent.id
                      return (
                        <div
                          key={agent.id}
                          className="flex w-full items-center justify-between px-3 py-1.5 text-xs transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800"
                        >
                          <button
                            type="button"
            onClick={() => {
                              void setActiveAgent(agent.id)
                              setIsAgentDropdownOpen(false)
                            }}
                            className="min-w-0 flex-1 text-left"
                          >
                            <span className={`font-medium ${isActive ? 'text-primary-600 dark:text-primary-400' : 'text-neutral-700 dark:text-neutral-300'}`}>
                              @{agent.id}
                            </span>
                          </button>
                          <div className="ml-2 flex items-center gap-1">
                            {isActive && <Check className="h-3 w-3 text-primary-500" />}
                            {agent.id !== 'default' && (
                              <button
                                type="button"
                                onClick={() => void handleDeleteAgent(agent.id)}
                                className="rounded p-0.5 text-neutral-400 hover:bg-neutral-200 hover:text-red-500 dark:text-neutral-500 dark:hover:bg-neutral-700 dark:hover:text-red-400"
                                title={`Delete ${agent.id}`}
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Create new agent */}
                  <div className="border-t border-neutral-200 p-2 dark:border-neutral-700">
                    {isCreatingAgent ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          value={newAgentId}
                          onChange={(e) => setNewAgentId(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              void handleCreateAgent()
                            } else if (e.key === 'Escape') {
                              setIsCreatingAgent(false)
                              setNewAgentId('')
                            }
                          }}
                          placeholder="agent-id"
                          autoFocus
                          className="h-7 flex-1 rounded border border-neutral-300 bg-white px-2 text-xs text-neutral-900 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100"
                        />
                        <button
                          type="button"
                          onClick={() => void handleCreateAgent()}
                          disabled={!newAgentId.trim()}
                          className="rounded bg-primary-600 px-2 py-1 text-xs text-white hover:bg-primary-700 disabled:opacity-40"
                        >
                          Add
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setIsCreatingAgent(true)}
                        className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-xs text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
                      >
                        <Plus className="h-3 w-3" />
                        New agent
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {renderContextUsage()}
          </div>
        </div>
      </div>
    </ErrorBoundary>
  )
}
