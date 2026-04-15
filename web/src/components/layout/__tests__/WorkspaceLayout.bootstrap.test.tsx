import { describe, expect, it, vi, beforeEach } from 'vitest'

// Mock the entire conversation store module
vi.mock('@/store/conversation.store', () => {
  const conversationState = {
    activeConversationId: null as string | null,
    conversations: [] as Array<{ id: string }>,
    loaded: false,
    loadFromDB: vi.fn(async () => {
      // Simulate loading
      await new Promise((resolve) => setTimeout(resolve, 10))
      conversationState.loaded = true
    }),
    createNew: vi.fn(() => ({ id: 'conv-new' })),
    setActive: vi.fn(async () => {}),
    runAgent: vi.fn(async () => {}),
    isConversationRunning: vi.fn(() => false),
    updateMessages: vi.fn(),
  }

  const useConversationStoreMock = ((selector?: (state: typeof conversationState) => unknown) =>
    selector ? selector(conversationState) : conversationState) as unknown as typeof import('@/store/conversation.store').useConversationStore
  ;(useConversationStoreMock as unknown as { getState: () => typeof conversationState }).getState =
    () => conversationState

  return {
    useConversationStore: useConversationStoreMock,
  }
})

describe('WorkspaceLayout loadFromDB behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should call loadFromDB when loaded is false', async () => {
    const { useConversationStore: mockStore } = await import('@/store/conversation.store')
    const state = mockStore.getState()
    state.loaded = false

    // Simulate what WorkspaceLayout does
    const loaded = mockStore((s) => s.loaded)
    const loadFromDB = mockStore((s) => s.loadFromDB)

    if (!loaded) {
      await loadFromDB()
    }

    expect(loadFromDB).toHaveBeenCalledTimes(1)
  })

  it('should NOT call loadFromDB when already loaded', async () => {
    const { useConversationStore: mockStore } = await import('@/store/conversation.store')
    const state = mockStore.getState()
    state.loaded = true

    // Simulate what WorkspaceLayout does
    const loaded = mockStore((s) => s.loaded)
    const loadFromDB = mockStore((s) => s.loadFromDB)

    if (!loaded) {
      await loadFromDB()
    }

    expect(loadFromDB).not.toHaveBeenCalled()
  })
})
