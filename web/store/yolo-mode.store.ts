/**
 * YOLO Mode Store — conversation-scoped "skip all prompt-level approvals".
 *
 * PR-4 of the tool authorization redesign generalizes the old page-action
 * yolo (global in-memory flag) into a conversation-scoped yoloMode that the
 * policy engine consults for EVERY prompt-level tool (external calls, disk
 * writes, page-action writes), not just page writes.
 *
 * Scope model (redesign doc §3.8) — intentional tightening:
 * - Purely in-memory; refresh clears it.
 * - Keyed by conversation: switching or closing a conversation drops the
 *   grant. An approval mindset ("I trust THIS task") must not silently
 *   bleed into unrelated conversations.
 * - forbidden tools are never covered by yolo (enforced in policy-engine,
 *   not here). LLM cannot enable yolo — switch_agent_mode force-clears it.
 *
 * NOTE: this module deliberately imports NOTHING conversation-related.
 * Importing the conversation store from here creates an import cycle
 * (conversation store → tool-registry → switch-mode.tool → this store), so
 * engine callers MUST pass the conversation id explicitly
 * (ToolContext.workspaceId) and UI reads the map via the zustand hook.
 */

import { create } from 'zustand'
import { usePageActionSessionStore } from '@/store/page-action-session.store'

interface YoloModeState {
  /** conversationId -> yolo on */
  yoloByConversation: Record<string, boolean>

  setYolo: (conversationId: string | null | undefined, on: boolean) => void

  /** Turn yolo off for every conversation (LLM mode-switch safety valve). */
  clearAll: () => void
}

export const useYoloModeStore = create<YoloModeState>((set) => ({
  yoloByConversation: {},

  setYolo: (conversationId, on) =>
    set((state) => {
      if (!conversationId) return state
      if (Boolean(state.yoloByConversation[conversationId]) === on) return state
      return { yoloByConversation: { ...state.yoloByConversation, [conversationId]: on } }
    }),

  clearAll: () => set({ yoloByConversation: {} }),
}))

/**
 * Engine-facing read: is yolo currently on for the given conversation?
 * There is deliberately NO global fallback — a conversation-less yolo would
 * be exactly the global flag this PR removes. No id → off.
 */
export function isYoloOn(conversationId?: string | null): boolean {
  if (!conversationId) return false
  return Boolean(useYoloModeStore.getState().yoloByConversation[conversationId])
}

/** Legacy global flag — kept in sync as a UI compatibility shim. */
export function syncLegacyPageActionYolo(on: boolean): void {
  try {
    usePageActionSessionStore.getState().setPageActionYolo(on)
  } catch {
    // Legacy store unavailable (e.g. stripped in tests) — non-fatal.
  }
}
