/**
 * Conversation store - manages chat history with IndexedDB persistence.
 */

import { create } from 'zustand'
import type { Conversation, Message } from '@/agent/message-types'
import { createConversation } from '@/agent/message-types'

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

/** Persist a conversation to IndexedDB */
async function persistConversation(conversation: Conversation): Promise<void> {
  const db = await openDB()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const req = store.put(conversation)
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

interface ConversationState {
  conversations: Conversation[]
  activeConversationId: string | null
  loaded: boolean

  // Computed
  activeConversation: () => Conversation | null

  // Actions
  loadFromDB: () => Promise<void>
  createNew: (title?: string) => Conversation
  setActive: (id: string | null) => void
  addMessage: (conversationId: string, message: Message) => void
  updateMessages: (conversationId: string, messages: Message[]) => void
  deleteConversation: (id: string) => void
  updateTitle: (id: string, title: string) => void
}

export const useConversationStore = create<ConversationState>()((set, get) => ({
  conversations: [],
  activeConversationId: null,
  loaded: false,

  activeConversation: () => {
    const { conversations, activeConversationId } = get()
    if (!activeConversationId) return null
    return conversations.find((c) => c.id === activeConversationId) || null
  },

  loadFromDB: async () => {
    try {
      const conversations = await loadConversations()
      set({ conversations, loaded: true })
    } catch (error) {
      console.error('[conversation.store] Failed to load conversations:', error)
      set({ loaded: true })
    }
  },

  createNew: (title?: string) => {
    const conversation = createConversation(title)
    set((state) => ({
      conversations: [conversation, ...state.conversations],
      activeConversationId: conversation.id,
    }))
    persistConversation(conversation).catch(console.error)
    return conversation
  },

  setActive: (id) => set({ activeConversationId: id }),

  addMessage: (conversationId, message) => {
    set((state) => {
      const conversations = state.conversations.map((c) => {
        if (c.id !== conversationId) return c
        const updated = {
          ...c,
          messages: [...c.messages, message],
          updatedAt: Date.now(),
        }
        persistConversation(updated).catch(console.error)
        return updated
      })
      return { conversations }
    })
  },

  updateMessages: (conversationId, messages) => {
    set((state) => {
      const conversations = state.conversations.map((c) => {
        if (c.id !== conversationId) return c
        const updated = { ...c, messages, updatedAt: Date.now() }
        persistConversation(updated).catch(console.error)
        return updated
      })
      return { conversations }
    })
  },

  deleteConversation: (id) => {
    set((state) => {
      const conversations = state.conversations.filter((c) => c.id !== id)
      const activeConversationId =
        state.activeConversationId === id ? null : state.activeConversationId
      return { conversations, activeConversationId }
    })
    deleteConversationFromDB(id).catch(console.error)
  },

  updateTitle: (id, title) => {
    set((state) => {
      const conversations = state.conversations.map((c) => {
        if (c.id !== id) return c
        const updated = { ...c, title, updatedAt: Date.now() }
        persistConversation(updated).catch(console.error)
        return updated
      })
      return { conversations }
    })
  },
}))
