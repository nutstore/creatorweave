/**
 * useConversationLogic — all store selectors, effects, and handlers
 * extracted from ConversationView.
 *
 * IMPORTANT: Streaming data (draftAssistant, streamingContent, etc.) is
 * NOT exposed from this hook. It is subscribed directly inside
 * ConversationMessages to prevent ConversationView from re-rendering
 * on every streaming token (~60fps).
 */

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { toast } from 'sonner'
import { useAgentStore } from '@/store/agent.store'
import { useConversationStore } from '@/store/conversation.store'
import { useConversationRuntimeStore } from '@/store/conversation-runtime.store'
import { useSettingsStore } from '@/store/settings.store'
import { useWorkspacePreferencesStore } from '@/store/workspace-preferences.store'
import { useProjectStore } from '@/store/project.store'
import { useAgentsStore } from '@/store/agents.store'
import { useT } from '@/i18n'
import { createUserMessage } from '@/agent/message-types'
import type { Message } from '@/agent/message-types'
import { useAssetStore } from '@/store/asset.store'
import { writePendingAssetsToOPFS } from '@/services/asset.service'
import { useInputDraftStore } from '@/store/input-draft.store'
import { useActiveConversation } from './useActiveConversation'

/** Stable empty array so mentionAgents selector returns same ref when unchanged */
const EMPTY_MENTION_AGENTS: { id: string; name: string }[] = []

