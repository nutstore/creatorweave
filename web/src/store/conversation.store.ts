/**
 * Conversation store - manages chat history with per-conversation AgentLoop instances.
 * Uses Immer middleware for automatic immutable updates.
 *
 * Runtime state (status, streaming content, etc.) is stored per-conversation
 * and not persisted to IndexedDB.
 */

import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { enableMapSet } from 'immer'
import type { Conversation, Message, ToolCall, ConversationStatus } from '@/agent/message-types'
import { createConversation } from '@/agent/message-types'

// Enable Immer Map/Set support
enableMapSet()
import { AgentLoop } from '@/agent/agent-loop'
import { GLMProvider } from '@/agent/llm/glm-provider'
import { ContextManager } from '@/agent/context-manager'
import { getToolRegistry } from '@/agent/tool-registry'
import { loadApiKey } from '@/security/api-key-store'
import { LLM_PROVIDER_CONFIGS, type LLMProviderType } from '@/agent/providers/types'
import { generateFollowUp } from '@/agent/follow-up-generator'

const DB_NAME = 'bfosa-conversations'
const DB_VERSION = 1
const STORE_NAME = 'conversations'

/** Open IndexedDB for conversations */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
        store.createIndex('updatedAt', 'updatedAt')
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/** Persist a conversation to IndexedDB (excludes runtime state) */
async function persistConversation(conversation: Conversation): Promise<void> {
  const db = await openDB()
  // Create a clean copy without runtime state for persistence
  const persistable = {
    id: conversation.id,
    title: conversation.title,
    messages: conversation.messages,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
  }
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const req = store.put(persistable)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

/** Load all conversations from IndexedDB */
async function loadConversations(): Promise<Conversation[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const req = store.getAll()
    req.onsuccess = () => {
      const conversations = req.result as Conversation[]
      // Sort by updatedAt descending
      conversations.sort((a, b) => b.updatedAt - a.updatedAt)
      resolve(conversations)
    }
    req.onerror = () => reject(req.error)
  })
}

