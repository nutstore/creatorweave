import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createAssistantMessage, createToolMessage, createUserMessage } from '@/agent/message-types'

const deleteWorkspaceMock = vi.fn(() => Promise.resolve())
const conversationRepoDeleteMock = vi.fn(() => Promise.resolve())

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
  },
}))

vi.mock('@/streaming-bus', () => ({
  emitThinkingStart: vi.fn(),
  emitThinkingDelta: vi.fn(),
  emitCompressionEvent: vi.fn(),
  emitToolStart: vi.fn(),
  emitComplete: vi.fn(),
  emitError: vi.fn(),
}))

vi.mock('../workspace.store', () => ({
  useWorkspaceStore: {
    getState: vi.fn(() => ({
      activeWorkspaceId: null,
      createWorkspace: vi.fn(() => Promise.resolve()),
      switchWorkspace: vi.fn(() => Promise.resolve()),
      refreshPendingChanges: vi.fn(() => Promise.resolve()),
      deleteWorkspace: deleteWorkspaceMock,
    })),
  },
}))

vi.mock('../settings.store', () => ({
  useSettingsStore: {
    getState: vi.fn(() => ({
      getEffectiveProviderConfig: vi.fn(() => ({
        apiKeyProviderKey: 'openai',
        baseUrl: 'https://example.com',
        modelName: 'mock-model',
      })),
    })),
  },
}))

vi.mock('@/sqlite', () => ({
  initSQLiteDB: vi.fn(() => Promise.resolve()),
  getApiKeyRepository: vi.fn(() => ({
    load: vi.fn(() => Promise.resolve('test-key')),
  })),
  getConversationRepository: vi.fn(() => ({
    findAll: vi.fn(() => Promise.resolve([])),
    save: vi.fn(() => Promise.resolve()),
    delete: conversationRepoDeleteMock,
  })),
}))

vi.mock('@/agent/providers/types', () => ({
  LLM_PROVIDER_CONFIGS: {
    openai: {
      baseURL: 'https://example.com',
      modelName: 'mock-model',
    },
  },
}))

vi.mock('@/agent/llm/provider-factory', () => ({
  createLLMProvider: vi.fn(() => ({
    maxContextTokens: 128000,
  })),
}))

vi.mock('@/agent/context-manager', () => ({
  ContextManager: vi.fn().mockImplementation(() => ({})),
}))

vi.mock('@/agent/tool-registry', () => ({
  getToolRegistry: vi.fn(() => ({})),
}))

vi.mock('@/agent/follow-up-generator', () => ({
  generateFollowUp: vi.fn(() => Promise.resolve('')),
}))

vi.mock('@/mcp/elicitation-handler.tsx', () => ({
  getElicitationHandler: vi.fn(() => ({
    handleBinaryElicitation: vi.fn(() => Promise.resolve({})),
  })),
}))

vi.mock('@/agent/agent-loop', () => {
  class MockAgentLoop {
    cancel() {}

    async run(messages: any[], callbacks: any) {
      ;(globalThis as any).__conversationStoreBeforeCompressionStart?.()
      callbacks.onContextCompressionStart?.({
        droppedGroups: 1,
        droppedContentChars: 128,
      })
      ;(globalThis as any).__conversationStoreTestHook?.('after_compression_start')

      const toolA = {
        id: 'call_A',
        type: 'function',
        function: { name: 'glob', arguments: '{}' },
      }
      const toolB = {
        id: 'call_B',
        type: 'function',
        function: { name: 'list_files', arguments: '{}' },
      }

      callbacks.onToolCallStart?.(toolA)
      callbacks.onToolCallStart?.(toolB)
      callbacks.onToolCallDelta?.(0, '{"path":"a"', 'call_A')
      ;(globalThis as any).__conversationStoreTestHook?.('after_a_delta')

      callbacks.onToolCallComplete?.(toolA, 'result A')
      ;(globalThis as any).__conversationStoreTestHook?.('after_a_complete')

      callbacks.onToolCallDelta?.(1, '{"path":"b"', 'call_B')
      ;(globalThis as any).__conversationStoreTestHook?.('after_b_delta')

      callbacks.onToolCallComplete?.(toolB, 'result B')
      ;(globalThis as any).__conversationStoreTestHook?.('after_b_complete')

      return [
        ...messages,
        {
          id: 'assistant-1',
          role: 'assistant',
          content: 'Done',
          timestamp: Date.now(),
        },
      ]
    }
  }

  return {
    AgentLoop: MockAgentLoop,
  }
})

import { useConversationStore } from '../conversation.store'

