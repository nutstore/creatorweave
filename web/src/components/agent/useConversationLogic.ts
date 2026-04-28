/**
 * useConversationLogic — all store selectors, effects, and handlers
 * extracted from ConversationView.
 */

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import { useAgentStore } from '@/store/agent.store'
import { useConversationStore } from '@/store/conversation.store'
import { useSettingsStore } from '@/store/settings.store'
import { useWorkspacePreferencesStore } from '@/store/workspace-preferences.store'
import { useProjectStore } from '@/store/project.store'
import { useAgentsStore } from '@/store/agents.store'
import { useT } from '@/i18n'
import { createUserMessage } from '@/agent/message-types'
import type { Message } from '@/agent/message-types'
import { useAssetStore } from '@/store/asset.store'
import { writePendingAssetsToOPFS } from '@/services/asset.service'
import { useActiveConversation } from './useActiveConversation'

export function useConversationLogic() {
  const t = useT()

  // ── Local UI state ──
  const [input, setInput] = useState('')
  const [mentionedAgentIds, setMentionedAgentIds] = useState<string[]>([])
  const [selectedFiles, setSelectedFiles] = useState<string[]>([])
  const [inputResetToken, setInputResetToken] = useState(0)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // ── Agent store ──
  const { directoryHandle } = useAgentStore()

  // ── Project store ──
  const activeProjectId = useProjectStore((s) => s.activeProjectId)

  // ── Agents store ──
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

  // ── Active conversation (single selector, one find) ──
  const active = useActiveConversation()
  const convId = active.convId
  const activeMessages = active.messages
  const status = active.status
  const activeDraftAssistant = active.draftAssistant
  const activeStreamingState = active.streamingState
  const activeWorkflowExecution = active.workflowExecution
  const conversationError = active.error
  const activeContextWindowUsage = active.contextWindowUsage

  // ── Conversation actions (stable refs from store) ──
  const createNew = useConversationStore((s) => s.createNew)
  const updateMessages = useConversationStore((s) => s.updateMessages)
  const deleteAgentLoop = useConversationStore((s) => s.deleteAgentLoop)
  const setActive = useConversationStore((s) => s.setActive)
  const runAgent = useConversationStore((s) => s.runAgent)
  const runWorkflowDryRun = useConversationStore((s) => s.runWorkflowDryRun)
  const runWorkflowRealRun = useConversationStore((s) => s.runWorkflowRealRun)
  const runCustomWorkflowDryRun = useConversationStore((s) => s.runCustomWorkflowDryRun)
  const listWorkflowTemplates = useConversationStore((s) => s.listWorkflowTemplates)
  const cancelAgent = useConversationStore((s) => s.cancelAgent)
  const isConversationRunning = useConversationStore((s) => s.isConversationRunning)
  const getSuggestedFollowUp = useConversationStore((s) => s.getSuggestedFollowUp)
  const clearSuggestedFollowUp = useConversationStore((s) => s.clearSuggestedFollowUp)
  const mountConversation = useConversationStore((s) => s.mountConversation)
  const unmountConversation = useConversationStore((s) => s.unmountConversation)
  const regenerateUserMessage = useConversationStore((s) => s.regenerateUserMessage)
  const editAndResendUserMessage = useConversationStore((s) => s.editAndResendUserMessage)

  // ── Settings store ──
  const {
    providerType,
    modelName,
    maxTokens,
    hasApiKey,
    enableThinking,
    thinkingLevel,
    setEnableThinking,
    setThinkingLevel,
  } = useSettingsStore()

  // ── Workspace preferences store ──
  const { agentMode, setAgentMode } = useWorkspacePreferencesStore()

  // ── Derived state ──
  const isRunning = convId ? isConversationRunning(convId) : false
  const isProcessing = isRunning

  // ── Refs ──
  const lastRenderedMessageCountRef = useRef(0)

  // ── Mount / unmount tracking ──
  useEffect(() => {
    if (convId) mountConversation(convId)
    return () => {
      if (convId) unmountConversation(convId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convId])

  // ── Initialize agents for mentions ──
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

    return () => { cancelled = true }
  }, [activeProjectId, isAgentsInitialized, isAgentsLoading, mentionAgents.length])

  // ── Auto-scroll ──
  const activeMessagesLength = activeMessages.length
  useEffect(() => {
    const behavior: ScrollBehavior =
      activeMessagesLength > lastRenderedMessageCountRef.current ? 'smooth' : 'auto'
    lastRenderedMessageCountRef.current = activeMessagesLength
    messagesEndRef.current?.scrollIntoView({ behavior })
  }, [activeMessagesLength, status])

  // ── Tool results map ──
  const buildToolResultsMap = useCallback((messages: Message[]) => {
    const map = new Map<string, string>()
    for (const msg of messages) {
      if (msg.role === 'tool' && msg.toolCallId) {
        map.set(msg.toolCallId, msg.content || '')
      }
    }
    return map
  }, [])

  const toolResults = useMemo(() => {
    const merged = buildToolResultsMap(activeMessages)
    const runtimeResults = activeDraftAssistant?.toolResults || {}
    for (const [toolCallId, result] of Object.entries(runtimeResults)) {
      if (!merged.has(toolCallId)) merged.set(toolCallId, result)
    }
    return merged
  }, [activeMessages, activeDraftAssistant?.toolResults, buildToolResultsMap])

  // ── Follow-up suggestion ──
  const suggestedFollowUp = convId ? getSuggestedFollowUp(convId) : ''

  // ── Workflow templates ──
  const workflowTemplates = useMemo(() => listWorkflowTemplates(), [listWorkflowTemplates])

  // ── Streaming state (derived) ──
  const streamingState =
    !activeStreamingState || !isProcessing
      ? undefined
      : {
          reasoning: activeStreamingState.isReasoningStreaming,
          content: activeStreamingState.isContentStreaming,
        }

  const streamingContentMessage =
    !activeStreamingState || !activeDraftAssistant || !isProcessing
      ? undefined
      : (() => {
          const reasoning = activeDraftAssistant.reasoning || activeStreamingState.streamingReasoning
          const content = activeDraftAssistant.content || activeStreamingState.streamingContent
          if (!reasoning && !content) return undefined
          const lastAssistant = [...activeMessages].reverse().find((m) => m.role === 'assistant')
          if (
            lastAssistant &&
            (lastAssistant.reasoning || '') === (reasoning || '') &&
            (lastAssistant.content || '') === (content || '')
          ) return undefined
          return { reasoning, content }
        })()

  // ── Handlers ──
  const sendMessage = async (text: string, options?: { agentOverrideId?: string | null; assets?: import('@/types/asset').AssetMeta[] }) => {
    if (!text.trim()) return
    if (!hasApiKey) {
      toast.error(t('conversation.toast.noApiKey'))
      return
    }

    let targetConvId = convId
    if (!targetConvId) {
      const conv = createNew(text.slice(0, 30))
      targetConvId = conv.id
      setActive(targetConvId)
    }

    if (isConversationRunning(targetConvId)) return

    const userMsg = createUserMessage(text, options?.assets)
    const conv = useConversationStore.getState().conversations.find((c) => c.id === targetConvId)
    updateMessages(targetConvId, conv ? [...conv.messages, userMsg] : [userMsg])
    setInput('')
    setMentionedAgentIds([])
    setInputResetToken((v) => v + 1)

    await runAgent(
      targetConvId, providerType, modelName, maxTokens, directoryHandle,
      options?.agentOverrideId ?? null
    )
  }

  const handleSend = async () => {
    const inputTrimmed = input.trim()
    let textToSend = inputTrimmed ? input : suggestedFollowUp
    if (textToSend) {
      // Prepend selected file paths as `#path` references
      if (selectedFiles.length > 0) {
        const filePrefix = selectedFiles.map((p) => `#${p}`).join(' ')
        textToSend = `${filePrefix} ${textToSend}`
      }

      // Upload pending assets to OPFS and get AssetMeta[]
      const { pendingAssets, clearAll } = useAssetStore.getState()
      let assets = undefined
      if (pendingAssets.length > 0) {
        try {
          assets = await writePendingAssetsToOPFS(
            pendingAssets.map((a) => ({ name: a.name, file: a.file })),
          )
        } catch (err) {
          toast.error(`Upload failed: ${err instanceof Error ? err.message : String(err)}`)
          return // Don't send — user can retry
        }
        clearAll()
      }

      sendMessage(textToSend, { agentOverrideId: inputTrimmed ? (mentionedAgentIds[0] ?? null) : null, assets })
      if (!inputTrimmed && convId) clearSuggestedFollowUp(convId)
      setSelectedFiles([])
    }
  }

  const handleCancel = () => { if (convId) cancelAgent(convId) }

  const handleRunWorkflow = async (templateId: string, rubricDsl?: string) => {
    if (!convId || !templateId || isProcessing) return
    await runWorkflowDryRun(convId, templateId, { rubricDsl })
  }

  const handleRealRunWorkflow = async (templateId: string, rubricDsl?: string) => {
    if (!convId || !templateId || isProcessing) return
    await runWorkflowRealRun(convId, templateId, { rubricDsl })
  }

  const handleDeleteAgentLoop = (messageId: string) => {
    if (!convId) return
    if (deleteAgentLoop(convId, messageId)) toast.success(t('conversation.toast.deletedTurn'))
  }

  const handleEditAndResend = (userMessageId: string, newContent: string) => {
    if (!convId) return
    editAndResendUserMessage(convId, userMessageId, newContent)
  }

  return {
    // Local UI state
    input, setInput, mentionedAgentIds, setMentionedAgentIds, selectedFiles, setSelectedFiles, inputResetToken, messagesEndRef,
    // Agent store
    allAgents, activeAgentId, setActiveAgent, createAgent, deleteAgent, mentionAgents,
    // Conversation state
    convId, activeMessages, activeDraftAssistant, activeStreamingState,
    activeWorkflowExecution, conversationError, activeContextWindowUsage,
    isProcessing, isRunning, status, suggestedFollowUp, workflowTemplates,
    toolResults, streamingState, streamingContentMessage,
    // Settings
    hasApiKey, enableThinking, thinkingLevel, setEnableThinking, setThinkingLevel,
    // Workspace preferences
    agentMode, setAgentMode,
    // Handlers
    sendMessage, handleSend, handleCancel, handleRunWorkflow, handleRealRunWorkflow,
    handleDeleteAgentLoop, handleEditAndResend, regenerateUserMessage,
    clearSuggestedFollowUp, runCustomWorkflowDryRun,
    // Store ref (for ErrorBoundary reset)
    useConversationStore,
  }
}

export type ConversationLogic = ReturnType<typeof useConversationLogic>
