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
import { createConversation } from '@/agent/message-types'
import {
  emitThinkingStart,
  emitThinkingDelta,
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
import { GLMProvider } from '@/agent/llm/glm-provider'
import { ContextManager } from '@/agent/context-manager'
import { getToolRegistry } from '@/agent/tool-registry'
import { getApiKeyRepository } from '@/sqlite'
import { LLM_PROVIDER_CONFIGS, type LLMProviderType } from '@/agent/providers/types'
import { generateFollowUp } from '@/agent/follow-up-generator'
import { getConversationRepository, initSQLiteDB } from '@/sqlite'

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
    messages: conv.messages as Message[],
    status: 'idle' as const,
    streamingContent: '',
    streamingReasoning: '',
    isReasoningStreaming: false,
    completedReasoning: null,
    isContentStreaming: false,
    completedContent: null,
    currentToolCall: null,
    streamingToolArgs: '',
    error: null,
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

function isDefaultTitle(title: string): boolean {
  return title.startsWith('Chat ')
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

  // Track which conversations have active UI components (not persisted)
  // Used to prevent state updates after component unmount
  mountedConversations: Set<string>

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
}

export const useConversationStoreSQLite = create<ConversationState>()(
  immer((set, get) => ({
    conversations: [],
    activeConversationId: null,
    loaded: false,
    agentLoops: new Map(),
    streamingQueues: new Map(),
    suggestedFollowUps: new Map(),
    mountedConversations: new Set(),

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
        state.mountedConversations.add(id)
      })
    },

    unmountConversation: (id: string) => {
      set((state) => {
        state.mountedConversations.delete(id)
      })
    },

    isConversationMounted: (id: string) => {
      return get().mountedConversations.has(id)
    },

    loadFromDB: async () => {
      try {
        // Initialize SQLite first
        await initSQLiteDB()

        const conversations = await loadConversations()
        const activeId = conversations.length > 0 ? conversations[0].id : null

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

        // Refresh the session store
        const workspaceStore = useWorkspaceStore.getState()
        await workspaceStore.refreshWorkspaces()

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
            streamingToolArgs: '',
            error: null,
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

          if (message.role === 'user' && isDefaultTitle(conv.title) && message.content) {
            const userMessages = conv.messages.filter((m) => m.role === 'user')
            if (userMessages.length === 1) {
              const newTitle = truncateTitle(message.content)
              conv.title = newTitle
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
            isDefaultTitle(conv.title)
          ) {
            const firstUserMessage = messages.find((m) => m.role === 'user')
            if (firstUserMessage?.content) {
              const newTitle = truncateTitle(firstUserMessage.content)
              conv.title = newTitle
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
        const apiKeyRepo = getApiKeyRepository()
        const apiKey = await apiKeyRepo.load(providerType)
        if (!apiKey) {
          set((state) => {
            const c = state.conversations.find((c) => c.id === conversationId)
            if (c) {
              c.status = 'error'
              c.error = 'API Key 未设置，请先在设置中配置'
            }
          })
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
          toolContext: { directoryHandle },
          maxIterations: 20,
        })

        set((state) => {
          state.agentLoops.set(conversationId, agentLoop)
        })

        set((state) => {
          const c = state.conversations.find((c) => c.id === conversationId)
          if (c) {
            c.status = 'pending'
            c.error = null
          }
        })

        const currentMessages = conv.messages

        // Reasoning streaming queue
        let fullReasoningAccumulator = ''
        const reasoningQueue = new StreamingQueue((_key: string, accumulated: string) => {
          fullReasoningAccumulator += accumulated
          set((state) => {
            const c = state.conversations.find((c) => c.id === conversationId)
            if (c) c.streamingReasoning = fullReasoningAccumulator
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
            if (c) c.streamingContent = fullContentAccumulator
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

        // Helper to check if conversation is still mounted before state updates
        const isMounted = () => get().mountedConversations.has(conversationId)

        const resultMessages = await agentLoop.run(currentMessages, {
          onMessageStart: () => {
            if (!isMounted()) return
            // Reset accumulators for new message
            fullContentAccumulator = ''
            fullReasoningAccumulator = ''
            set((state) => {
              const c = state.conversations.find((c) => c.id === conversationId)
              if (c) {
                c.streamingContent = ''
                c.streamingReasoning = ''
                c.isReasoningStreaming = false
                c.completedReasoning = ''
                c.isContentStreaming = false
                c.completedContent = ''
              }
            })
          },
          onReasoningStart: () => {
            if (!isMounted()) return
            set((state) => {
              const c = state.conversations.find((c) => c.id === conversationId)
              if (c) {
                c.status = 'streaming'
                c.isReasoningStreaming = true
              }
            })
            emitThinkingStart()
          },
          onReasoningDelta: (delta: string) => {
            if (!isMounted()) return
            reasoningQueue.add('reasoning', delta)
            emitThinkingDelta(delta)
          },
          onReasoningComplete: (reasoning: string) => {
            if (!isMounted()) return
            reasoningQueue.flushNow()
            set((state) => {
              const c = state.conversations.find((c) => c.id === conversationId)
              if (c) {
                c.isReasoningStreaming = false
                c.completedReasoning = reasoning
                c.streamingReasoning = ''
              }
            })
          },
          onContentStart: () => {
            if (!isMounted()) return
            set((state) => {
              const c = state.conversations.find((c) => c.id === conversationId)
              if (c) {
                c.status = 'streaming'
                c.isContentStreaming = true
              }
            })
          },
          onContentDelta: (delta: string) => {
            if (!isMounted()) return
            contentQueue.add('content', delta)
          },
          onContentComplete: (content: string) => {
            if (!isMounted()) return
            contentQueue.flushNow()
            set((state) => {
              const c = state.conversations.find((c) => c.id === conversationId)
              if (c) {
                c.isContentStreaming = false
                c.completedContent = content
                c.streamingContent = ''
              }
            })
          },
          onToolCallStart: (tc: ToolCall) => {
            if (!isMounted()) return
            set((state) => {
              const c = state.conversations.find((c) => c.id === conversationId)
              if (c) {
                c.status = 'tool_calling'
                c.currentToolCall = tc
                c.streamingToolArgs = ''
              }
            })
            emitToolStart({
              name: tc.function.name,
              args: tc.function.arguments,
              id: tc.id,
            })
          },
          onToolCallDelta: (_index: number, argsDelta: string) => {
            if (!isMounted()) return
            set((state) => {
              const c = state.conversations.find((c) => c.id === conversationId)
              if (c) c.streamingToolArgs += argsDelta
            })
          },
          onToolCallComplete: (_tc: ToolCall, _result: string) => {
            if (!isMounted()) return
            set((state) => {
              const c = state.conversations.find((c) => c.id === conversationId)
              if (c) c.currentToolCall = null
            })
          },
          // SEP-1306: Handle binary elicitation for file uploads
          onElicitation: async (elicitation: any) => {
            if (!isMounted()) return
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
            if (!isMounted()) return
            set((state) => {
              const c = state.conversations.find((c) => c.id === conversationId)
              if (c) c.messages = msgs
            })
          },
          onComplete: async (msgs: Message[]) => {
            if (!isMounted()) {
              // Cleanup resources even if unmounted
              reasoningQueue.flushNow()
              contentQueue.flushNow()
              cleanupQueues()
              set((state) => {
                state.agentLoops.delete(conversationId)
              })
              return
            }
            reasoningQueue.flushNow()
            contentQueue.flushNow()
            cleanupQueues()

            set((state) => {
              const c = state.conversations.find((c) => c.id === conversationId)
              if (c) {
                c.messages = msgs
                c.status = 'idle'
              }
              state.agentLoops.delete(conversationId)
            })
            emitComplete()
            const finalConv = get().conversations.find((c) => c.id === conversationId)
            if (finalConv)
              persistConversation(finalConv).catch((error) => {
                console.error(
                  '[conversation.store] Failed to persist conversation on complete:',
                  error
                )
                toast.error('对话保存失败，部分内容可能丢失')
              })

            try {
              const apiKey = await apiKeyRepo.load(providerType)
              if (apiKey) {
                const suggestion = await generateFollowUp(msgs, providerType, apiKey)
                if (suggestion) {
                  get().setSuggestedFollowUp(conversationId, suggestion)
                }
              }
            } catch (error) {
              console.error('[conversation.store] Failed to generate follow-up:', error)
            }
          },
          onError: (err: Error) => {
            if (!isMounted()) {
              // Cleanup resources even if unmounted
              reasoningQueue.flushNow()
              contentQueue.flushNow()
              cleanupQueues()
              set((state) => {
                state.agentLoops.delete(conversationId)
              })
              return
            }
            reasoningQueue.flushNow()
            contentQueue.flushNow()
            cleanupQueues()

            set((state) => {
              const c = state.conversations.find((c) => c.id === conversationId)
              if (c) {
                c.status = 'error'
                c.error = err.message
              }
              state.agentLoops.delete(conversationId)
            })
            emitError(err.message)
          },
        })

        const queues = get().streamingQueues.get(conversationId)
        if (queues) {
          queues.reasoning.flushNow()
          queues.content.flushNow()
          queues.reasoning.destroy()
          queues.content.destroy()
        }
        set((state) => {
          const c = state.conversations.find((c) => c.id === conversationId)
          if (c) {
            c.messages = resultMessages
            c.status = 'idle'
          }
          state.agentLoops.delete(conversationId)
          state.streamingQueues.delete(conversationId)
        })
        const finalConv = get().conversations.find((c) => c.id === conversationId)
        if (finalConv)
          persistConversation(finalConv).catch((err) => {
            console.error(
              '[conversation.store] Failed to persist conversation on stream error:',
              err
            )
            toast.error('对话保存失败，部分内容可能丢失')
          })
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
            }
            state.agentLoops.delete(conversationId)
          })
          return
        }
        set((state) => {
          const c = state.conversations.find((c) => c.id === conversationId)
          if (c) {
            c.status = 'error'
            c.error = error instanceof Error ? error.message : String(error)
          }
          state.agentLoops.delete(conversationId)
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
          if (c) c.status = 'idle'
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
        if (c) c.currentToolCall = tc
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
        if (c) c.streamingToolArgs = ''
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
          c.streamingToolArgs = ''
          c.error = null
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
  }))
)