describe('conversation.store.sqlite tool-call routing', () => {
  beforeEach(() => {
    deleteWorkspaceMock.mockClear()
    conversationRepoDeleteMock.mockClear()
    useConversationStore.setState({
      conversations: [],
      activeConversationId: null,
      loaded: true,
      agentLoops: new Map(),
      streamingQueues: new Map(),
      suggestedFollowUps: new Map(),
      mountedConversations: new Map(),
    } as any)
    delete (globalThis as any).__conversationStoreTestHook
    delete (globalThis as any).__conversationStoreBeforeCompressionStart
  })

  it('should finalize non-current tool steps by toolCallId in interleaved calls', async () => {
    const store = useConversationStore.getState()
    const conv = store.createNew('test')

    const snapshots: Array<{
      label: string
      currentToolCallId: string | null
      stepA?: { streaming: boolean; args: string; result?: string }
      stepB?: { streaming: boolean; args: string; result?: string }
    }> = []

    ;(globalThis as any).__conversationStoreTestHook = (label: string) => {
      const c = useConversationStore.getState().conversations.find((x) => x.id === conv.id)
      const stepA = c?.draftAssistant?.steps.find((s) => s.id === 'tool-call_A' && s.type === 'tool_call') as any
      const stepB = c?.draftAssistant?.steps.find((s) => s.id === 'tool-call_B' && s.type === 'tool_call') as any
      snapshots.push({
        label,
        currentToolCallId: c?.currentToolCall?.id || null,
        stepA: stepA
          ? { streaming: stepA.streaming, args: stepA.args, result: stepA.result }
          : undefined,
        stepB: stepB
          ? { streaming: stepB.streaming, args: stepB.args, result: stepB.result }
          : undefined,
      })
    }

    await useConversationStore.getState().runAgent(conv.id, 'openai' as any, 'mock-model', 1024, null)

    const aComplete = snapshots.find((s) => s.label === 'after_a_complete')
    expect(aComplete).toBeDefined()
    expect(aComplete?.currentToolCallId).toBe('call_B')
    expect(aComplete?.stepA?.streaming).toBe(false)
    expect(aComplete?.stepA?.result).toBe('result A')
    expect(aComplete?.stepB?.streaming).toBe(true)

    const bDelta = snapshots.find((s) => s.label === 'after_b_delta')
    expect(bDelta?.stepB?.args).toContain('{"path":"b"')

    const bComplete = snapshots.find((s) => s.label === 'after_b_complete')
    expect(bComplete?.stepB?.streaming).toBe(false)
    expect(bComplete?.stepB?.result).toBe('result B')
  })

  it('should delete only the specified user message', () => {
    const store = useConversationStore.getState()
    const conv = store.createNew('delete-user')

    const u1 = createUserMessage('u1')
    const a1 = createAssistantMessage('a1')
    const t1 = createToolMessage({ toolCallId: 'tc-1', name: 'file_read', content: 'r1' })
    const u2 = createUserMessage('u2')

    useConversationStore.getState().updateMessages(conv.id, [u1, a1, t1, u2])

    const ok = useConversationStore.getState().deleteUserMessage(conv.id, u1.id)
    expect(ok).toBe(true)

    const updated = useConversationStore.getState().conversations.find((x) => x.id === conv.id)
    expect(updated?.messages.map((m) => m.id)).toEqual([a1.id, t1.id, u2.id])
  })

  it('should delete a whole agent loop from user message to before next user message', () => {
    const store = useConversationStore.getState()
    const conv = store.createNew('delete-loop')

    const u1 = createUserMessage('u1')
    const a1 = createAssistantMessage('a1')
    const t1 = createToolMessage({ toolCallId: 'tc-1', name: 'file_read', content: 'r1' })
    const u2 = createUserMessage('u2')
    const a2 = createAssistantMessage('a2')

    useConversationStore.getState().updateMessages(conv.id, [u1, a1, t1, u2, a2])

    const ok = useConversationStore.getState().deleteAgentLoop(conv.id, u1.id)
    expect(ok).toBe(true)

    const updated = useConversationStore.getState().conversations.find((x) => x.id === conv.id)
    expect(updated?.messages.map((m) => m.id)).toEqual([u2.id, a2.id])
  })

  it('should block loop deletion while conversation is running', () => {
    const store = useConversationStore.getState()
    const conv = store.createNew('running-delete')
    const u1 = createUserMessage('u1')
    const a1 = createAssistantMessage('a1')
    useConversationStore.getState().updateMessages(conv.id, [u1, a1])

    useConversationStore.setState((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === conv.id ? { ...c, status: 'streaming' as const } : c
      ),
    }))

    const ok = useConversationStore.getState().deleteAgentLoop(conv.id, u1.id)
    expect(ok).toBe(false)

    const updated = useConversationStore.getState().conversations.find((x) => x.id === conv.id)
    expect(updated?.messages.map((m) => m.id)).toEqual([u1.id, a1.id])
  })

  it('should delete multiple conversations in one action', async () => {
    const store = useConversationStore.getState()
    const conv1 = store.createNew('batch-1')
    const conv2 = store.createNew('batch-2')
    const conv3 = store.createNew('batch-3')
    await store.setActive(conv2.id)

    // include duplicate ids and a non-existing id
    const result = await useConversationStore
      .getState()
      .deleteConversations([conv1.id, conv2.id, conv2.id, 'missing-id'])

    const state = useConversationStore.getState()
    expect(state.activeConversationId).toBeNull()
    expect(state.conversations.map((c) => c.id)).toEqual([conv3.id])
    expect(result).toEqual({
      successIds: [conv1.id, conv2.id, 'missing-id'],
      failed: [],
    })
    expect(conversationRepoDeleteMock).toHaveBeenCalledTimes(3)
    expect(deleteWorkspaceMock).toHaveBeenCalledTimes(3)
    expect(conversationRepoDeleteMock).toHaveBeenCalledWith(conv1.id)
    expect(conversationRepoDeleteMock).toHaveBeenCalledWith(conv2.id)
    expect(conversationRepoDeleteMock).toHaveBeenCalledWith('missing-id')
  })

  it('should keep conversation when persisted deletion fails', async () => {
    const store = useConversationStore.getState()
    const conv = store.createNew('delete-fail')
    deleteWorkspaceMock.mockRejectedValueOnce(new Error('opfs delete failed'))

    await expect(useConversationStore.getState().deleteConversation(conv.id)).rejects.toThrow(
      /delete conversation failed/i
    )

    const state = useConversationStore.getState()
    expect(state.conversations.some((c) => c.id === conv.id)).toBe(true)
  })

  it('should retitle to next user message when deleting the first auto-titled loop', () => {
    const store = useConversationStore.getState()
    const conv = store.createNew()

    const u1 = createUserMessage('first title source')
    const a1 = createAssistantMessage('a1')
    const u2 = createUserMessage('second title source')
    const a2 = createAssistantMessage('a2')

    useConversationStore.getState().addMessage(conv.id, u1)
    useConversationStore.getState().addMessage(conv.id, a1)
    useConversationStore.getState().addMessage(conv.id, u2)
    useConversationStore.getState().addMessage(conv.id, a2)

    const before = useConversationStore.getState().conversations.find((x) => x.id === conv.id)
    expect(before?.title).toBe('first title source')

    const ok = useConversationStore.getState().deleteAgentLoop(conv.id, u1.id)
    expect(ok).toBe(true)

    const updated = useConversationStore.getState().conversations.find((x) => x.id === conv.id)
    expect(updated?.messages.map((m) => m.id)).toEqual([u2.id, a2.id])
    expect(updated?.title).toBe('second title source')
  })

  it('should keep manual title unchanged when deleting the first loop', () => {
    const store = useConversationStore.getState()
    const conv = store.createNew()

    const u1 = createUserMessage('first title source')
    const a1 = createAssistantMessage('a1')
    const u2 = createUserMessage('second title source')
    const a2 = createAssistantMessage('a2')

    useConversationStore.getState().addMessage(conv.id, u1)
    useConversationStore.getState().addMessage(conv.id, a1)
    useConversationStore.getState().addMessage(conv.id, u2)
    useConversationStore.getState().addMessage(conv.id, a2)
    useConversationStore.getState().updateTitle(conv.id, 'first title source')

    const ok = useConversationStore.getState().deleteAgentLoop(conv.id, u1.id)
    expect(ok).toBe(true)

    const updated = useConversationStore.getState().conversations.find((x) => x.id === conv.id)
    expect(updated?.messages.map((m) => m.id)).toEqual([u2.id, a2.id])
    expect(updated?.title).toBe('first title source')
  })

  it('should set status to pending when compression starts and status is not streaming/tool_calling', async () => {
    const store = useConversationStore.getState()
    const conv = store.createNew('compression-pending')

    ;(globalThis as any).__conversationStoreBeforeCompressionStart = () => {
      useConversationStore.setState((state) => ({
        conversations: state.conversations.map((c) =>
          c.id === conv.id ? { ...c, status: 'idle' } : c
        ),
      }))
    }

    const snapshots: Array<{ label: string; status: string | undefined }> = []
    ;(globalThis as any).__conversationStoreTestHook = (label: string) => {
      const c = useConversationStore.getState().conversations.find((x) => x.id === conv.id)
      snapshots.push({ label, status: c?.status })
    }

    await useConversationStore.getState().runAgent(conv.id, 'openai' as any, 'mock-model', 1024, null)

    const compressionStart = snapshots.find((s) => s.label === 'after_compression_start')
    expect(compressionStart?.status).toBe('pending')
  })

  it('should keep streamed assistant text on cancel and discard pending tool call', () => {
    const store = useConversationStore.getState()
    const conv = store.createNew('cancel-keep-partial')
    const user = createUserMessage('hello')
    useConversationStore.getState().updateMessages(conv.id, [user])

    const cancelSpy = vi.fn()
    const pendingToolCall = {
      id: 'tool-pending-1',
      type: 'function' as const,
      function: {
        name: 'read',
        arguments: '{"path":"README.md"}',
      },
    }

    useConversationStore.setState((state) => {
      const target = state.conversations.find((c) => c.id === conv.id)
      if (!target) return state
      target.status = 'tool_calling'
      target.activeRunId = 'run-1'
      target.currentToolCall = pendingToolCall
      target.activeToolCalls = [pendingToolCall]
      target.streamingContent = 'partial answer'
      target.streamingReasoning = 'thinking...'
      target.draftAssistant = {
        reasoning: 'thinking...',
        content: 'partial answer',
        toolCalls: [pendingToolCall],
        toolResults: {},
        toolCall: pendingToolCall,
        toolArgs: '{"path":"README.md"}',
        steps: [],
        activeReasoningStepId: null,
        activeContentStepId: null,
        activeToolStepId: `tool-${pendingToolCall.id}`,
        activeCompressionStepId: null,
      }
      state.agentLoops.set(conv.id, { cancel: cancelSpy } as any)
      return state
    })

    useConversationStore.getState().cancelAgent(conv.id)

    const updated = useConversationStore.getState().conversations.find((c) => c.id === conv.id)
    expect(cancelSpy).toHaveBeenCalledTimes(1)
    expect(updated?.status).toBe('idle')
    expect(updated?.activeRunId).toBeNull()
    expect(updated?.draftAssistant).toBeNull()
    expect(updated?.currentToolCall).toBeNull()
    expect(updated?.activeToolCalls).toEqual([])

    const assistantMessages = (updated?.messages || []).filter((m) => m.role === 'assistant')
    expect(assistantMessages).toHaveLength(1)
    expect(assistantMessages[0].content).toBe('partial answer')
    expect(assistantMessages[0].reasoning).toBe('thinking...')
    expect(assistantMessages[0].toolCalls).toBeUndefined()
  })

  it('should keep completed draft tool call/result pairs on cancel and discard pending ones', () => {
    const store = useConversationStore.getState()
    const conv = store.createNew('cancel-keep-completed-tools')
    const user = createUserMessage('hello')
    useConversationStore.getState().updateMessages(conv.id, [user])

    const cancelSpy = vi.fn()
    const completedToolCall = {
      id: 'tool-done-1',
      type: 'function' as const,
      function: {
        name: 'read',
        arguments: '{"path":"README.md"}',
      },
    }
    const pendingToolCall = {
      id: 'tool-pending-1',
      type: 'function' as const,
      function: {
        name: 'search',
        arguments: '{"query":"cancel"}',
      },
    }

    useConversationStore.setState((state) => {
      const target = state.conversations.find((c) => c.id === conv.id)
      if (!target) return state
      target.status = 'tool_calling'
      target.activeRunId = 'run-2'
      target.currentToolCall = pendingToolCall
      target.activeToolCalls = [pendingToolCall]
      target.streamingContent = 'partial answer'
      target.streamingReasoning = 'thinking...'
      target.draftAssistant = {
        reasoning: 'thinking...',
        content: 'partial answer',
        toolCalls: [completedToolCall, pendingToolCall],
        toolResults: {
          [completedToolCall.id]: 'README content',
        },
        toolCall: pendingToolCall,
        toolArgs: '{"query":"cancel"}',
        steps: [],
        activeReasoningStepId: null,
        activeContentStepId: null,
        activeToolStepId: `tool-${pendingToolCall.id}`,
        activeCompressionStepId: null,
      }
      state.agentLoops.set(conv.id, { cancel: cancelSpy } as any)
      return state
    })

    useConversationStore.getState().cancelAgent(conv.id)

    const updated = useConversationStore.getState().conversations.find((c) => c.id === conv.id)
    expect(cancelSpy).toHaveBeenCalledTimes(1)

    const assistantMessages = (updated?.messages || []).filter((m) => m.role === 'assistant')
    expect(assistantMessages).toHaveLength(1)
    expect(assistantMessages[0].toolCalls?.map((tc) => tc.id)).toEqual([completedToolCall.id])

    const toolMessages = (updated?.messages || []).filter((m) => m.role === 'tool')
    expect(toolMessages).toHaveLength(1)
    expect(toolMessages[0].toolCallId).toBe(completedToolCall.id)
    expect(toolMessages[0].content).toBe('README content')
  })
})
