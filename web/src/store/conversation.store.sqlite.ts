/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Conversation Store
 *
 * Manages chat history with per-conversation AgentLoop instances.
 * Uses SQLite for persistence.
 *
 * Runtime state (status, streaming content, etc.) is stored per-conversation
 * and not persisted to SQLite.
 */

import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { enableMapSet } from 'immer'
import { toast } from 'sonner'
import type { Conversation, Message, ToolCall, ConversationStatus } from '@/agent/message-types'
import { createAssistantMessage, createConversation } from '@/agent/message-types'
import {
  emitThinkingStart,
  emitThinkingDelta,
  emitCompressionEvent,
  emitToolStart,
  emitComplete,
  emitError,
} from '@/streaming-bus'
import { useWorkspaceStore } from './workspace.store'
import { getElicitationHandler } from '@/mcp/elicitation-handler.tsx'

// Default conversation name when title is not available
const DEFAULT_CONVERSATION_NAME = '对话'
import { StreamingQueue } from '../utils/streaming-queue'

// Enable Immer Map/Set support
enableMapSet()
import { AgentLoop } from '@/agent/agent-loop'
import { createToolPolicyHooks } from '@/agent/tool-policy'
import { createLLMProvider } from '@/agent/llm/provider-factory'
import { ContextManager } from '@/agent/context-manager'
import { getToolRegistry } from '@/agent/tool-registry'
import { getApiKeyRepository } from '@/sqlite'
import { LLM_PROVIDER_CONFIGS, type LLMProviderType } from '@/agent/providers/types'
import { generateFollowUp } from '@/agent/follow-up-generator'
import { getConversationRepository, initSQLiteDB } from '@/sqlite'
import { useSettingsStore } from './settings.store'
import {
  createThread as createThreadUtil,
  mergeThreads as mergeThreadsUtil,
  deleteThread as deleteThreadUtil,
  getNextThread,
  getPreviousThread,
  forkThread as forkThreadUtil,
} from '@/agent/thread-utils'

const ENABLE_FOLLOW_UP_LLM = import.meta.env.VITE_ENABLE_FOLLOW_UP_LLM === 'true'

//=============================================================================
// Persistence Functions (SQLite)
//=============================================================================

/** Persist a conversation to SQLite (excludes runtime state) */
async function persistConversation(conversation: Conversation): Promise<void> {
  const repo = getConversationRepository()
  // Create a clean copy without runtime state for persistence
  await repo.save({
    id: conversation.id,
    title: conversation.title,
    titleMode: conversation.titleMode || 'manual',
    messages: conversation.messages,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
  })
}

/** Load all conversations from SQLite */
async function loadConversations(): Promise<Conversation[]> {
  const repo = getConversationRepository()
  const stored = await repo.findAll()
  // Add runtime state to each stored conversation
  return stored.map((conv) => ({
    ...conv,
    titleMode: conv.titleMode || 'manual',
    messages: conv.messages as Message[],
    status: 'idle' as const,
    streamingContent: '',
    streamingReasoning: '',
    isReasoningStreaming: false,
    completedReasoning: null,
    isContentStreaming: false,
    completedContent: null,
    currentToolCall: null,
    activeToolCalls: [],
    streamingToolArgs: '',
    streamingToolArgsByCallId: {},
    error: null,
    activeRunId: null,
    runEpoch: 0,
    draftAssistant: null,
    mountRefCount: 0,
  }))
}

/** Delete a conversation from SQLite */
async function deleteConversationFromDB(id: string): Promise<void> {
  const repo = getConversationRepository()
  await repo.delete(id)
}

//=============================================================================
// Title Management
//=============================================================================

const MAX_TITLE_LENGTH = 30

function truncateTitle(content: string): string {
  let trimmed = content.trim()
  trimmed = trimmed.replace(/\s+/g, ' ')
  if (trimmed.length <= MAX_TITLE_LENGTH) {
    return trimmed
  }
  return trimmed.slice(0, MAX_TITLE_LENGTH - 1) + '…'
}

function updateAutoTitleAfterMessageDelete(conv: Conversation): void {
  if (conv.titleMode === 'manual') return

  const firstUserMessage = conv.messages.find((m) => m.role === 'user' && m.content)
  if (firstUserMessage?.content) {
    conv.title = truncateTitle(firstUserMessage.content)
    return
  }
  conv.title = DEFAULT_CONVERSATION_NAME
}

//=============================================================================
// Store Definition
//=============================================================================

interface ConversationState {
  conversations: Conversation[]
  activeConversationId: string | null
  loaded: boolean

  // AgentLoop management (not persisted)
  agentLoops: Map<string, AgentLoop>

  // Streaming queues for RAF-batched updates (not persisted)
  streamingQueues: Map<string, { reasoning: StreamingQueue; content: StreamingQueue }>

  // Follow-up suggestions (not persisted) - per conversation
  suggestedFollowUps: Map<string, string>

  // Track mounted view ref counts per conversation (not persisted)
  // Used to prevent StrictMode mount/unmount churn from cancelling active runs
  mountedConversations: Map<string, number>

  // Computed
  activeConversation: () => Conversation | null

  // Status helpers
  getConversationStatus: (id: string) => ConversationStatus
  isConversationRunning: (id: string) => boolean
  getRunningConversations: () => string[]

  // Actions
  loadFromDB: () => Promise<void>
  createNew: (title?: string) => Conversation
  setActive: (id: string | null) => Promise<void>
  addMessage: (conversationId: string, message: Message) => void
  updateMessages: (conversationId: string, messages: Message[]) => void
  deleteUserMessage: (conversationId: string, userMessageId: string) => boolean
  deleteAgentLoop: (conversationId: string, userMessageId: string) => boolean
  deleteConversation: (id: string) => void
  updateTitle: (id: string, title: string) => void

  // Mount tracking actions
  mountConversation: (id: string) => void
  unmountConversation: (id: string) => void
  isConversationMounted: (id: string) => boolean

  // Agent runtime actions
  runAgent: (
    conversationId: string,
    providerType: LLMProviderType,
    modelName: string,
    maxTokens: number,
    directoryHandle: FileSystemDirectoryHandle | null
  ) => Promise<void>
  cancelAgent: (conversationId: string) => void

  // Runtime state actions
  setConversationStatus: (id: string, status: ConversationStatus) => void
  appendStreamingContent: (id: string, delta: string) => void
  resetStreamingContent: (id: string) => void
  appendStreamingReasoning: (id: string, delta: string) => void
  resetStreamingReasoning: (id: string) => void
  setReasoningStreaming: (id: string, streaming: boolean) => void
  setCompletedReasoning: (id: string, reasoning: string) => void
  setContentStreaming: (id: string, streaming: boolean) => void
  setCompletedContent: (id: string, content: string) => void
  setCurrentToolCall: (id: string, tc: ToolCall | null) => void
  appendStreamingToolArgs: (id: string, delta: string) => void
  resetStreamingToolArgs: (id: string) => void
  setConversationError: (id: string, error: string | null) => void
  resetConversationState: (id: string) => void

