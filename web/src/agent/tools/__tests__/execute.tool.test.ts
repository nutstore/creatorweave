import { describe, expect, it, vi } from 'vitest'
import type { ToolContext } from '../tool-types'
import { pythonDefinition, pythonToolExecutor } from '../execute.tool'

const pythonExecuteMock = vi.fn()
const getActiveConversationMock = vi.fn()
const refreshPendingChangesMock = vi.fn()

vi.mock('@/python', () => ({
  pythonExecutor: {
    execute: (...args: unknown[]) => pythonExecuteMock(...args),
  },
}))

vi.mock('@/store/conversation-context.store', () => ({
  getActiveConversation: () => getActiveConversationMock(),
  useConversationContextStore: {
    getState: () => ({
      refreshPendingChanges: (...args: unknown[]) => refreshPendingChangesMock(...args),
    }),
  },
}))

const context: ToolContext = {
  directoryHandle: null,
}

function parseError(result: string): { error: string } | null {
  try {
    const parsed = JSON.parse(result)
    if (parsed && typeof parsed.error === 'string') {
      return parsed
    }
    return null
  } catch {
    return null
  }
}

describe('python tool', () => {
  it('exposes python tool name with python-only params', () => {
    expect(pythonDefinition.function.name).toBe('python')
    expect(pythonDefinition.function.parameters.properties.language).toBeUndefined()
    expect(pythonDefinition.function.parameters.required).toContain('code')
  })

  it('python tool executes without requiring language parameter', async () => {
    getActiveConversationMock.mockResolvedValueOnce(null)

    const result = await pythonToolExecutor(
      {
        code: "print('hello')",
      },
      context
    )

    const error = parseError(result)
    expect(error).not.toBeNull()
    expect(error?.error).toBe('No active workspace')
  })
})
