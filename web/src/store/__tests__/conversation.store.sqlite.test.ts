import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createAssistantMessage, createToolMessage, createUserMessage } from '@/agent/message-types'

const deleteWorkspaceMock = vi.fn(() => Promise.resolve())
const conversationRepoDeleteMock = vi.fn(() => Promise.resolve())
const conversationRepoSaveMetaMock = vi.fn(() => Promise.resolve())
const messageRepoInsertMock = vi.fn(() => Promise.resolve())
const messageRepoReplaceAllMock = vi.fn(() => Promise.resolve())

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

vi.mock('../conversation-context.store', () => ({
  useConversationContextStore: {
    getState: vi.fn(() => ({
      activeWorkspaceId: null,
      workspaces: [],
      createWorkspace: vi.fn(() => Promise.resolve()),
      switchWorkspace: vi.fn(() => Promise.resolve()),
      refreshWorkspaces: vi.fn(() => Promise.resolve()),
      refreshPendingChanges: vi.fn(() => Promise.resolve()),
      deleteWorkspace: deleteWorkspaceMock,
    })),
  },
}))

vi.mock('../settings.store', () => {
  const mockSettingsState = {
    providerType: 'openai',
    modelName: 'mock-model',
    maxIterations: 20,
    getEffectiveProviderConfig: vi.fn(() => ({
      apiKeyProviderKey: 'openai',
      baseUrl: 'https://example.com',
      modelName: 'mock-model',
    })),
  }

  return {
    useSettingsStore: {
      getState: vi.fn(() => mockSettingsState),
    },
    __mockSettingsState: mockSettingsState,
  }
})

vi.mock('@/sqlite', () => ({
  initSQLiteDB: vi.fn(() => Promise.resolve()),
  getApiKeyRepository: vi.fn(() => ({
    load: vi.fn(() => Promise.resolve('test-key')),
  })),
  getConversationRepository: vi.fn(() => ({
    findAll: vi.fn(() => Promise.resolve([])),
    save: vi.fn(() => Promise.resolve()),
    saveMeta: conversationRepoSaveMetaMock,
    touch: vi.fn(() => Promise.resolve()),
    delete: conversationRepoDeleteMock,
  })),
  getMessageRepository: vi.fn(() => ({
    findByConversation: vi.fn(() => Promise.resolve([])),
    insert: messageRepoInsertMock,
    replaceAll: messageRepoReplaceAllMock,
    migrateFromJsonBlob: vi.fn(() => Promise.resolve({ conversations: 0, messages: 0 })),
    recoverFromAppSessions: vi.fn(() =>
      Promise.resolve({ sessions: 0, conversations: 0, messages: 0 })
    ),
  })),
  getSQLiteDB: vi.fn(() => ({
    queryFirst: vi.fn(() => Promise.resolve({ count: 0 })),
  })),
}))