export function useConversationLogic() {
  const t = useT()

  // ── Local UI state ──
  // Input text is stored in a ref to avoid re-rendering ConversationView on every keystroke.
  // Only a boolean `hasInput` state is kept to drive the send button's disabled state.
  const inputRef = useRef('')
  const [hasInput, setHasInput] = useState(false)
  // Mentioned agent IDs also live in a ref — they are only read inside stable callbacks.
  const mentionedAgentIdsRef = useRef<string[]>([])
  const setMentionedAgentIds = useCallback((ids: string[]) => { mentionedAgentIdsRef.current = ids }, [])
  const [inputResetToken, setInputResetToken] = useState(0)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const isUserAtBottomRef = useRef(true)
  // ── Draft persistence (save/restore across workspace switches) ──
  const prevConvIdRef = useRef<string | null>(null)

  /**
   * setInput — updates the input ref and only triggers a re-render
   * when the empty↔non-empty boundary changes (to update send button state).
   */
  const setInput = useCallback((text: string) => {
    inputRef.current = text
    const next = text.trim().length > 0
    setHasInput((prev) => (prev !== next ? next : prev))
  }, [])

  // The draft text to inject into the editor when switching back to a workspace.
  // This is separate from `input` because Tiptap manages its own content.
  const [draftTextToRestore, setDraftTextToRestore] = useState<string | null>(null)
  // Track which convId the draft belongs to, so we can clear it after restore
  const draftConvIdRef = useRef<string | null>(null)

  // ── Agent store (fine-grained selector) ──
  const directoryHandle = useAgentStore((s) => s.directoryHandle)

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
  const mentionAgents = useAgentsStore(
    useShallow((s) => {
      const filtered = s.agents
        .filter((agent) => agent.id !== 'default')
        .map((agent) => ({ id: agent.id, name: agent.name }))
      return filtered.length === 0 ? EMPTY_MENTION_AGENTS : filtered
    }),
  )

  // ── Active conversation — only select NON-streaming data ──
  // Streaming data is subscribed inside ConversationMessages directly.
  const active = useActiveConversation()
  const convId = active.convId
  const activeMessages = active.messages
  const status = active.status
  // NOTE: active.draftAssistant and active.streamingState are intentionally
  // NOT destructured here. They change at ~60fps during streaming and would
  // cause ConversationView to re-render on every token.
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
  const isConversationRunning = useConversationRuntimeStore((s) => s.isConversationRunning)
  const getSuggestedFollowUp = useConversationRuntimeStore((s) => s.getSuggestedFollowUp)
  const clearSuggestedFollowUp = useConversationRuntimeStore((s) => s.clearSuggestedFollowUp)
  const mountConversation = useConversationRuntimeStore((s) => s.mountConversation)
  const unmountConversation = useConversationRuntimeStore((s) => s.unmountConversation)
  const regenerateUserMessage = useConversationStore((s) => s.regenerateUserMessage)
  const editAndResendUserMessage = useConversationStore((s) => s.editAndResendUserMessage)

  // ── Settings store (fine-grained selectors to avoid cascade re-renders) ──
  const providerType = useSettingsStore((s) => s.providerType)
  const modelName = useSettingsStore((s) => s.modelName)
  const maxTokens = useSettingsStore((s) => s.maxTokens)
  const hasApiKey = useSettingsStore((s) => s.hasApiKey)
  const enableThinking = useSettingsStore((s) => s.enableThinking)
  const thinkingLevel = useSettingsStore((s) => s.thinkingLevel)
  const setEnableThinking = useSettingsStore((s) => s.setEnableThinking)
  const setThinkingLevel = useSettingsStore((s) => s.setThinkingLevel)

  // ── Workspace preferences store (fine-grained selectors) ──
  const agentMode = useWorkspacePreferencesStore((s) => s.agentMode)
  const setAgentMode = useWorkspacePreferencesStore((s) => s.setAgentMode)

  // ── Derived state ──
  const isRunning = convId ? isConversationRunning(convId) : false
  const isProcessing = isRunning

  // ── Static snapshot for ConversationMessages ──
  // Only contains data that changes at low frequency (not per-token).
  const staticSnapshot = useMemo(() => ({
    activeWorkflowExecution,
  }), [activeWorkflowExecution])

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

  // ── Draft save/restore on workspace switch ──
  useEffect(() => {
    const prevId = prevConvIdRef.current
    prevConvIdRef.current = convId

    // Save draft for the previous workspace (if there was one and it changed)
    if (prevId && prevId !== convId) {
      useInputDraftStore.getState().saveDraft(prevId, {
        text: inputRef.current,
        mentionedAgentIds: mentionedAgentIdsRef.current,
        selectedFiles: [],
      })
    }

    // Restore draft for the new workspace (if one exists)
    // Uses peekDraft (non-destructive) to survive React StrictMode double-mount
    if (convId) {
      const draft = useInputDraftStore.getState().peekDraft(convId)
      if (draft) {
        setMentionedAgentIds(draft.mentionedAgentIds)
        setDraftTextToRestore(draft.text)
        draftConvIdRef.current = convId
      } else {
        setDraftTextToRestore(null)
        draftConvIdRef.current = null
      }
    } else {
      setDraftTextToRestore(null)
      draftConvIdRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // setMentionedAgentIds / setSelectedFiles are useState setters (stable refs).
    // Values are read via refs to avoid stale closures without re-triggering.
  }, [convId])

  // Stable callback to clear draft after the editor has consumed it
  const onDraftRestored = useCallback(() => {
    const id = draftConvIdRef.current
    if (id) {
      useInputDraftStore.getState().clearDraft(id)
      draftConvIdRef.current = null
    }
    setDraftTextToRestore(null)
  }, [])

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

  // ── Smart auto-scroll (only scroll when user is already at the bottom) ──
  const activeMessagesLength = activeMessages.length

  // Scroll-to-bottom state is managed by ScrollToBottomButton component
  // to avoid re-rendering ConversationView (and AgentRichInput) on every scroll event.

  useEffect(() => {
    // Don't auto-scroll if user is browsing history above
    if (!isUserAtBottomRef.current) return
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

  // Only committed tool results from messages.
  // Runtime tool results are merged inside ConversationMessages (subscribed directly).
  const toolResults = useMemo(() => buildToolResultsMap(activeMessages), [activeMessages, buildToolResultsMap])

  // ── Follow-up suggestion ──
  const suggestedFollowUp = convId ? getSuggestedFollowUp(convId) : ''

  // ── Workflow templates ──
  const workflowTemplates = useMemo(() => listWorkflowTemplates(), [listWorkflowTemplates])

  // ── Handlers ──
  // Refs for reading latest values inside stable callbacks
  const convIdRef = useRef(convId)
  convIdRef.current = convId

  const sendMessage = useCallback(async (text: string, options?: { agentOverrideId?: string | null; assets?: import('@/types/asset').AssetMeta[] }) => {
    if (!text.trim()) return
    // Read latest from store to avoid stale closures
    const { hasApiKey: hasKey, providerType: pType, modelName: mName, maxTokens: mTokens } = useSettingsStore.getState()
    if (!hasKey) {
      toast.error(t('conversation.toast.noApiKey'))
      return
    }

    const { directoryHandle: dh } = useAgentStore.getState()
    let targetConvId = convIdRef.current
    const { createNew, setActive, isConversationRunning: isRunning, updateMessages, runAgent } = useConversationStore.getState()
    if (!targetConvId) {
      const conv = createNew(text.slice(0, 30))
      targetConvId = conv.id
      setActive(targetConvId)
    }

    if (useConversationRuntimeStore.getState().isConversationRunning(targetConvId)) {
      toast.error(t('conversation.toast.stopBeforeSend'))
      return
    }

    // Resolve assets: use provided assets OR fall back to pending assets from store
    let assets = options?.assets
    if (!assets || assets.length === 0) {
      const { pendingAssets, clearAll } = useAssetStore.getState()
      if (pendingAssets.length > 0) {
        try {
          // Ensure workspace is ready for asset writes.
          // setActive() above fires switchWorkspace asynchronously, so we
          // may need to wait for it to complete before the OPFS directory exists.
          const { useWorkspaceStore } = await import('@/store/workspace.store')
          const wsState = useWorkspaceStore.getState()
          if (wsState.activeWorkspaceId !== targetConvId) {
            await wsState.switchWorkspace(targetConvId)
          }

          assets = await writePendingAssetsToOPFS(
            pendingAssets.map((a) => ({ name: a.name, file: a.file })),
          )
        } catch (err) {
          toast.error(`Upload failed: ${err instanceof Error ? err.message : String(err)}`)
          return // Don't send — user can retry
        }
        clearAll()
      }
    }

    const userMsg = createUserMessage(text, assets)
    const conv = useConversationStore.getState().conversations.find((c) => c.id === targetConvId)
    updateMessages(targetConvId, conv ? [...conv.messages, userMsg] : [userMsg])
    setInput('')
    setMentionedAgentIds([])
    setInputResetToken((v) => v + 1)
    // Clear any draft for this conversation (message sent) and reset restore state
    useInputDraftStore.getState().clearDraft(targetConvId)
    setDraftTextToRestore(null)
    // User initiated send — always scroll to bottom
    isUserAtBottomRef.current = true
    draftConvIdRef.current = null

    await runAgent(
      targetConvId, pType, mName, mTokens, dh,
      options?.agentOverrideId ?? null
    )
  }, [t])

  const handleSend = useCallback(async () => {
    const inputTrimmed = inputRef.current.trim()
    const currentConvId = convIdRef.current
    const currentMentionedAgentIds = mentionedAgentIdsRef.current
    const { getSuggestedFollowUp, clearSuggestedFollowUp } = useConversationRuntimeStore.getState()
    let textToSend = inputTrimmed ? inputRef.current : (currentConvId ? getSuggestedFollowUp(currentConvId) : '')
    if (textToSend) {
      // Assets are resolved inside sendMessage (from options or pendingAssets store)
      sendMessage(textToSend, { agentOverrideId: inputTrimmed ? (currentMentionedAgentIds[0] ?? null) : null })
      if (!inputTrimmed && currentConvId) clearSuggestedFollowUp(currentConvId)
    }
  }, [sendMessage])

  const handleCancel = useCallback(() => {
    const currentConvId = convIdRef.current
    if (currentConvId) useConversationStore.getState().cancelAgent(currentConvId)
  }, [])

  const handleRunWorkflow = async (templateId: string, rubricDsl?: string) => {
    if (!convId || !templateId || isProcessing) return
    await runWorkflowDryRun(convId, templateId, { rubricDsl })
  }

  const handleRealRunWorkflow = async (templateId: string, rubricDsl?: string) => {
    if (!convId || !templateId || isProcessing) return
    await runWorkflowRealRun(convId, templateId, { rubricDsl })
  }

  const handleDeleteAgentLoop = useCallback((messageId: string) => {
    const currentConvId = convIdRef.current
    if (!currentConvId) return
    if (deleteAgentLoop(currentConvId, messageId)) toast.success(t('conversation.toast.deletedTurn'))
  }, [deleteAgentLoop, t])

  const handleEditAndResend = useCallback((userMessageId: string, newContent: string) => {
    const currentConvId = convIdRef.current
    if (!currentConvId) return
    editAndResendUserMessage(currentConvId, userMessageId, newContent)
  }, [editAndResendUserMessage])

  const handleRegenerate = useCallback(
    convId ? (id: string) => regenerateUserMessage(convId, id) : undefined,
    [convId, regenerateUserMessage],
  )

  return {
    // Local UI state
    hasInput, setInput, setMentionedAgentIds, inputResetToken, messagesEndRef, scrollContainerRef,
    isUserAtBottomRef,
    draftTextToRestore, onDraftRestored,
    // Agent store
    allAgents, activeAgentId, setActiveAgent, createAgent, deleteAgent, mentionAgents,
    // Conversation state (NO streaming data — that's subscribed in ConversationMessages)
    convId, activeMessages,
    conversationError, activeContextWindowUsage,
    isProcessing, isRunning, status, suggestedFollowUp, workflowTemplates,
    toolResults,
    // Static snapshot for ConversationMessages
    staticSnapshot,
    // Settings
    hasApiKey, enableThinking, thinkingLevel, setEnableThinking, setThinkingLevel,
    // Workspace preferences
    agentMode, setAgentMode,
    // Handlers
    sendMessage, handleSend, handleCancel, handleRunWorkflow, handleRealRunWorkflow,
    handleDeleteAgentLoop, handleEditAndResend, handleRegenerate, regenerateUserMessage,
    clearSuggestedFollowUp, runCustomWorkflowDryRun,
    // Store refs (for ErrorBoundary reset)
    useConversationStore, useConversationRuntimeStore,
  }
}

export type ConversationLogic = ReturnType<typeof useConversationLogic>
