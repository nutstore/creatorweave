import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ConversationView } from '../ConversationView'

type AssistantTurnBubbleProps = {
  runtimeSteps?: Array<{ id: string; type: string; content?: string; streaming?: boolean }>
}

const {
  useConversationStoreMock,
  useSettingsStoreMock,
  assistantTurnBubbleSpy,
  conversationState,
} = vi.hoisted(() => {
  const assistantTurnBubbleSpy = vi.fn<(props: AssistantTurnBubbleProps) => void>()

  const conversationState = {
    activeConversationId: 'conv-1',
    conversations: [
      {
        id: 'conv-1',
        messages: [
          {
            id: 'msg-user-1',
            role: 'user',
            content: 'hello',
            timestamp: 1,
            type: 'message',
          },
          {
            id: 'msg-assistant-1',
            role: 'assistant',
            content: 'ok',
            timestamp: 2,
            type: 'message',
            toolCalls: [],
            usage: null,
          },
        ],
        status: 'pending',
        draftAssistant: {
          reasoning: '',
          content: '',
          toolCalls: [],
          toolResults: {},
          toolCall: null,
          toolArgs: '',
          steps: [
            {
              id: 'compression-1',
              type: 'compression',
              content: '上下文已压缩并生成摘要',
              streaming: false,
            },
          ],
          activeReasoningStepId: null,
          activeContentStepId: null,
          activeToolStepId: null,
          activeCompressionStepId: null,
        },
        streamingContent: '',
        streamingReasoning: '',
        isReasoningStreaming: false,
        isContentStreaming: false,
        currentToolCall: null,
        activeToolCalls: [],
        streamingToolArgs: '',
        streamingToolArgsByCallId: {},
        workflowExecution: null,
        error: null,
        contextWindowUsage: null,
        lastContextWindowUsage: null,
      },
    ],
    createNew: vi.fn(),
    updateMessages: vi.fn(),
    deleteAgentLoop: vi.fn(() => true),
    setActive: vi.fn(),
    runAgent: vi.fn(),
    runWorkflowDryRun: vi.fn(),
    runWorkflowRealRun: vi.fn(),
    runCustomWorkflowDryRun: vi.fn(),
    listWorkflowTemplates: vi.fn(() => []),
    cancelAgent: vi.fn(),
    isConversationRunning: vi.fn(() => true),
    getSuggestedFollowUp: vi.fn(() => ''),
    clearSuggestedFollowUp: vi.fn(),
    mountConversation: vi.fn(),
    unmountConversation: vi.fn(),
    regenerateUserMessage: vi.fn(),
    editAndResendUserMessage: vi.fn(),
    resetConversationState: vi.fn(),
  }

  const useConversationStoreMock = ((selector: (state: typeof conversationState) => unknown) =>
    selector(
      conversationState
    )) as unknown as typeof import('@/store/conversation.store').useConversationStore
  ;(useConversationStoreMock as unknown as { getState: () => typeof conversationState }).getState =
    () => conversationState

  const useSettingsStoreMock = (selector?: (state: unknown) => unknown) => {
    const state = {
      providerType: 'openai',
      modelName: 'gpt-5.4',
      maxTokens: 8000,
      hasApiKey: true,
      enableThinking: false,
      thinkingLevel: 'medium' as const,
      setEnableThinking: vi.fn(),
      setThinkingLevel: vi.fn(),
    }
    return selector ? selector(state) : state
  }

  return {
    useConversationStoreMock,
    useSettingsStoreMock,
    assistantTurnBubbleSpy,
    conversationState,
  }
})

vi.mock('@/store/conversation.store', () => ({
  useConversationStore: useConversationStoreMock,
}))

vi.mock('@/store/agent.store', () => ({
  useAgentStore: () => ({ directoryHandle: null }),
}))

vi.mock('@/store/project.store', () => ({
  useProjectStore: (selector: (state: { activeProjectId: string | null }) => unknown) =>
    selector({ activeProjectId: null }),
}))

vi.mock('@/store/settings.store', () => ({
  useSettingsStore: useSettingsStoreMock,
}))

vi.mock('@/store/workspace-preferences.store', () => ({
  useWorkspacePreferencesStore: (selector?: (state: unknown) => unknown) => {
    const state = {
      agentMode: 'act' as const,
      setAgentMode: vi.fn(),
    }
    return selector ? selector(state) : state
  },
}))

vi.mock('@/store/agents.store', () => ({
  useAgentsStore: (
    selector: (state: {
      isLoading: boolean
      isInitialized: boolean
      agents: Array<{ id: string; name: string }>
      activeAgentId: string
      setActiveAgent: (id: string) => Promise<void>
      createAgent: (id: string) => Promise<{ id: string; name: string } | null>
      deleteAgent: (id: string) => Promise<void>
    }) => unknown
  ) =>
    selector({
      isLoading: false,
      isInitialized: true,
      agents: [{ id: 'default', name: 'Default' }],
      activeAgentId: 'default',
      setActiveAgent: vi.fn(async () => undefined),
      createAgent: vi.fn(async () => null),
      deleteAgent: vi.fn(async () => undefined),
    }),
}))

vi.mock('@/i18n', () => ({
  useT: () => (key: string) => key,
}))

vi.mock('../MessageBubble', () => ({
  MessageBubble: () => <div data-testid="message-bubble" />,
}))

vi.mock('../AssistantTurnBubble', () => ({
  AssistantTurnBubble: (props: AssistantTurnBubbleProps) => {
    assistantTurnBubbleSpy(props)
    return <div data-testid="assistant-turn-bubble" />
  },
}))

vi.mock('../AgentRichInput', () => ({
  AgentRichInput: () => <div data-testid="agent-rich-input" />,
}))

vi.mock('../WorkflowQuickActions', () => ({
  WorkflowQuickActions: () => null,
}))

vi.mock('../WorkflowExecutionProgress', () => ({
  WorkflowExecutionProgress: () => null,
}))

vi.mock('../workflow-editor/WorkflowEditorDialog', () => ({
  WorkflowEditorDialog: () => null,
}))

vi.mock('../AgentModeSwitch', () => ({
  AgentModeSwitchCompact: () => null,
}))

vi.mock('@creatorweave/ui', () => ({
  BrandSwitch: () => null,
}))

describe('ConversationView runtime step placement', () => {
  beforeEach(() => {
    assistantTurnBubbleSpy.mockClear()
    conversationState.conversations[0].status = 'pending'
  })

  it('attaches runtime steps to a single bubble while pending between loop iterations', () => {
    render(<ConversationView />)

    const calls = assistantTurnBubbleSpy.mock.calls.map((call) => call[0])
    const callsWithRuntimeSteps = calls.filter((props) => (props.runtimeSteps?.length || 0) > 0)

    expect(calls.length).toBe(1)
    expect(callsWithRuntimeSteps.length).toBe(1)
  })
})