vi.mock('@/agent/providers/types', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/agent/providers/types')>()
  return {
    ...actual,
    LLM_PROVIDER_CONFIGS: {
      ...actual.LLM_PROVIDER_CONFIGS,
      openai: {
        ...actual.LLM_PROVIDER_CONFIGS.openai,
        baseURL: 'https://example.com',
        modelName: 'mock-model',
      },
    },
    isCustomProviderType: vi.fn(() => false),
  }
})

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
    private config: any

    constructor(config: any) {
      this.config = config
      ;(globalThis as any).__lastAgentLoopConfig = config
    }

    cancel() {}

    async run(messages: any[], callbacks: any) {
      const customRun = (globalThis as any).__conversationStoreCustomRun
      if (typeof customRun === 'function') {
        const result = await customRun(messages, callbacks)
        this.config.onCompressionStateUpdate?.({
          convertCallCount: 17,
          lastSummaryConvertCall: 9,
        })
        return result
      }

      const beforeCompressionStart = (globalThis as any).__conversationStoreBeforeCompressionStart
      beforeCompressionStart?.()
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

      this.config.onCompressionStateUpdate?.({
        convertCallCount: 17,
        lastSummaryConvertCall: 9,
      })

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
    conversationRepoSaveMetaMock.mockReset()
    conversationRepoSaveMetaMock.mockResolvedValue(undefined)
    messageRepoInsertMock.mockReset()
    messageRepoInsertMock.mockResolvedValue(undefined)
    messageRepoReplaceAllMock.mockReset()
    messageRepoReplaceAllMock.mockResolvedValue(undefined)
    useConversationStore.setState({
      conversations: [],
      activeConversationId: null,
      loaded: true,
      agentLoops: new Map(),
      streamingQueues: new Map(),
      suggestedFollowUps: new Map(),
      cancelledRunIds: new Set(),
      mountedConversations: new Map(),
    } as any)
    delete (globalThis as any).__conversationStoreTestHook
    delete (globalThis as any).__conversationStoreBeforeCompressionStart
    delete (globalThis as any).__lastAgentLoopConfig
    delete (globalThis as any).__conversationStoreCustomRun
  })

  it('should wait for new conversation metadata before persisting the first message', async () => {
    let resolveMeta!: () => void
    const metaPersisted = new Promise<void>((resolve) => {
      resolveMeta = resolve
    })
    conversationRepoSaveMetaMock.mockReturnValueOnce(metaPersisted)

    const conv = useConversationStore.getState().createNew('new-chat-race')
    useConversationStore.getState().addMessage(conv.id, createUserMessage('hello'))

    await Promise.resolve()
    await Promise.resolve()
    expect(messageRepoInsertMock).not.toHaveBeenCalled()

    resolveMeta()
    await metaPersisted
    await vi.waitFor(() => {
      expect(messageRepoInsertMock).toHaveBeenCalledTimes(1)
    })
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
      const stepA = c?.draftAssistant?.steps.find(
        (s) => s.id === 'tool-call_A' && s.type === 'tool_call'
      ) as any
      const stepB = c?.draftAssistant?.steps.find(
        (s) => s.id === 'tool-call_B' && s.type === 'tool_call'
      ) as any
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

    await useConversationStore
      .getState()
      .runAgent(conv.id, 'openai' as any, 'mock-model', 1024, null)

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

  it('should pass maxIterations from settings store into AgentLoop', async () => {
    const settingsModule = await import('../settings.store')
    ;(settingsModule as any).__mockSettingsState.maxIterations = 37

    const store = useConversationStore.getState()
    const conv = store.createNew('max-iterations-prop')

    await useConversationStore
      .getState()
      .runAgent(conv.id, 'openai' as any, 'mock-model', 1024, null)

    const agentLoopConfig = (globalThis as any).__lastAgentLoopConfig
    expect(agentLoopConfig?.maxIterations).toBe(37)
  })

  it('should persist latest context usage metadata after run completion', async () => {
    const store = useConversationStore.getState()
    const conv = store.createNew('context-usage-persist')
    useConversationStore.getState().addMessage(conv.id, createUserMessage('hello'))
    expect(conversationRepoSaveMetaMock).toHaveBeenCalled()
    conversationRepoSaveMetaMock.mockClear()
    useConversationStore.setState((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === conv.id
          ? {
            ...c,
            lastContextWindowUsage: {
              usedTokens: 1234,
              maxTokens: 4096,
              reserveTokens: 1024,
              usagePercent: 24,
              modelMaxTokens: 5120,
            },
            contextWindowUsage: {
              usedTokens: 1234,
              maxTokens: 4096,
              reserveTokens: 1024,
              usagePercent: 24,
              modelMaxTokens: 5120,
            },
          }
          : c
      ),
    }))

    await useConversationStore
      .getState()
      .runAgent(conv.id, 'openai' as any, 'mock-model', 1024, null)
    const afterRun = useConversationStore.getState().conversations.find((c) => c.id === conv.id)
    expect(afterRun?.error).toBeNull()

    await vi.waitFor(() => {
      expect(conversationRepoSaveMetaMock).toHaveBeenCalledWith(
        expect.objectContaining({
          id: conv.id,
          contextUsage: expect.objectContaining({
            usedTokens: 1234,
            maxTokens: 4096,
            reserveTokens: 1024,
            modelMaxTokens: 5120,
          }),
        })
      )
    })
  })

  it('should carry compression counters across runAgent invocations', async () => {
    const store = useConversationStore.getState()
    const conv = store.createNew('compression-state-carry')

    await useConversationStore
      .getState()
      .runAgent(conv.id, 'openai' as any, 'mock-model', 1024, null)

    const firstRunConfig = (globalThis as any).__lastAgentLoopConfig
    expect(firstRunConfig?.initialConvertCallCount ?? 0).toBe(0)
    expect(firstRunConfig?.initialLastSummaryConvertCall ?? Number.NEGATIVE_INFINITY).toBe(
      Number.NEGATIVE_INFINITY
    )

    await useConversationStore
      .getState()
      .runAgent(conv.id, 'openai' as any, 'mock-model', 1024, null)

    const secondRunConfig = (globalThis as any).__lastAgentLoopConfig
    expect(secondRunConfig?.initialConvertCallCount).toBe(17)
    expect(secondRunConfig?.initialLastSummaryConvertCall).toBe(9)
  })

  it('should reflect onMessagesUpdated into store messages during an active run', async () => {
    const store = useConversationStore.getState()
    const conv = store.createNew('live-messages-during-run')
    const user = createUserMessage('hello')
    useConversationStore.getState().updateMessages(conv.id, [user])

    let messagesLengthSeenInsideRun = -1
    ;(globalThis as any).__conversationStoreCustomRun = async (messages: any[], callbacks: any) => {
      const liveAssistantMessage = {
        id: 'assistant-live-1',
        role: 'assistant',
        content: 'streamed chunk complete',
        timestamp: Date.now(),
      }
      callbacks.onMessagesUpdated?.([...messages, liveAssistantMessage])
      const current = useConversationStore.getState().conversations.find((x) => x.id === conv.id)
      messagesLengthSeenInsideRun = current?.messages.length ?? -1
      return [...messages, liveAssistantMessage]
    }

    await useConversationStore
      .getState()
      .runAgent(conv.id, 'openai' as any, 'mock-model', 1024, null)

    expect(messagesLengthSeenInsideRun).toBe(2)
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

  it('should regenerate by clearing all non-user messages in the target turn', () => {
    const store = useConversationStore.getState()
    const conv = store.createNew('regen-clear-turn')

    const u1 = createUserMessage('u1')
    const a1 = createAssistantMessage('a1')
    const t1 = createToolMessage({ toolCallId: 'tc-1', name: 'read', content: 'r1' })
    const t2 = createToolMessage({ toolCallId: 'tc-2', name: 'search', content: 'r2' })
    const u2 = createUserMessage('u2')
    const a2 = createAssistantMessage('a2')

    useConversationStore.getState().updateMessages(conv.id, [u1, a1, t1, t2, u2, a2])

    useConversationStore.getState().regenerateUserMessage(conv.id, u1.id)

    const updated = useConversationStore.getState().conversations.find((x) => x.id === conv.id)
    expect(updated?.messages.map((m) => m.id)).toEqual([u1.id, u2.id, a2.id])
    expect(updated?.messages[0]?.role).toBe('user')
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

    await useConversationStore
      .getState()
      .runAgent(conv.id, 'openai' as any, 'mock-model', 1024, null)

    const compressionStart = snapshots.find((s) => s.label === 'after_compression_start')
    expect(compressionStart?.status).toBe('pending')
  })

  it('should run workflow dry-run path when modelName uses workflow prefix', async () => {
    const store = useConversationStore.getState()
    const conv = store.createNew('workflow-dry-run')
    useConversationStore.getState().addMessage(conv.id, createUserMessage('开始工作流 dry run'))

    await useConversationStore
      .getState()
      .runAgent(conv.id, 'openai' as any, 'workflow:novel_daily_v1', 1024, null)

    const updated = useConversationStore.getState().conversations.find((x) => x.id === conv.id)
    const lastMessage = updated?.messages[updated.messages.length - 1]

    expect(updated?.status).toBe('idle')
    expect(lastMessage?.role).toBe('assistant')
    expect(lastMessage?.kind).toBe('workflow_dry_run')
    expect(lastMessage?.content).toMatch(/工作流模拟运行|Workflow dry run/)
    expect(lastMessage?.content).toContain('novel_daily_v1')
    expect(lastMessage?.workflowDryRun?.templateId).toBe('novel_daily_v1')
    expect(lastMessage?.workflowDryRun?.status).toBe('passed')
  })

  it('should support dedicated runWorkflowDryRun action', async () => {
    const store = useConversationStore.getState()
    const conv = store.createNew('workflow-dry-run-action')
    useConversationStore
      .getState()
      .addMessage(conv.id, createUserMessage('run template from action'))

    await useConversationStore.getState().runWorkflowDryRun(conv.id, 'novel_daily_v1')

    const updated = useConversationStore.getState().conversations.find((x) => x.id === conv.id)
    const lastMessage = updated?.messages[updated.messages.length - 1]

    expect(updated?.status).toBe('idle')
    expect(lastMessage?.role).toBe('assistant')
    expect(lastMessage?.kind).toBe('workflow_dry_run')
    expect(lastMessage?.content).toMatch(/工作流模拟运行|Workflow dry run/)
    expect(lastMessage?.content).toContain('novel_daily_v1')
    expect(lastMessage?.workflowDryRun?.templateId).toBe('novel_daily_v1')
    expect(lastMessage?.workflowDryRun?.status).toBe('passed')
  })

  it('should support dedicated runWorkflowDryRun action with custom rubric DSL', async () => {
    const store = useConversationStore.getState()
    const conv = store.createNew('workflow-dry-run-action-custom-rubric')
    useConversationStore
      .getState()
      .addMessage(conv.id, createUserMessage('run template with rubric'))

    const rubricDsl = JSON.stringify(
      {
        id: 'custom_action_rubric',
        version: 1,
        name: 'Custom Action Rubric',
        passCondition: 'total_score >= 1 and hard_fail_count == 0',
        retryPolicy: {
          maxRepairRounds: 0,
        },
        rules: [
          {
            id: 'paragraph_rule',
            checker: 'paragraph_sentence_count',
            params: {
              target: 'narrative',
              min: 2,
              max: 8,
            },
            weight: 1,
            threshold: {
              violationRateLte: 1,
            },
            failAction: 'auto_repair',
            severity: 'medium',
          },
        ],
      },
      null,
      2
    )

    await useConversationStore
      .getState()
      .runWorkflowDryRun(conv.id, 'novel_daily_v1', { rubricDsl })

    const updated = useConversationStore.getState().conversations.find((x) => x.id === conv.id)
    const lastMessage = updated?.messages[updated.messages.length - 1]

    expect(updated?.status).toBe('idle')
    expect(lastMessage?.role).toBe('assistant')
    expect(lastMessage?.kind).toBe('workflow_dry_run')
    expect(lastMessage?.workflowDryRun?.templateId).toBe('novel_daily_v1')
    expect(lastMessage?.content).toContain('Custom Action Rubric')
  })

  it('should expose workflow template list from store action', () => {
    const templates = useConversationStore.getState().listWorkflowTemplates()
    expect(Array.isArray(templates)).toBe(true)
    expect(templates.length).toBeGreaterThan(0)
    expect(templates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'novel_daily_v1', label: '小说日更' }),
        expect.objectContaining({ id: 'short_video_script_v1', label: '短视频脚本' }),
        expect.objectContaining({ id: 'education_lesson_note_v1', label: '教案笔记' }),
      ])
    )
  })

  it('should trigger workflow dry-run from slash command in latest user message', async () => {
    const store = useConversationStore.getState()
    const conv = store.createNew('workflow-slash-command')
    useConversationStore
      .getState()
      .addMessage(conv.id, createUserMessage('/workflow novel_daily_v1'))

    await useConversationStore
      .getState()
      .runAgent(conv.id, 'openai' as any, 'mock-model', 1024, null)

    const updated = useConversationStore.getState().conversations.find((x) => x.id === conv.id)
    const lastMessage = updated?.messages[updated.messages.length - 1]

    expect(updated?.status).toBe('idle')
    expect(lastMessage?.role).toBe('assistant')
    expect(lastMessage?.kind).toBe('workflow_dry_run')
    expect(lastMessage?.workflowDryRun?.templateId).toBe('novel_daily_v1')
  })

  it('should support custom rubric DSL in workflow slash command', async () => {
    const store = useConversationStore.getState()
    const conv = store.createNew('workflow-slash-with-rubric')
    const rubricDsl = JSON.stringify(
      {
        id: 'custom_slash_rubric',
        version: 1,
        name: 'Custom Slash Rubric',
        passCondition: 'total_score >= 1 and hard_fail_count == 0',
        retryPolicy: {
          maxRepairRounds: 0,
        },
        rules: [
          {
            id: 'paragraph_rule',
            checker: 'paragraph_sentence_count',
            params: {
              target: 'narrative',
              min: 2,
              max: 8,
            },
            weight: 1,
            threshold: {
              violationRateLte: 1,
            },
            failAction: 'auto_repair',
            severity: 'medium',
          },
        ],
      },
      null,
      2
    )

    useConversationStore
      .getState()
      .addMessage(conv.id, createUserMessage(`/workflow novel_daily_v1\n${rubricDsl}`))

    await useConversationStore
      .getState()
      .runAgent(conv.id, 'openai' as any, 'mock-model', 1024, null)

    const updated = useConversationStore.getState().conversations.find((x) => x.id === conv.id)
    const lastMessage = updated?.messages[updated.messages.length - 1]

    expect(updated?.status).toBe('idle')
    expect(lastMessage?.kind).toBe('workflow_dry_run')
    expect(lastMessage?.workflowDryRun?.templateId).toBe('novel_daily_v1')
    expect(lastMessage?.content).toContain('Custom Slash Rubric')
  })

  it('should fail workflow slash command when rubric DSL is invalid', async () => {
    const store = useConversationStore.getState()
    const conv = store.createNew('workflow-slash-invalid-rubric')

    useConversationStore
      .getState()
      .addMessage(conv.id, createUserMessage('/workflow novel_daily_v1\n{invalid-json}'))

    await useConversationStore
      .getState()
      .runAgent(conv.id, 'openai' as any, 'mock-model', 1024, null)

    const updated = useConversationStore.getState().conversations.find((x) => x.id === conv.id)

    expect(updated?.status).toBe('error')
    expect(updated?.error || '').toContain('invalid JSON')
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

  it('should stream think-tag reasoning before content completes', async () => {
    const store = useConversationStore.getState()
    const conv = store.createNew('stream-think-tags')
    useConversationStore.getState().updateMessages(conv.id, [createUserMessage('hello')])

    const snapshots: Array<{
      label: string
      reasoning: string
      content: string
      reasoningStep?: { content: string; streaming: boolean } | null
    }> = []

    const capture = async (label: string) => {
      await new Promise((resolve) => setTimeout(resolve, 20))
      const c = useConversationStore.getState().conversations.find((x) => x.id === conv.id)
      const reasoningStep = c?.draftAssistant?.steps.find((s) => s.type === 'reasoning') as
        | { content: string; streaming: boolean }
        | undefined

      snapshots.push({
        label,
        reasoning: c?.draftAssistant?.reasoning || '',
        content: c?.draftAssistant?.content || '',
        reasoningStep: reasoningStep
          ? { content: reasoningStep.content, streaming: reasoningStep.streaming }
          : null,
      })
    }

    ;(globalThis as any).__conversationStoreCustomRun = async (messages: any[], callbacks: any) => {
      callbacks.onMessageStart?.()
      callbacks.onContentStart?.()
      callbacks.onContentDelta?.('<think>分析中')
      await capture('after_open_think')
      callbacks.onContentDelta?.('</think>最终答案')
      await capture('after_close_think')
      callbacks.onContentComplete?.('<think>分析中</think>最终答案')
      return [
        ...messages,
        {
          id: 'assistant-think-stream',
          role: 'assistant',
          content: '<think>分析中</think>最终答案',
          timestamp: Date.now(),
        },
      ]
    }

    await useConversationStore
      .getState()
      .runAgent(conv.id, 'openai' as any, 'mock-model', 1024, null)

    const openThink = snapshots.find((s) => s.label === 'after_open_think')
    expect(openThink?.reasoning).toBe('分析中')
    expect(openThink?.reasoningStep?.content).toBe('分析中')
    expect(openThink?.reasoningStep?.streaming).toBe(true)
    expect(openThink?.content).toBe('')

    const closeThink = snapshots.find((s) => s.label === 'after_close_think')
    expect(closeThink?.reasoning).toBe('分析中')
    expect(closeThink?.reasoningStep?.content).toBe('分析中')
    expect(closeThink?.content).toBe('最终答案')
  })
})
