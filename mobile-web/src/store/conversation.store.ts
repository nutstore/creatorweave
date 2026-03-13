import { create } from 'zustand'
import type { ConversationStatus, Message, Conversation } from '@creatorweave/conversation'
import { StreamingQueue } from '../utils/streaming-queue'

// Re-export types for convenience
export type { ConversationStatus, Message, Conversation }

export interface ToolCall {
  toolName: string
  args: string
  toolCallId: string
}

interface ConversationState {
  conversations: Conversation[]
  activeConversationId: string | null

  // Thinking content (streamed from host)
  thinkingContent: string
  toolCalls: ToolCall[]

  // Streaming queue for RAF-batched updates (not persisted)
  streamingQueue: StreamingQueue | null

  // Actions
  setConversations: (data: Conversation[]) => void
  updateConversationMessages: (
    conversationId: string,
    page: number,
    messages: Message[],
    totalPages: number
  ) => void
  setActiveConversation: (id: string) => void
  addMessage: (conversationId: string, message: Message) => void
  updateStatus: (conversationId: string, status: ConversationStatus) => void
  appendThinking: (delta: string) => void
  clearThinking: () => void
  addToolCall: (toolCall: ToolCall) => void
  clear: () => void
}

export const useConversationStore = create<ConversationState>((set, get) => ({
  conversations: [],
  activeConversationId: null,
  thinkingContent: '',
  toolCalls: [],
  streamingQueue: null,

  setConversations: (data) => {
    set((state) => {
      const conversations = data.map((conv) => ({
        ...conv,
        currentPage: 1,
      }))
      return {
        conversations,
        activeConversationId: state.activeConversationId || data[0]?.id || null,
      }
    })
  },

  updateConversationMessages: (conversationId, page, messages, totalPages) => {
    set((state) => {
      const conversations = state.conversations.map((conv) => {
        if (conv.id !== conversationId) return conv

        if (page === 1) {
          return {
            ...conv,
            messages,
            currentPage: page,
            totalPages,
            hasMore: page < totalPages,
          }
        }

        return {
          ...conv,
          messages: [...conv.messages, ...messages],
          currentPage: page,
          totalPages,
          hasMore: page < totalPages,
        }
      })

      return { conversations }
    })
  },

  setActiveConversation: (id) => {
    // Cleanup existing queue when switching conversations
    const existingQueue = get().streamingQueue
    if (existingQueue) {
      existingQueue.destroy()
    }

    set({ activeConversationId: id, thinkingContent: '', toolCalls: [], streamingQueue: null })
  },

  addMessage: (conversationId, message) => {
    set((state) => ({
      conversations: state.conversations.map((conv) =>
        conv.id === conversationId
          ? { ...conv, messages: [...conv.messages, message] }
          : conv
      ),
    }))
  },

  updateStatus: (conversationId, status) => {
    set((state) => ({
      conversations: state.conversations.map((conv) =>
        conv.id === conversationId ? { ...conv, status } : conv
      ),
    }))
  },

  appendThinking: (delta) => {
    // Create queue if not exists
    let queue = get().streamingQueue
    if (!queue) {
      queue = new StreamingQueue((accumulated) => {
        set({ thinkingContent: accumulated })
      })
      set({ streamingQueue: queue })
    }
    queue.add(delta)
  },

  clearThinking: () => {
    // Flush and cleanup queue
    const queue = get().streamingQueue
    if (queue) {
      queue.flushNow()
      queue.destroy()
    }
    set({ thinkingContent: '', toolCalls: [], streamingQueue: null })
  },

  addToolCall: (toolCall) => {
    set((state) => ({
      toolCalls: [...state.toolCalls, toolCall],
    }))
  },

  clear: () => {
    // Cleanup queue
    const queue = get().streamingQueue
    if (queue) {
      queue.destroy()
    }
    set({
      conversations: [],
      activeConversationId: null,
      thinkingContent: '',
      toolCalls: [],
      streamingQueue: null,
    })
  },
}))
