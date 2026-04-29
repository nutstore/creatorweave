/**
 * Input Draft Store — saves unsent input content per conversation.
 *
 * When the user switches workspaces, the current input (text, mentions,
 * selected files) is persisted here so it can be restored when they switch
 * back.  Drafts are kept in memory only (not persisted to localStorage)
 * because they are inherently ephemeral.
 */

import { create } from 'zustand'

export interface InputDraft {
  text: string
  mentionedAgentIds: string[]
  selectedFiles: string[]
}

/** Maximum number of drafts to keep in memory */
const MAX_DRAFTS = 50

interface InputDraftState {
  /** Map from conversation ID to draft content */
  drafts: Record<string, InputDraft>

  /** Save a draft for the given conversation */
  saveDraft: (convId: string, draft: InputDraft) => void

  /** Peek at the draft for a conversation (does NOT remove it). Safe for React StrictMode. */
  peekDraft: (convId: string) => InputDraft | null

  /** Clear the draft for a conversation after it has been consumed or a message is sent. */
  clearDraft: (convId: string) => void
}

export const useInputDraftStore = create<InputDraftState>()((set, get) => ({
  drafts: {},

  saveDraft: (convId, draft) => {
    const hasContent =
      draft.text || (draft.mentionedAgentIds?.length ?? 0) > 0 || (draft.selectedFiles?.length ?? 0) > 0

    if (!hasContent) {
      // Empty draft — clear any existing one
      if (get().drafts[convId]) {
        set((state) => {
          const next = { ...state.drafts }
          delete next[convId]
          return { drafts: next }
        })
      }
      return
    }

    set((state) => {
      const next = { ...state.drafts, [convId]: { ...draft } }
      // Evict oldest entries if over limit
      const keys = Object.keys(next)
      if (keys.length > MAX_DRAFTS) {
        // Remove first (oldest) entries beyond the limit
        for (let i = 0; i < keys.length - MAX_DRAFTS; i++) {
          delete next[keys[i]]
        }
      }
      return { drafts: next }
    })
  },

  peekDraft: (convId) => {
    const draft = get().drafts[convId]
    if (!draft) return null
    // Return a copy without removing from store (safe for StrictMode double-mount)
    return {
      text: draft.text,
      mentionedAgentIds: [...draft.mentionedAgentIds],
      selectedFiles: [...draft.selectedFiles],
    }
  },

  clearDraft: (convId) => {
    if (get().drafts[convId]) {
      set((state) => {
        const next = { ...state.drafts }
        delete next[convId]
        return { drafts: next }
      })
    }
  },
}))
