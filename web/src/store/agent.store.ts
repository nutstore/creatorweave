/**
 * Agent state store - manages Agent runtime status.
 */

import { create } from 'zustand'
import type { ToolCall } from '@/agent/message-types'

export type AgentStatus = 'idle' | 'thinking' | 'tool_calling' | 'streaming' | 'error'

interface AgentState {
  status: AgentStatus
  /** Streaming content being received */
  streamingContent: string
  /** Currently executing tool call */
  currentToolCall: ToolCall | null
  /** Current tool call result */
  currentToolResult: string | null
  /** Directory handle for file operations */
  directoryHandle: FileSystemDirectoryHandle | null
  /** Directory name for display */
  directoryName: string | null
  /** Error message */
  error: string | null

  // Actions
  setStatus: (status: AgentStatus) => void
  appendStreamingContent: (delta: string) => void
  resetStreamingContent: () => void
  setCurrentToolCall: (tc: ToolCall | null) => void
  setCurrentToolResult: (result: string | null) => void
  setDirectoryHandle: (handle: FileSystemDirectoryHandle | null) => void
  setError: (error: string | null) => void
  reset: () => void
}

export const useAgentStore = create<AgentState>()((set) => ({
  status: 'idle',
  streamingContent: '',
  currentToolCall: null,
  currentToolResult: null,
  directoryHandle: null,
  directoryName: null,
  error: null,

  setStatus: (status) => set({ status }),
  appendStreamingContent: (delta) =>
    set((state) => ({ streamingContent: state.streamingContent + delta })),
  resetStreamingContent: () => set({ streamingContent: '' }),
  setCurrentToolCall: (currentToolCall) => set({ currentToolCall }),
  setCurrentToolResult: (currentToolResult) => set({ currentToolResult }),
  setDirectoryHandle: (handle) =>
    set({ directoryHandle: handle, directoryName: handle?.name || null }),
  setError: (error) => set({ error, status: error ? 'error' : 'idle' }),
  reset: () =>
    set({
      status: 'idle',
      streamingContent: '',
      currentToolCall: null,
      currentToolResult: null,
      error: null,
    }),
}))