/** Delete a conversation from IndexedDB */
async function deleteConversationFromDB(id: string): Promise<void> {
  const db = await openDB()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const req = store.delete(id)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

/** Maximum title length */
const MAX_TITLE_LENGTH = 30

/** Truncate message content for use as title */
function truncateTitle(content: string): string {
  // Remove leading/trailing whitespace
  let trimmed = content.trim()

  // Remove newlines and multiple spaces
  trimmed = trimmed.replace(/\s+/g, ' ')

  // Truncate to max length
  if (trimmed.length <= MAX_TITLE_LENGTH) {
    return trimmed
  }

  return trimmed.slice(0, MAX_TITLE_LENGTH - 1) + '…'
}

/** Check if a conversation has the default auto-generated title */
function isDefaultTitle(title: string): boolean {
  return title.startsWith('Chat ')
}

interface ConversationState {
  conversations: Conversation[]
  activeConversationId: string | null
  loaded: boolean

  // AgentLoop management (not persisted)
  agentLoops: Map<string, AgentLoop>

  // Follow-up suggestions (not persisted) - per conversation
  suggestedFollowUps: Map<string, string>

  // Computed
  activeConversation: () => Conversation | null

  // Status helpers
  getConversationStatus: (id: string) => ConversationStatus
  isConversationRunning: (id: string) => boolean
  getRunningConversations: () => string[]

  // Actions
  loadFromDB: () => Promise<void>
  createNew: (title?: string) => Conversation
  setActive: (id: string | null) => void
  addMessage: (conversationId: string, message: Message) => void
  updateMessages: (conversationId: string, messages: Message[]) => void
  deleteConversation: (id: string) => void
  updateTitle: (id: string, title: string) => void

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

export const useConversationStore = create<ConversationState>()(
  immer((set, get) => ({
    conversations: [],
    activeConversationId: null,
    loaded: false,
    agentLoops: new Map(),
    suggestedFollowUps: new Map(),

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

    loadFromDB: async () => {
      try {
        const conversations = await loadConversations()
        // Auto-activate the most recently updated conversation
        const activeId = conversations.length > 0 ? conversations[0].id : null
        set((state) => {
          // Merge loaded conversations with runtime state defaults
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
          // Clear follow-up suggestions on reload (not persisted)
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
      persistConversation(conversation).catch(console.error)
      return conversation
    },

    setActive: (id) =>
      set((state) => {
        state.activeConversationId = id
      }),

    addMessage: (conversationId, message) => {
      set((state) => {
        const conv = state.conversations.find((c) => c.id === conversationId)
        if (conv) {
          conv.messages.push(message)
          conv.updatedAt = Date.now()

          // Auto-update title from first user message if still using default title
          if (message.role === 'user' && isDefaultTitle(conv.title) && message.content) {
            const userMessages = conv.messages.filter((m) => m.role === 'user')
            if (userMessages.length === 1) {
              const newTitle = truncateTitle(message.content)
              console.log('[conversation.store] Auto-updating title:', conv.title, '→', newTitle)
              conv.title = newTitle
            }
          }
        }
      })
      const conv = get().conversations.find((c) => c.id === conversationId)
      if (conv) persistConversation(conv).catch(console.error)
    },

    updateMessages: (conversationId, messages) => {
      set((state) => {
        const conv = state.conversations.find((c) => c.id === conversationId)
        if (conv) {
          const prevUserMessageCount = conv.messages.filter((m) => m.role === 'user').length

          conv.messages = messages
          conv.updatedAt = Date.now()

          // Auto-update title from first user message if still using default title
          const currentUserMessageCount = messages.filter((m) => m.role === 'user').length
          if (
            currentUserMessageCount === 1 &&
            prevUserMessageCount === 0 &&
            isDefaultTitle(conv.title)
          ) {
            const firstUserMessage = messages.find((m) => m.role === 'user')
            if (firstUserMessage?.content) {
              const newTitle = truncateTitle(firstUserMessage.content)
              console.log('[conversation.store] Auto-updating title:', conv.title, '→', newTitle)
              conv.title = newTitle
            }
          }
        }
      })
      const conv = get().conversations.find((c) => c.id === conversationId)
      if (conv) persistConversation(conv).catch(console.error)
    },

    deleteConversation: (id) => {
      set((state) => {
        // Cancel and remove AgentLoop if running
        const agentLoop = state.agentLoops.get(id)
        if (agentLoop) {
          agentLoop.cancel()
          state.agentLoops.delete(id)
        }
        state.conversations = state.conversations.filter((c) => c.id !== id)
        if (state.activeConversationId === id) {
          state.activeConversationId = null
        }
        // Clear follow-up suggestion for deleted conversation
        state.suggestedFollowUps.delete(id)
      })
      deleteConversationFromDB(id).catch(console.error)
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
      if (conv) persistConversation(conv).catch(console.error)
    },

    // Agent runtime actions
    runAgent: async (
      conversationId: string,
      providerType: string,
      modelName: string,
      maxTokens: number,
      directoryHandle: FileSystemDirectoryHandle | null
    ) => {
      const state = get()
      const conv = state.conversations.find((c) => c.id === conversationId)
      if (!conv) return

      // Check if already running
      if (state.isConversationRunning(conversationId)) {
        console.warn('[conversation.store] Conversation is already running:', conversationId)
        return
      }

      try {
        const apiKey = await loadApiKey(providerType)
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

        const config = LLM_PROVIDER_CONFIGS[providerType as LLMProviderType]
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

        // Store AgentLoop reference
        set((state) => {
          state.agentLoops.set(conversationId, agentLoop)
        })

        // Set initial status
        set((state) => {
          const c = state.conversations.find((c) => c.id === conversationId)
          if (c) {
            c.status = 'pending'
            c.error = null
          }
        })

        const currentMessages = conv.messages

        // Run the agent
        const resultMessages = await agentLoop.run(currentMessages, {
          onMessageStart: () => {
            // Don't change status yet - keep 'pending' to show loading dots
            // Status will change when actual content arrives (onReasoningStart or onContentStart)
            set((state) => {
              const c = state.conversations.find((c) => c.id === conversationId)
              if (c) {
                // Just reset streaming buffers, keep status as 'pending'
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
            set((state) => {
              const c = state.conversations.find((c) => c.id === conversationId)
              if (c) {
                c.status = 'streaming'
                c.isReasoningStreaming = true
              }
            })
          },
          onReasoningDelta: (delta: string) => {
            set((state) => {
              const c = state.conversations.find((c) => c.id === conversationId)
              if (c) c.streamingReasoning += delta
            })
          },
          onReasoningComplete: (reasoning: string) => {
            set((state) => {
              const c = state.conversations.find((c) => c.id === conversationId)
              if (c) {
                c.isReasoningStreaming = false
                c.completedReasoning = reasoning
              }
            })
          },
          onContentStart: () => {
            set((state) => {
              const c = state.conversations.find((c) => c.id === conversationId)
              if (c) {
                c.status = 'streaming'
                c.isContentStreaming = true
              }
            })
          },
          onContentDelta: (delta: string) => {
            set((state) => {
              const c = state.conversations.find((c) => c.id === conversationId)
              if (c) c.streamingContent += delta
            })
          },
          onContentComplete: (content: string) => {
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
            set((state) => {
              const c = state.conversations.find((c) => c.id === conversationId)
              if (c) {
                c.status = 'tool_calling'
                c.currentToolCall = tc
                c.streamingToolArgs = ''
              }
            })
          },
          onToolCallDelta: (_index: number, argsDelta: string) => {
            set((state) => {
              const c = state.conversations.find((c) => c.id === conversationId)
              if (c) c.streamingToolArgs += argsDelta
            })
          },
          onToolCallComplete: (_tc: ToolCall, _result: string) => {
            // Tool result is added to messages, no need to store separately
            set((state) => {
              const c = state.conversations.find((c) => c.id === conversationId)
              if (c) c.currentToolCall = null
            })
          },
          onMessagesUpdated: (msgs: Message[]) => {
            set((state) => {
              const c = state.conversations.find((c) => c.id === conversationId)
              if (c) c.messages = msgs
            })
          },
          onComplete: async (msgs: Message[]) => {
            set((state) => {
              const c = state.conversations.find((c) => c.id === conversationId)
              if (c) {
                c.messages = msgs
                c.status = 'idle'
              }
              // Remove AgentLoop reference
              state.agentLoops.delete(conversationId)
            })
            // Persist final state
            const finalConv = get().conversations.find((c) => c.id === conversationId)
            if (finalConv) persistConversation(finalConv).catch(console.error)

            // Generate follow-up suggestion (async, non-blocking)
            try {
              const apiKey = await loadApiKey(providerType)
              if (apiKey) {
                const suggestion = await generateFollowUp(
                  msgs,
                  providerType as LLMProviderType,
                  apiKey
                )
                if (suggestion) {
                  get().setSuggestedFollowUp(conversationId, suggestion)
                }
              }
            } catch (error) {
              // Silently fail - follow-up is optional
              console.error('[conversation.store] Failed to generate follow-up:', error)
            }
          },
          onError: (err: Error) => {
            set((state) => {
              const c = state.conversations.find((c) => c.id === conversationId)
              if (c) {
                c.status = 'error'
                c.error = err.message
              }
              state.agentLoops.delete(conversationId)
            })
          },
        })

        // Final update in case onComplete wasn't called
        set((state) => {
          const c = state.conversations.find((c) => c.id === conversationId)
          if (c) {
            c.messages = resultMessages
            c.status = 'idle'
          }
          state.agentLoops.delete(conversationId)
        })
        const finalConv = get().conversations.find((c) => c.id === conversationId)
        if (finalConv) persistConversation(finalConv).catch(console.error)
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          // Cancelled by user
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
        set((state) => {
          state.agentLoops.delete(conversationId)
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