  // Follow-up suggestion actions
  setSuggestedFollowUp: (conversationId: string, suggestion: string) => void
  clearSuggestedFollowUp: (conversationId: string) => void
  getSuggestedFollowUp: (conversationId: string) => string

  // Thread management actions
  createThread: (conversationId: string, messageId: string, title?: string) => void
  mergeThreads: (conversationId: string, sourceThreadId: string, targetThreadId: string) => void
  deleteThread: (conversationId: string, threadId: string) => void
  toggleThreadCollapsed: (conversationId: string, threadId: string) => void
  navigateToNextThread: (conversationId: string) => string | null
  navigateToPreviousThread: (conversationId: string) => string | null
  getActiveThreadId: (conversationId: string) => string | null
  setActiveThread: (conversationId: string, threadId: string) => void
  forkThread: (conversationId: string, messageId: string, title?: string) => void
}

export const useConversationStoreSQLite = create<ConversationState>()(
  immer((set, get) => ({
    conversations: [],
    activeConversationId: null,
    loaded: false,
    agentLoops: new Map(),
    streamingQueues: new Map(),
    suggestedFollowUps: new Map(),
    mountedConversations: new Map(),

    activeConversation: () => {
      const { conversations, activeConversationId } = get()
      if (!activeConversationId) return null
      return conversations.find((c) => c.id === activeConversationId) || null
    },

    getConversationStatus: (id: string) => {
      const { conversations } = get()
      const conv = conversations.find((c) => c.id === id)
      return conv?.status || 'idle'
    },

    isConversationRunning: (id: string) => {
      const status = get().getConversationStatus(id)
      return status !== 'idle' && status !== 'error'
    },

    getRunningConversations: () => {
      const { conversations } = get()
      return conversations
        .filter((c) => c.status !== 'idle' && c.status !== 'error')
        .map((c) => c.id)
    },

    // Mount tracking actions
    mountConversation: (id: string) => {
      set((state) => {
        const next = (state.mountedConversations.get(id) || 0) + 1
        state.mountedConversations.set(id, next)
        const conv = state.conversations.find((c) => c.id === id)
        if (conv) {
          conv.mountRefCount = next
        }
      })
    },

    unmountConversation: (id: string) => {
      set((state) => {
        const current = state.mountedConversations.get(id) || 0
        const next = Math.max(0, current - 1)
        if (next === 0) {
          state.mountedConversations.delete(id)
        } else {
          state.mountedConversations.set(id, next)
        }
        const conv = state.conversations.find((c) => c.id === id)
        if (conv) {
          conv.mountRefCount = next
        }
      })
    },

    isConversationMounted: (id: string) => {
      return (get().mountedConversations.get(id) || 0) > 0
    },

    loadFromDB: async () => {
      try {
        // Initialize SQLite first
        await initSQLiteDB()

        const conversations = await loadConversations()

        // Ensure OPFS sessions exist for all loaded conversations
        const { getSessionManager } = await import('@/opfs/session')
        const manager = await getSessionManager()

        const failedSessions: Array<{ id: string; title: string; error: string }> = []

        for (const conv of conversations) {
          const rootDir = `/conversations/${conv.id}`
          try {
            const existing = manager.getSessionByRoot(rootDir)
            if (!existing) {
              await manager.createSession(rootDir, conv.id, conv.title || DEFAULT_CONVERSATION_NAME)
            } else {
              const targetName = conv.title || DEFAULT_CONVERSATION_NAME
              if (existing.name !== targetName) {
                await manager.updateSessionName(existing.sessionId, targetName)
              }
            }
          } catch (e) {
            const errorMsg = e instanceof Error ? e.message : String(e)
            console.error(`[conversation.store] Failed to ensure session for ${conv.id}:`, e)
            failedSessions.push({
              id: conv.id,
              title: conv.title || DEFAULT_CONVERSATION_NAME,
              error: errorMsg,
            })
          }
        }

        if (failedSessions.length > 0) {
          console.warn(
            `[conversation.store] Failed to create/update ${failedSessions.length} session(s):`,
            failedSessions.map((f) => `"${f.title}" (${f.id}): ${f.error}`).join('; ')
          )
        }

        // Refresh the workspace store for active project scope
        const workspaceStore = useWorkspaceStore.getState()
        await workspaceStore.refreshWorkspaces()

        const workspaceIds = new Set(workspaceStore.workspaces.map((w) => w.id))
        const activeId = conversations.find((conv) => workspaceIds.has(conv.id))?.id || null

        // Switch to active session if exists
        if (activeId) {
          await workspaceStore.switchWorkspace(activeId).catch((e) => {
            console.error('[conversation.store] Failed to switch to active session:', e)
          })
        }

        set((state) => {
          state.conversations = conversations.map((conv) => ({
            ...conv,
            status: 'idle',
            streamingContent: '',
            streamingReasoning: '',
            isReasoningStreaming: false,
            completedReasoning: null,
            isContentStreaming: false,
            completedContent: null,
            currentToolCall: null,
            activeToolCalls: [],
            streamingToolArgs: '',
            streamingToolArgsByCallId: {},
            error: null,
            activeRunId: null,
            runEpoch: 0,
            draftAssistant: null,
            mountRefCount: 0,
          }))
          state.activeConversationId = activeId
          state.loaded = true
          state.suggestedFollowUps.clear()
        })
      } catch (error) {
        console.error('[conversation.store] Failed to load conversations:', error)
        set((state) => {
          state.loaded = true
        })
      }
    },

    createNew: (title?: string) => {
      const conversation = createConversation(title)
      set((state) => {
        state.conversations.unshift(conversation)
        state.activeConversationId = conversation.id
      })
      persistConversation(conversation).catch((error) => {
        console.error('[conversation.store] Failed to persist new conversation:', error)
        toast.error('对话保存失败，刷新页面后可能丢失')
      })

      useWorkspaceStore
        .getState()
        .createWorkspace(conversation.id, `/conversations/${conversation.id}`, title || '新对话')
        .catch((e) => {
          console.error('[conversation.store] Failed to create workspace:', e)
        })

      return conversation
    },

    setActive: async (id) => {
      set((state) => {
        state.activeConversationId = id
      })

      if (id) {
        const workspaceStore = useWorkspaceStore.getState()
        if (workspaceStore.activeWorkspaceId !== id) {
          workspaceStore.switchWorkspace(id).catch((e) => {
            console.error('[conversation.store] Failed to switch session workspace:', e)
          })
        }
      }
    },

    addMessage: (conversationId, message) => {
      set((state) => {
        const conv = state.conversations.find((c) => c.id === conversationId)
        if (conv) {
          conv.messages.push(message)
          conv.updatedAt = Date.now()

          if (message.role === 'user' && conv.titleMode !== 'manual' && message.content) {
            const userMessages = conv.messages.filter((m) => m.role === 'user')
            if (userMessages.length === 1) {
              const newTitle = truncateTitle(message.content)
              conv.title = newTitle
              conv.titleMode = 'auto'
            }
          }
        }
      })
      const conv = get().conversations.find((c) => c.id === conversationId)
      if (conv)
        persistConversation(conv).catch((error) => {
          console.error('[conversation.store] Failed to persist conversation on addMessage:', error)
          toast.error('消息保存失败')
        })
    },

    updateMessages: (conversationId, messages) => {
      set((state) => {
        const conv = state.conversations.find((c) => c.id === conversationId)
        if (conv) {
          const prevUserMessageCount = conv.messages.filter((m) => m.role === 'user').length

          conv.messages = messages
          conv.updatedAt = Date.now()

          const currentUserMessageCount = messages.filter((m) => m.role === 'user').length
          if (
            currentUserMessageCount === 1 &&
            prevUserMessageCount === 0 &&
            conv.titleMode !== 'manual'
          ) {
            const firstUserMessage = messages.find((m) => m.role === 'user')
            if (firstUserMessage?.content) {
              const newTitle = truncateTitle(firstUserMessage.content)
              conv.title = newTitle
              conv.titleMode = 'auto'
            }
          }
        }
      })
      const conv = get().conversations.find((c) => c.id === conversationId)
      if (conv)
        persistConversation(conv).catch((error) => {
          console.error(
            '[conversation.store] Failed to persist conversation on updateMessages:',
            error
          )
          toast.error('消息更新保存失败')
        })
    },

    deleteUserMessage: (conversationId, userMessageId) => {
      const state = get()
      if (state.isConversationRunning(conversationId)) {
        toast.error('请先停止当前运行，再删除消息')
        return false
      }

      let deleted = false
      set((draft) => {
        const conv = draft.conversations.find((c) => c.id === conversationId)
        if (!conv) return
        const idx = conv.messages.findIndex((m) => m.id === userMessageId)
        if (idx < 0 || conv.messages[idx].role !== 'user') return
        conv.messages.splice(idx, 1)
        conv.updatedAt = Date.now()
        updateAutoTitleAfterMessageDelete(conv)
        deleted = true
      })

      if (!deleted) return false
      const conv = get().conversations.find((c) => c.id === conversationId)
      if (conv)
        persistConversation(conv).catch((error) => {
          console.error(
            '[conversation.store] Failed to persist conversation on deleteUserMessage:',
            error
          )
          toast.error('删除消息失败')
        })
      return true
    },

    deleteAgentLoop: (conversationId, userMessageId) => {
      const state = get()
      if (state.isConversationRunning(conversationId)) {
        toast.error('请先停止当前运行，再删除对话轮次')
        return false
      }

      let deleted = false
      set((draft) => {
        const conv = draft.conversations.find((c) => c.id === conversationId)
        if (!conv) return
        const startIdx = conv.messages.findIndex((m) => m.id === userMessageId)
        if (startIdx < 0 || conv.messages[startIdx].role !== 'user') return
        const targetThreadId = conv.messages[startIdx].threadId || 'main'

        const idsToDelete = new Set<string>()
        idsToDelete.add(conv.messages[startIdx].id)
        for (let i = startIdx + 1; i < conv.messages.length; i++) {
          const msg = conv.messages[i]
          const msgThreadId = msg.threadId || 'main'
          if (msgThreadId !== targetThreadId) continue
          if (msg.role === 'user') break
          idsToDelete.add(msg.id)
        }

        conv.messages = conv.messages.filter((msg) => !idsToDelete.has(msg.id))
        conv.updatedAt = Date.now()
        updateAutoTitleAfterMessageDelete(conv)
        deleted = true
      })

      if (!deleted) return false
      const conv = get().conversations.find((c) => c.id === conversationId)
      if (conv)
        persistConversation(conv).catch((error) => {
          console.error(
            '[conversation.store] Failed to persist conversation on deleteAgentLoop:',
            error
          )
          toast.error('删除对话轮次失败')
        })
      return true
    },

    deleteConversation: (id) => {
      const queues = get().streamingQueues.get(id)
      if (queues) {
        queues.reasoning.destroy()
        queues.content.destroy()
      }

      set((state) => {
        const agentLoop = state.agentLoops.get(id)
        if (agentLoop) {
          agentLoop.cancel()
          state.agentLoops.delete(id)
        }
        state.conversations = state.conversations.filter((c) => c.id !== id)
        if (state.activeConversationId === id) {
          state.activeConversationId = null
        }
        state.suggestedFollowUps.delete(id)
        state.streamingQueues.delete(id)
        state.mountedConversations.delete(id)
      })
      deleteConversationFromDB(id).catch((error) => {
        console.error('[conversation.store] Failed to delete conversation from DB:', error)
        toast.error('对话删除失败，请刷新页面后重试')
      })

      useWorkspaceStore
        .getState()
        .deleteWorkspace(id)
        .catch((e) => {
          console.error('[conversation.store] Failed to delete workspace:', e)
        })
    },

    updateTitle: (id, title) => {
      set((state) => {
        const conv = state.conversations.find((c) => c.id === id)
        if (conv) {
          conv.title = title
          conv.titleMode = 'manual'
          conv.updatedAt = Date.now()
        }
      })
      const conv = get().conversations.find((c) => c.id === id)
      if (conv)
        persistConversation(conv).catch((error) => {
          console.error(
            '[conversation.store] Failed to persist conversation on updateTitle:',
            error
          )
          toast.error('标题修改保存失败')
        })
    },

    // Agent runtime actions
    runAgent: async (
      conversationId: string,
      providerType: LLMProviderType,
      modelName: string,
      maxTokens: number,
      directoryHandle: FileSystemDirectoryHandle | null
    ) => {
      const state = get()
      const conv = state.conversations.find((c) => c.id === conversationId)
      if (!conv) return

      if (state.isConversationRunning(conversationId)) {
        console.warn('[conversation.store] Conversation is already running:', conversationId)
        return
      }

      try {
        const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
        let runEpoch = 0
        let latestMessages: Message[] = conv.messages
        const compressionSummaryMessages: Message[] = []
        let committed = false

        // Acquire run lock immediately to prevent concurrent duplicate starts.
        set((state) => {
          const c = state.conversations.find((x) => x.id === conversationId)
          if (!c) return
          c.runEpoch = (c.runEpoch || 0) + 1
          runEpoch = c.runEpoch
          c.activeRunId = runId
          c.status = 'pending'
          c.error = null
          c.currentToolCall = null
          c.activeToolCalls = []
          c.streamingToolArgs = ''
          c.streamingToolArgsByCallId = {}
          c.streamingContent = ''
          c.streamingReasoning = ''
          c.completedContent = null
          c.completedReasoning = null
          c.isContentStreaming = false
          c.isReasoningStreaming = false
          c.draftAssistant = {
            reasoning: '',
            content: '',
            toolCalls: [],
            toolResults: {},
            toolCall: null,
            toolArgs: '',
            steps: [],
            activeReasoningStepId: null,
            activeContentStepId: null,
            activeToolStepId: null,
            activeCompressionStepId: null,
          }
        })

        const isCurrentRun = () => {
          const current = get().conversations.find((c) => c.id === conversationId)
          return !!current && current.activeRunId === runId && (current.runEpoch || 0) === runEpoch
        }

        const failRunEarly = (message: string) => {
          if (!isCurrentRun()) return
          set((state) => {
            const c = state.conversations.find((x) => x.id === conversationId)
            if (!c || c.activeRunId !== runId) return
            c.status = 'error'
            c.error = message
            c.activeRunId = null
            c.draftAssistant = null
            c.currentToolCall = null
            c.activeToolCalls = []
            c.streamingToolArgs = ''
            c.streamingToolArgsByCallId = {}
            c.streamingContent = ''
            c.streamingReasoning = ''
          })
        }

        const apiKeyRepo = getApiKeyRepository()
        const settingsState = useSettingsStore.getState()
        const effectiveConfig = settingsState.getEffectiveProviderConfig()
        const providerConfig =
          providerType === 'custom'
            ? effectiveConfig
            : {
                apiKeyProviderKey: providerType,
                baseUrl: LLM_PROVIDER_CONFIGS[providerType].baseURL,
                modelName: modelName || LLM_PROVIDER_CONFIGS[providerType].modelName,
              }

        if (!providerConfig?.baseUrl || !providerConfig.modelName) {
          failRunEarly('请先配置自定义服务商和模型')
          return
        }

        const apiKey = await apiKeyRepo.load(providerConfig.apiKeyProviderKey)
        if (!apiKey) {
          failRunEarly('API Key 未设置，请先在设置中配置')
          return
        }

        const provider = createLLMProvider({
          apiKey,
          providerType,
          baseUrl: providerConfig.baseUrl,
          model: providerConfig.modelName,
        })

        const contextManager = new ContextManager({
          maxContextTokens: provider.maxContextTokens,
          reserveTokens: maxTokens,
          enableSummarization: true,
          maxMessageGroups: provider.maxContextTokens >= 200000 ? 80 : 50,
        })

        const toolRegistry = getToolRegistry()
        const toolPolicyHooks = createToolPolicyHooks()

        const agentLoop = new AgentLoop({
          provider,
          toolRegistry,
          contextManager,
          toolContext: { directoryHandle },
          maxIterations: 20,
          beforeToolCall: toolPolicyHooks.beforeToolCall,
          onLoopComplete: async () => {
            // Refresh pending changes after each agent loop completes
            const { useWorkspaceStore } = await import('@/store/workspace.store')
            await useWorkspaceStore.getState().refreshPendingChanges()
          },
        })

        set((state) => {
          state.agentLoops.set(conversationId, agentLoop)
        })

        const currentMessages = conv.messages

        const finalizeRun = async (
          status: ConversationStatus,
          finalMessages?: Message[],
          error?: string
        ) => {
          if (committed || !isCurrentRun()) return
          committed = true
          const targetMessages = finalMessages || latestMessages

          set((inner) => {
            const c = inner.conversations.find((x) => x.id === conversationId)
            if (!c) return
            if (status === 'idle') {
              c.messages = targetMessages
            }
            c.status = status
            c.error = error || null
            c.currentToolCall = null
            c.activeToolCalls = []
            c.streamingToolArgs = ''
            c.streamingToolArgsByCallId = {}
            c.streamingContent = ''
            c.streamingReasoning = ''
            c.completedContent = null
            c.completedReasoning = null
            c.isContentStreaming = false
            c.isReasoningStreaming = false
            c.draftAssistant = null
            c.activeRunId = null
            inner.agentLoops.delete(conversationId)
            inner.streamingQueues.delete(conversationId)
          })

          if (status === 'idle') {
            emitComplete()
            const finalConv = get().conversations.find((c) => c.id === conversationId)
            if (finalConv)
              persistConversation(finalConv).catch((err) => {
                console.error(
                  '[conversation.store] Failed to persist conversation on complete:',
                  err
                )
                toast.error('对话保存失败，部分内容可能丢失')
              })

            try {
              const { useWorkspaceStore } = await import('@/store/workspace.store')
              await useWorkspaceStore.getState().refreshPendingChanges(true)
            } catch (err) {
              console.warn('[conversation.store] Failed to refresh pending changes on complete:', err)
            }

            if (ENABLE_FOLLOW_UP_LLM) {
              try {
                const apiKey = await apiKeyRepo.load(providerConfig.apiKeyProviderKey)
                if (apiKey) {
                  const suggestion = await generateFollowUp(targetMessages, providerType, apiKey)
                  if (suggestion) {
                    get().setSuggestedFollowUp(conversationId, suggestion)
                  }
                }
              } catch (err) {
                console.error('[conversation.store] Failed to generate follow-up:', err)
              }
            } else {
              get().clearSuggestedFollowUp(conversationId)
            }
          }
        }

        // Reasoning streaming queue
        let fullReasoningAccumulator = ''
        const reasoningQueue = new StreamingQueue((_key: string, accumulated: string) => {
          fullReasoningAccumulator += accumulated
          set((state) => {
            const c = state.conversations.find((c) => c.id === conversationId)
            if (c && c.activeRunId === runId) {
              c.streamingReasoning = fullReasoningAccumulator
              if (c.draftAssistant) {
                c.draftAssistant.reasoning = fullReasoningAccumulator
                const stepId = c.draftAssistant.activeReasoningStepId
                if (stepId) {
                  const step = c.draftAssistant.steps.find((s) => s.id === stepId)
                  if (step && step.type === 'reasoning') {
                    step.content = fullReasoningAccumulator
                  }
                }
              }
            }
          })
        })

        // Content streaming queue
        // Note: The accumulated value from queue is per-frame, but we maintain
        // the full accumulated content in store.state.streamingContent separately
        let fullContentAccumulator = ''
        const contentQueue = new StreamingQueue((_key: string, accumulated: string) => {
          fullContentAccumulator += accumulated
          set((state) => {
            const c = state.conversations.find((c) => c.id === conversationId)
            if (c && c.activeRunId === runId) {
              c.streamingContent = fullContentAccumulator
              if (c.draftAssistant) {
                c.draftAssistant.content = fullContentAccumulator
                const stepId = c.draftAssistant.activeContentStepId
                if (stepId) {
                  const step = c.draftAssistant.steps.find((s) => s.id === stepId)
                  if (step && step.type === 'content') {
                    step.content = fullContentAccumulator
                  }
                }
              }
            }
          })
        })

        set((state) => {
          state.streamingQueues.set(conversationId, {
            reasoning: reasoningQueue,
            content: contentQueue,
          })
        })

        const cleanupQueues = () => {
          reasoningQueue.destroy()
          contentQueue.destroy()
          set((state) => {
            state.streamingQueues.delete(conversationId)
          })
        }

        const resultMessages = await agentLoop.run(currentMessages, {
          onMessageStart: () => {
            if (!isCurrentRun()) return
            // Reset accumulators for new message
            fullContentAccumulator = ''
            fullReasoningAccumulator = ''
            set((state) => {
              const c = state.conversations.find((c) => c.id === conversationId)
              if (c && c.activeRunId === runId) {
                c.streamingContent = ''
                c.streamingReasoning = ''
                c.isReasoningStreaming = false
                c.completedReasoning = ''
                c.isContentStreaming = false
                c.completedContent = ''
                c.draftAssistant = {
                  reasoning: '',
                  content: '',
                  toolCalls: [],
                  toolResults: {},
                  toolCall: null,
                  toolArgs: '',
                  // Keep streaming timeline across assistant restarts in one run.
                  steps: c.draftAssistant?.steps || [],
                  activeReasoningStepId: null,
                  activeContentStepId: null,
                  activeToolStepId: null,
                  activeCompressionStepId: c.draftAssistant?.activeCompressionStepId || null,
                }
              }
            })
          },
          onReasoningStart: () => {
            if (!isCurrentRun()) return
            set((state) => {
              const c = state.conversations.find((c) => c.id === conversationId)
              if (c && c.activeRunId === runId) {
                c.status = 'streaming'
                c.isReasoningStreaming = true
                if (c.draftAssistant) {
                  const last = c.draftAssistant.steps[c.draftAssistant.steps.length - 1]
                  if (last && last.type === 'reasoning') {
                    last.streaming = true
                    c.draftAssistant.activeReasoningStepId = last.id
                  } else {
                    const stepId = `reasoning-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
                    c.draftAssistant.steps.push({
                      id: stepId,
                      type: 'reasoning',
                      content: '',
                      streaming: true,
                    })
                    c.draftAssistant.activeReasoningStepId = stepId
                  }
                }
              }
            })
            emitThinkingStart()
          },
          onReasoningDelta: (delta: string) => {
            if (!isCurrentRun()) return
            reasoningQueue.add('reasoning', delta)
            emitThinkingDelta(delta)
          },
          onReasoningComplete: (reasoning: string) => {
            if (!isCurrentRun()) return
            reasoningQueue.flushNow()
            set((state) => {
              const c = state.conversations.find((c) => c.id === conversationId)
              if (c && c.activeRunId === runId) {
                c.isReasoningStreaming = false
                c.completedReasoning = reasoning
                c.streamingReasoning = ''
                if (c.draftAssistant) {
                  c.draftAssistant.reasoning = reasoning
                  const stepId = c.draftAssistant.activeReasoningStepId
                  if (stepId) {
                    const step = c.draftAssistant.steps.find((s) => s.id === stepId)
                    if (step && step.type === 'reasoning') {
                      step.content = reasoning
                      step.streaming = false
                    }
                  }
                  c.draftAssistant.activeReasoningStepId = null
                }
              }
            })
          },
          onContentStart: () => {
            if (!isCurrentRun()) return
            set((state) => {
              const c = state.conversations.find((c) => c.id === conversationId)
              if (c && c.activeRunId === runId) {
                c.status = 'streaming'
                c.isContentStreaming = true
                if (c.draftAssistant) {
                  const last = c.draftAssistant.steps[c.draftAssistant.steps.length - 1]
                  if (last && last.type === 'content') {
                    last.streaming = true
                    c.draftAssistant.activeContentStepId = last.id
                  } else {
                    const stepId = `content-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
                    c.draftAssistant.steps.push({
                      id: stepId,
                      type: 'content',
                      content: '',
                      streaming: true,
                    })
                    c.draftAssistant.activeContentStepId = stepId
                  }
                }
              }
            })
          },
          onContentDelta: (delta: string) => {
            if (!isCurrentRun()) return
            contentQueue.add('content', delta)
          },
          onContentComplete: (content: string) => {
            if (!isCurrentRun()) return
            contentQueue.flushNow()
            set((state) => {
              const c = state.conversations.find((c) => c.id === conversationId)
              if (c && c.activeRunId === runId) {
                c.isContentStreaming = false
                c.completedContent = content
                c.streamingContent = ''
                if (c.draftAssistant) {
                  c.draftAssistant.content = content
                  const stepId = c.draftAssistant.activeContentStepId
                  if (stepId) {
                    const step = c.draftAssistant.steps.find((s) => s.id === stepId)
                    if (step && step.type === 'content') {
                      step.content = content
                      step.streaming = false
                    }
                  }
                  c.draftAssistant.activeContentStepId = null
                }
              }
            })
          },
          onToolCallStart: (tc: ToolCall) => {
            if (!isCurrentRun()) return
            set((state) => {
              const c = state.conversations.find((c) => c.id === conversationId)
              if (c && c.activeRunId === runId) {
                c.status = 'tool_calling'
                const isSameTool = c.currentToolCall?.id === tc.id
                c.currentToolCall = tc
                c.activeToolCalls = c.activeToolCalls || []
                if (!c.activeToolCalls.some((x) => x.id === tc.id)) {
                  c.activeToolCalls.push(tc)
                }
                c.streamingToolArgsByCallId = c.streamingToolArgsByCallId || {}
                if (!c.streamingToolArgsByCallId[tc.id]) {
                  c.streamingToolArgsByCallId[tc.id] = ''
                }
                if (c.draftAssistant) {
                  c.draftAssistant.toolCall = tc
                  if (!c.draftAssistant.toolCalls.some((x) => x.id === tc.id)) {
                    c.draftAssistant.toolCalls.push(tc)
                  }
                  const stepId = `tool-${tc.id}`
                  const existing = c.draftAssistant.steps.find((s) => s.id === stepId)
                  if (existing && existing.type === 'tool_call') {
                    existing.streaming = true
                    existing.toolCall = tc
                  } else {
                    c.draftAssistant.steps.push({
                      id: stepId,
                      type: 'tool_call',
                      toolCall: tc,
                      args: '',
                      streaming: true,
                    })
                  }
                  c.draftAssistant.activeToolStepId = stepId
                }
                // Keep already streamed args when the same tool transitions
                // from "stream preview" to actual execution.
                if (!isSameTool) {
                  c.streamingToolArgs = ''
                  if (c.draftAssistant) {
                    c.draftAssistant.toolArgs = ''
                  }
                }
              }
            })
            emitToolStart({
              name: tc.function.name,
              args: tc.function.arguments,
              id: tc.id,
            })
          },
          onToolCallDelta: (_index: number, argsDelta: string, toolCallId?: string) => {
            if (!isCurrentRun()) return
            set((state) => {
              const c = state.conversations.find((c) => c.id === conversationId)
              if (c && c.activeRunId === runId) {
                if (c.draftAssistant) {
                  const isCurrentToolDelta = !toolCallId || c.currentToolCall?.id === toolCallId
                  if (isCurrentToolDelta) {
                    c.streamingToolArgs += argsDelta
                    c.draftAssistant.toolArgs += argsDelta
                  }
                  if (toolCallId) {
                    c.streamingToolArgsByCallId = c.streamingToolArgsByCallId || {}
                    c.streamingToolArgsByCallId[toolCallId] =
                      (c.streamingToolArgsByCallId[toolCallId] || '') + argsDelta
                  }

                  const stepId = toolCallId ? `tool-${toolCallId}` : c.draftAssistant.activeToolStepId
                  if (stepId) {
                    const step = c.draftAssistant.steps.find((s) => s.id === stepId)
                    if (step && step.type === 'tool_call') {
                      step.args += argsDelta
                    }
                  }
                }
              }
            })
          },
          onToolCallComplete: (tc: ToolCall, _result: string) => {
            if (!isCurrentRun()) return
            set((state) => {
              const c = state.conversations.find((c) => c.id === conversationId)
              if (c && c.activeRunId === runId) {
                const completedStepId = `tool-${tc.id}`
                const isCurrentTool = c.currentToolCall?.id === tc.id

                if (isCurrentTool) {
                  c.currentToolCall = null
                  c.streamingToolArgs = ''
                }
                c.activeToolCalls = (c.activeToolCalls || []).filter((x) => x.id !== tc.id)
                if ((c.activeToolCalls || []).length > 0) {
                  c.currentToolCall = c.activeToolCalls[c.activeToolCalls.length - 1]
                  c.streamingToolArgs = (c.streamingToolArgsByCallId || {})[c.currentToolCall.id] || ''
                }
                c.streamingToolArgsByCallId = c.streamingToolArgsByCallId || {}

                if (c.draftAssistant) {
                  c.draftAssistant.toolResults[tc.id] = _result || ''

                  const completedStep = c.draftAssistant.steps.find((s) => s.id === completedStepId)
                  if (completedStep && completedStep.type === 'tool_call') {
                    completedStep.result = _result || ''
                    completedStep.streaming = false
                  }

                  if (isCurrentTool) {
                    c.draftAssistant.toolCall = null
                    c.draftAssistant.toolArgs = ''
                    if (c.draftAssistant.activeToolStepId === completedStepId) {
                      c.draftAssistant.activeToolStepId = null
                    }
                    if (c.currentToolCall) {
                      c.draftAssistant.toolCall = c.currentToolCall
                      c.draftAssistant.toolArgs = (c.streamingToolArgsByCallId || {})[c.currentToolCall.id] || ''
                      c.draftAssistant.activeToolStepId = `tool-${c.currentToolCall.id}`
                    }
                  }
                }

                delete c.streamingToolArgsByCallId[tc.id]
              }
            })
          },
          onContextCompressionStart: (payload) => {
            if (!isCurrentRun()) return
            emitCompressionEvent({
              phase: 'start',
              droppedGroups: payload.droppedGroups,
              droppedContentChars: payload.droppedContentChars,
            })
            set((state) => {
              const c = state.conversations.find((x) => x.id === conversationId)
              if (!c || c.activeRunId !== runId || !c.draftAssistant) return
              const stepId = `compression-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
              c.draftAssistant.steps.push({
                id: stepId,
                type: 'compression',
                content: '正在压缩历史上下文...',
                streaming: true,
              })
              c.draftAssistant.activeCompressionStepId = stepId
            })
          },
          onContextCompressionComplete: (payload) => {
            if (!isCurrentRun()) return
            emitCompressionEvent({
              phase: 'complete',
              mode: payload.mode,
              droppedGroups: payload.droppedGroups,
              droppedContentChars: payload.droppedContentChars,
              summaryChars: payload.summaryChars,
              latencyMs: payload.latencyMs,
            })
            set((state) => {
              const c = state.conversations.find((x) => x.id === conversationId)
              if (!c || c.activeRunId !== runId || !c.draftAssistant) return
              const stepId = c.draftAssistant.activeCompressionStepId
              if (stepId) {
                const step = c.draftAssistant.steps.find((s) => s.id === stepId)
                if (step && step.type === 'compression') {
                  step.content =
                    payload.mode === 'skip'
                      ? '上下文压缩评估完成（跳过摘要）'
                      : '上下文已压缩并生成摘要'
                  step.streaming = false
                }
              }
              c.draftAssistant.activeCompressionStepId = null
            })
            if (payload.summary) {
              compressionSummaryMessages.push(
                createAssistantMessage(
                  payload.summary,
                  undefined,
                  undefined,
                  null,
                  'context_summary'
                )
              )
            }
          },
          // SEP-1306: Handle binary elicitation for file uploads
          onElicitation: async (elicitation: any) => {
            if (!isCurrentRun()) return
            console.log('[conversation.store] SEP-1306 elicitation:', elicitation)

            try {
              // Get the server config for auth token
              const mcpManager = (await import('@/mcp/mcp-manager')).getMCPManager()
              await mcpManager.initialize()
              const server = mcpManager.getServer(elicitation.serverId)

              if (!server) {
                throw new Error(`MCP server not found: ${elicitation.serverId}`)
              }

              const authToken = server?.token

              // Show file picker and upload via ElicitationHandler
              // The elicitation object contains full BinaryElicitation data from the server
              const handler = getElicitationHandler()
              const metadata = await handler.handleBinaryElicitation(
                {
                  mode: elicitation.mode,
                  message: elicitation.message,
                  requestedSchema: elicitation.requestedSchema || {
                    type: 'object',
                    properties: {},
                  },
                  uploadEndpoints: elicitation.uploadEndpoints || {},
                },
                {
                  // Pass tool args for OPFS file lookup (priority)
                  toolArgs: elicitation.args,
                  // Pass directory handle for OPFS access
                  directoryHandle,
                },
                authToken
              )

              // Add tool result message with the file metadata
              // This completes the pending tool call with the upload result
              // IMPORTANT: Tell the LLM to retry with the new download_url using natural language
              const { createToolMessage } = await import('@/agent/message-types')

              // Get the file field name from uploadEndpoints (dynamic, not hardcoded)
              const uploadEndpoints = elicitation.uploadEndpoints || {}
              const fileFieldName = Object.keys(uploadEndpoints)[0] || 'file'

              // Extract original args excluding the file field (we'll replace it)
              const originalArgs = { ...(elicitation.args || {}) }
              delete originalArgs[fileFieldName]

              // Build natural language instruction for LLM to retry
              let retryInstruction = `文件已上传成功。请重新调用 ${elicitation.toolName} 工具，使用以下参数：\n\n`
              retryInstruction += `{\n`
              retryInstruction += `  "${fileFieldName}": {\n`
              retryInstruction += `    "download_url": "${metadata.download_url}",\n`
              retryInstruction += `    "file_id": "${metadata.file_id}"\n`
              retryInstruction += `  }`

              // Add other original args (like question)
              for (const [key, value] of Object.entries(originalArgs)) {
                retryInstruction += `,\n  "${key}": ${JSON.stringify(value)}`
              }
              retryInstruction += `\n}`

              const toolResultMsg = createToolMessage({
                toolCallId: elicitation.toolCallId || 'unknown',
                name: elicitation.toolName,
                content: retryInstruction,
              })

              get().addMessage(conversationId, toolResultMsg)

              // Resume agent loop with the tool result
              // First, manually clean up the previous agentLoop state
              set((state) => {
                const c = state.conversations.find((c) => c.id === conversationId)
                if (c) {
                  c.status = 'idle'
                  c.error = null
                  c.activeRunId = null
                  c.draftAssistant = null
                }
                state.agentLoops.delete(conversationId)
              })

              // Now start a new agent loop with the updated messages
              await get().runAgent(
                conversationId,
                providerType,
                modelName,
                maxTokens,
                directoryHandle
              )
            } catch (error) {
              console.error('[conversation.store] Elicitation failed:', error)
              const errorMsg = error instanceof Error ? error.message : String(error)

              // Add tool result with error
              const { createToolMessage } = await import('@/agent/message-types')
              const errorResultMsg = createToolMessage({
                toolCallId: elicitation.toolCallId || 'unknown',
                name: elicitation.toolName,
                content: JSON.stringify({
                  error: `文件上传失败: ${errorMsg}`,
                }),
              })
              get().addMessage(conversationId, errorResultMsg)

              set((state) => {
                const c = state.conversations.find((c) => c.id === conversationId)
                if (c) {
                  c.status = 'error'
                  c.error = errorMsg
                }
                state.agentLoops.delete(conversationId)
              })
              emitError(errorMsg)
            }
          },
          onMessagesUpdated: (msgs: Message[]) => {
            if (!isCurrentRun()) return
            latestMessages = msgs
          },
          onComplete: async (msgs: Message[]) => {
            if (!isCurrentRun()) return
            latestMessages = [...msgs, ...compressionSummaryMessages]
            reasoningQueue.flushNow()
            contentQueue.flushNow()
            cleanupQueues()
            await finalizeRun('idle', latestMessages)
          },
          onError: (err: Error) => {
            if (!isCurrentRun()) return
            reasoningQueue.flushNow()
            contentQueue.flushNow()
            cleanupQueues()
            set((inner) => {
              const c = inner.conversations.find((x) => x.id === conversationId)
              if (c && c.activeRunId === runId) {
                c.status = 'error'
                c.error = err.message
                c.activeRunId = null
                c.draftAssistant = null
              }
              inner.agentLoops.delete(conversationId)
              inner.streamingQueues.delete(conversationId)
            })
            emitError(err.message)
          },
        })
        latestMessages = [...resultMessages, ...compressionSummaryMessages]
        await finalizeRun('idle', latestMessages)
      } catch (error) {
        const queues = get().streamingQueues.get(conversationId)
        if (queues) {
          queues.reasoning.destroy()
          queues.content.destroy()
          set((state) => {
            state.streamingQueues.delete(conversationId)
          })
        }

        if (error instanceof Error && error.name === 'AbortError') {
          set((state) => {
            const c = state.conversations.find((c) => c.id === conversationId)
            if (c) {
              c.status = 'idle'
              c.activeRunId = null
              c.draftAssistant = null
            }
            state.agentLoops.delete(conversationId)
            state.streamingQueues.delete(conversationId)
          })
          return
        }
        set((state) => {
          const c = state.conversations.find((c) => c.id === conversationId)
          if (c) {
            c.status = 'error'
            c.error = error instanceof Error ? error.message : String(error)
            c.activeRunId = null
            c.draftAssistant = null
          }
          state.agentLoops.delete(conversationId)
          state.streamingQueues.delete(conversationId)
        })
      }
    },

    cancelAgent: (conversationId: string) => {
      const agentLoop = get().agentLoops.get(conversationId)
      if (agentLoop) {
        agentLoop.cancel()
        const queues = get().streamingQueues.get(conversationId)
        if (queues) {
          queues.reasoning.destroy()
          queues.content.destroy()
        }
        set((state) => {
          state.agentLoops.delete(conversationId)
          state.streamingQueues.delete(conversationId)
          const c = state.conversations.find((c) => c.id === conversationId)
          if (c) {
            c.status = 'idle'
            c.activeRunId = null
            c.draftAssistant = null
            c.currentToolCall = null
            c.activeToolCalls = []
            c.streamingToolArgs = ''
            c.streamingToolArgsByCallId = {}
            c.streamingContent = ''
            c.streamingReasoning = ''
            c.isContentStreaming = false
            c.isReasoningStreaming = false
          }
        })
      }
    },

    // Runtime state actions
    setConversationStatus: (id: string, status: ConversationStatus) => {
      set((state) => {
        const c = state.conversations.find((c) => c.id === id)
        if (c) c.status = status
      })
    },

    appendStreamingContent: (id: string, delta: string) => {
      set((state) => {
        const c = state.conversations.find((c) => c.id === id)
        if (c) c.streamingContent += delta
      })
    },

    resetStreamingContent: (id: string) => {
      set((state) => {
        const c = state.conversations.find((c) => c.id === id)
        if (c) c.streamingContent = ''
      })
    },

    appendStreamingReasoning: (id: string, delta: string) => {
      set((state) => {
        const c = state.conversations.find((c) => c.id === id)
        if (c) c.streamingReasoning += delta
      })
    },

    resetStreamingReasoning: (id: string) => {
      set((state) => {
        const c = state.conversations.find((c) => c.id === id)
        if (c) c.streamingReasoning = ''
      })
    },

    setReasoningStreaming: (id: string, streaming: boolean) => {
      set((state) => {
        const c = state.conversations.find((c) => c.id === id)
        if (c) c.isReasoningStreaming = streaming
      })
    },

    setCompletedReasoning: (id: string, reasoning: string) => {
      set((state) => {
        const c = state.conversations.find((c) => c.id === id)
        if (c) c.completedReasoning = reasoning
      })
    },

    setContentStreaming: (id: string, streaming: boolean) => {
      set((state) => {
        const c = state.conversations.find((c) => c.id === id)
        if (c) c.isContentStreaming = streaming
      })
    },

    setCompletedContent: (id: string, content: string) => {
      set((state) => {
        const c = state.conversations.find((c) => c.id === id)
        if (c) c.completedContent = content
      })
    },

    setCurrentToolCall: (id: string, tc: ToolCall | null) => {
      set((state) => {
        const c = state.conversations.find((c) => c.id === id)
        if (c) {
          c.currentToolCall = tc
          c.activeToolCalls = c.activeToolCalls || []
          if (tc && !c.activeToolCalls.some((x) => x.id === tc.id)) {
            c.activeToolCalls.push(tc)
          }
        }
      })
    },

    appendStreamingToolArgs: (id: string, delta: string) => {
      set((state) => {
        const c = state.conversations.find((c) => c.id === id)
        if (c) c.streamingToolArgs += delta
      })
    },

    resetStreamingToolArgs: (id: string) => {
      set((state) => {
        const c = state.conversations.find((c) => c.id === id)
        if (c) {
          c.streamingToolArgs = ''
          c.streamingToolArgsByCallId = {}
        }
      })
    },

    setConversationError: (id: string, error: string | null) => {
      set((state) => {
        const c = state.conversations.find((c) => c.id === id)
        if (c) {
          c.error = error
          c.status = error ? 'error' : 'idle'
        }
      })
    },

    resetConversationState: (id: string) => {
      set((state) => {
        const c = state.conversations.find((c) => c.id === id)
        if (c) {
          c.status = 'idle'
          c.streamingContent = ''
          c.streamingReasoning = ''
          c.isReasoningStreaming = false
          c.completedReasoning = null
          c.isContentStreaming = false
          c.completedContent = null
          c.currentToolCall = null
          c.activeToolCalls = []
          c.streamingToolArgs = ''
          c.streamingToolArgsByCallId = {}
          c.error = null
          c.activeRunId = null
          c.draftAssistant = null
        }
      })
    },

    // Follow-up suggestion actions
    setSuggestedFollowUp: (conversationId: string, suggestion: string) => {
      set((state) => {
        state.suggestedFollowUps.set(conversationId, suggestion)
      })
    },

    clearSuggestedFollowUp: (conversationId: string) => {
      set((state) => {
        state.suggestedFollowUps.delete(conversationId)
      })
    },

    getSuggestedFollowUp: (conversationId: string) => {
      return get().suggestedFollowUps.get(conversationId) || ''
    },

    // Thread management actions
    createThread: (conversationId: string, messageId: string, title?: string) => {
      const conv = get().conversations.find((c) => c.id === conversationId)
      if (!conv) return

      const message = conv.messages.find((m) => m.id === messageId)
      if (!message) return

      const thread = createThreadUtil(message, title)
      const threadId = thread.id

      set((state) => {
        const c = state.conversations.find((c) => c.id === conversationId)
        if (!c) return

        // Update message with thread ID
        const msgIndex = c.messages.findIndex((m) => m.id === messageId)
        if (msgIndex !== -1) {
          c.messages[msgIndex] = { ...c.messages[msgIndex], threadId }
        }

        c.updatedAt = Date.now()
      })

      const updatedConv = get().conversations.find((c) => c.id === conversationId)
      if (updatedConv) {
        persistConversation(updatedConv).catch((error) => {
          console.error('[conversation.store] Failed to persist thread creation:', error)
          toast.error('线程创建失败')
        })
      }
    },

    mergeThreads: (conversationId: string, sourceThreadId: string, targetThreadId: string) => {
      const conv = get().conversations.find((c) => c.id === conversationId)
      if (!conv) return

      const updatedMessages = mergeThreadsUtil(conv.messages, sourceThreadId, targetThreadId)

      set((state) => {
        const c = state.conversations.find((c) => c.id === conversationId)
        if (!c) return

        c.messages = updatedMessages
        c.updatedAt = Date.now()
      })

      const updatedConv = get().conversations.find((c) => c.id === conversationId)
      if (updatedConv) {
        persistConversation(updatedConv).catch((error) => {
          console.error('[conversation.store] Failed to persist thread merge:', error)
          toast.error('线程合并失败')
        })
      }
    },

    deleteThread: (conversationId: string, threadId: string) => {
      const conv = get().conversations.find((c) => c.id === conversationId)
      if (!conv) return

      const updatedMessages = deleteThreadUtil(conv.messages, threadId)

      set((state) => {
        const c = state.conversations.find((c) => c.id === conversationId)
        if (!c) return

        c.messages = updatedMessages
        c.updatedAt = Date.now()
      })

      const updatedConv = get().conversations.find((c) => c.id === conversationId)
      if (updatedConv) {
        persistConversation(updatedConv).catch((error) => {
          console.error('[conversation.store] Failed to persist thread deletion:', error)
          toast.error('线程删除失败')
        })
      }
    },

    toggleThreadCollapsed: (conversationId: string, threadId: string) => {
      set((state) => {
        const c = state.conversations.find((c) => c.id === conversationId)
        if (!c) return

        // Find first message in thread and toggle a metadata flag
        const msgIndex = c.messages.findIndex((m) => m.threadId === threadId)
        if (msgIndex !== -1) {
          // Use message metadata to store collapsed state
          const isCollapsed = !!(c.messages[msgIndex] as any)._collapsed
          ;(c.messages[msgIndex] as any)._collapsed = !isCollapsed
        }
      })
    },

    navigateToNextThread: (conversationId: string) => {
      const conv = get().conversations.find((c) => c.id === conversationId)
      if (!conv) return null

      const activeThreadId = get().getActiveThreadId(conversationId)
      const nextThreadId = getNextThread(conv.messages, activeThreadId || undefined)
      return nextThreadId
    },

    navigateToPreviousThread: (conversationId: string) => {
      const conv = get().conversations.find((c) => c.id === conversationId)
      if (!conv) return null

      const activeThreadId = get().getActiveThreadId(conversationId)
      const prevThreadId = getPreviousThread(conv.messages, activeThreadId || undefined)
      return prevThreadId
    },

    getActiveThreadId: (conversationId: string) => {
      const conv = get().conversations.find((c) => c.id === conversationId)
      if (!conv) return null

      // Get active thread from conversation metadata
      return (conv as any)._activeThreadId || null
    },

    setActiveThread: (conversationId: string, threadId: string) => {
      set((state) => {
        const c = state.conversations.find((c) => c.id === conversationId)
        if (!c) return
        ;(c as any)._activeThreadId = threadId
      })
    },

    forkThread: (conversationId: string, messageId: string, title?: string) => {
      const conv = get().conversations.find((c) => c.id === conversationId)
      if (!conv) return

      try {
        const { messages: updatedMessages, newThreadId } = forkThreadUtil(
          conv.messages,
          messageId,
          title
        )

        set((state) => {
          const c = state.conversations.find((c) => c.id === conversationId)
          if (!c) return

          c.messages = updatedMessages
          c.updatedAt = Date.now()
          ;(c as any)._activeThreadId = newThreadId
        })

        const updatedConv = get().conversations.find((c) => c.id === conversationId)
        if (updatedConv) {
          persistConversation(updatedConv).catch((error) => {
            console.error('[conversation.store] Failed to persist thread fork:', error)
            toast.error('线程分支创建失败')
          })
        }

        toast.success('线程分支创建成功')
      } catch (error) {
        console.error('[conversation.store] Failed to fork thread:', error)
        toast.error('线程分支创建失败')
      }
    },
  }))
)
