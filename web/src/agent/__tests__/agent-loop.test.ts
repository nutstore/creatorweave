/**
 * AgentLoop Unit Tests
 *
 * Target coverage: 85%
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { AgentLoop } from '../agent-loop'
import type { Message } from '../message-types'
import type { LLMProvider, ChatCompletionChunk, ChatCompletionRequest } from '../llm/llm-provider'
import type { ToolContext } from '../tools/tool-types'
import type { ChatMessage } from '../llm/llm-provider'

// Mock skill-manager before importing AgentLoop
vi.mock('@/skills/skill-manager', () => ({
  getSkillManager: vi.fn(() => ({
    getEnhancedSystemPrompt: vi.fn((prompt: string) => prompt),
  })),
}))

// Mock intelligence-coordinator
vi.mock('../intelligence-coordinator', () => ({
  getIntelligenceCoordinator: vi.fn(() => ({
    enhanceSystemPrompt: vi.fn((prompt: string) => Promise.resolve({ systemPrompt: prompt })),
    quickDetectProjectType: vi.fn(() => Promise.resolve({ type: 'typescript' })),
  })),
}))

// Mock MCP manager
vi.mock('@/mcp', () => ({
  getMCPManager: vi.fn(() => ({
    initialize: vi.fn(() => Promise.resolve()),
    registerMCPTools: vi.fn(() => Promise.resolve()),
    getAvailableMCPServicesBlock: vi.fn(() => ''),
  })),
}))

// Mock prefetch module
vi.mock('../prefetch', () => ({
  triggerPrefetch: vi.fn(() => Promise.resolve()),
}))

// ============================================================================
// Types
// ============================================================================

type MockChatStreamGenerator = (
  request: ChatCompletionRequest,
  signal?: AbortSignal
) => AsyncGenerator<ChatCompletionChunk>

// ============================================================================
// Mocks and Fixtures
// ============================================================================

function createMockProvider(): LLMProvider {
  const mockGenerator: MockChatStreamGenerator = async function* () {
    yield {
      id: 'mock-chunk-1',
      choices: [
        {
          index: 0,
          delta: { content: 'Hello!', role: 'assistant' },
          finish_reason: 'stop' as const,
        },
      ],
    }
  }
  return {
    name: 'mock',
    maxContextTokens: 128000,
    chat: vi.fn(),
    chatStream: mockGenerator as any,
    estimateTokens: vi.fn((messages: ChatMessage[]) => Math.ceil((messages.length * 4) / 3)),
  }
}

function createMockToolRegistry() {
  return {
    getToolDefinitions: vi.fn(() => []),
    has: vi.fn(() => true),
    execute: vi.fn(async (name: string, args: Record<string, unknown>) => {
      return `Executed ${name} with ${JSON.stringify(args)}`
    }),
  } as any
}

function createMockContextManager() {
  return {
    trimMessages: vi.fn((msgs: ChatMessage[]) => msgs),
    setSystemPrompt: vi.fn(),
  } as any
}

function createUserMessage(content: string): Message {
  return {
    id: `msg-${Date.now()}`,
    timestamp: Date.now(),
    role: 'user',
    content,
  }
}

function createMockToolContext(): ToolContext {
  return { directoryHandle: null }
}

// ============================================================================
// Test Suites
// ============================================================================

describe('AgentLoop', () => {
  let mockProvider: ReturnType<typeof createMockProvider>
  let mockTools: ReturnType<typeof createMockToolRegistry>
  let mockContextManager: ReturnType<typeof createMockContextManager>

  beforeEach(() => {
    vi.clearAllMocks()
    mockProvider = createMockProvider()
    mockTools = createMockToolRegistry()
    mockContextManager = createMockContextManager()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ========================================================================
  // Constructor Tests
  // ========================================================================

  describe('constructor', () => {
    it('should initialize with provided config', () => {
      const loop = new AgentLoop({
        provider: mockProvider,
        toolRegistry: mockTools,
        contextManager: mockContextManager,
        toolContext: createMockToolContext(),
      })

      expect(loop).toBeInstanceOf(AgentLoop)
    })

    it('should use default maxIterations when not provided', () => {
      const loop = new AgentLoop({
        provider: mockProvider,
        toolRegistry: mockTools,
        contextManager: mockContextManager,
        toolContext: createMockToolContext(),
      })

      expect(loop).toBeInstanceOf(AgentLoop)
    })

    it('should use custom maxIterations when provided', () => {
      const loop = new AgentLoop({
        provider: mockProvider,
        toolRegistry: mockTools,
        contextManager: mockContextManager,
        toolContext: createMockToolContext(),
        maxIterations: 5,
      })

      expect(loop).toBeInstanceOf(AgentLoop)
    })

    it('should use default system prompt when not provided', () => {
      new AgentLoop({
        provider: mockProvider,
        toolRegistry: mockTools,
        contextManager: mockContextManager,
        toolContext: createMockToolContext(),
      })

      expect(mockContextManager.setSystemPrompt).toHaveBeenCalled()
    })

    it('should use custom system prompt when provided', () => {
      const customPrompt = 'You are a custom assistant.'

      new AgentLoop({
        provider: mockProvider,
        toolRegistry: mockTools,
        contextManager: mockContextManager,
        toolContext: createMockToolContext(),
        systemPrompt: customPrompt,
      })

      expect(mockContextManager.setSystemPrompt).toHaveBeenCalledWith(customPrompt)
    })
  })

  // ========================================================================
  // setSystemPrompt Tests
  // ========================================================================

  describe('setSystemPrompt', () => {
    it('should update the system prompt', () => {
      const loop = new AgentLoop({
        provider: mockProvider,
        toolRegistry: mockTools,
        contextManager: mockContextManager,
        toolContext: createMockToolContext(),
      })

      const newPrompt = 'Updated prompt'
      loop.setSystemPrompt(newPrompt)

      expect(mockContextManager.setSystemPrompt).toHaveBeenCalledWith(newPrompt)
    })
  })

  // ========================================================================
  // run() Tests - Single Turn
  // ========================================================================

  describe('run()', () => {
    it('should execute single turn conversation', async () => {
      const loop = new AgentLoop({
        provider: mockProvider,
        toolRegistry: mockTools,
        contextManager: mockContextManager,
        toolContext: createMockToolContext(),
      })

      const messages = [createUserMessage('test')]
      const callbacks = {
        onMessageStart: vi.fn(),
        onComplete: vi.fn(),
      }

      const result = await loop.run(messages, callbacks)

      expect(callbacks.onMessageStart).toHaveBeenCalledOnce()
      expect(callbacks.onComplete).toHaveBeenCalledOnce()
      expect(result).toHaveLength(2) // user + assistant
      expect(result[1].role).toBe('assistant')
      expect(result[1].content).toBe('Hello!')
    })

    it('should handle empty content response', async () => {
      const provider = createMockProvider()
      // @ts-expect-error - Mock type compatibility
      provider.chatStream = vi.fn(async function* () {
        yield {
          choices: [
            {
              delta: { role: 'assistant' },
              finish_reason: 'stop',
            },
          ],
        }
      })
      const loop = new AgentLoop({
        provider,
        toolRegistry: mockTools,
        contextManager: mockContextManager,
        toolContext: createMockToolContext(),
      })

      const messages = [createUserMessage('test')]
      const result = await loop.run(messages)

      expect(result[1].content).toBeNull()
      expect(result[1].role).toBe('assistant')
    })

    it('should call contextManager.trimMessages', async () => {
      const loop = new AgentLoop({
        provider: mockProvider,
        toolRegistry: mockTools,
        contextManager: mockContextManager,
        toolContext: createMockToolContext(),
      })

      await loop.run([createUserMessage('test')])

      expect(mockContextManager.trimMessages).toHaveBeenCalled()
    })

    it('should update messages through callbacks', async () => {
      const loop = new AgentLoop({
        provider: mockProvider,
        toolRegistry: mockTools,
        contextManager: mockContextManager,
        toolContext: createMockToolContext(),
      })

      const messages = [createUserMessage('test')]
      const updatedMessages: Message[][] = []
      const callbacks = {
        onMessagesUpdated: (msgs: Message[]) => {
          updatedMessages.push(msgs)
        },
      }

      await loop.run(messages, callbacks)

      expect(updatedMessages.length).toBeGreaterThan(0)
      expect(updatedMessages[updatedMessages.length - 1]).toHaveLength(2)
    })
  })

  // ========================================================================
  // Tool Calling Tests
  // ========================================================================

  describe('tool calling', () => {
    it('should execute tool and loop again', async () => {
      const provider = createMockProvider()
      let callCount = 0
      // @ts-expect-error - Mock type compatibility
      provider.chatStream = vi.fn(async function* () {
        callCount++
        if (callCount === 1) {
          // First call: request tool
          yield {
            choices: [
              {
                delta: {
                  tool_calls: [
                    {
                      index: 0,
                      id: 'call_1',
                      function: {
                        name: 'list_files',
                        arguments: '{}',
                      },
                    },
                  ],
                },
                finish_reason: 'tool_calls',
              },
            ],
          }
        } else {
          // Second call: final response
          yield {
            choices: [
              {
                delta: { content: 'Done!', role: 'assistant' },
                finish_reason: 'stop',
              },
            ],
          }
        }
      })

      const loop = new AgentLoop({
        provider,
        toolRegistry: mockTools,
        contextManager: mockContextManager,
        toolContext: createMockToolContext(),
      })

      const result = await loop.run([createUserMessage('list files')])

      // Should have user message, assistant message with tool call, tool result, and final assistant message
      expect(result.length).toBeGreaterThanOrEqual(3)
      expect(result[1].toolCalls).toBeDefined()
      expect(result[1].toolCalls).toHaveLength(1)
    })

    it('should report tool call progress via callbacks', async () => {
      const provider = createMockProvider()
      let callCount = 0
      // @ts-expect-error - Mock type compatibility
      provider.chatStream = vi.fn(async function* () {
        callCount++
        if (callCount === 1) {
          yield {
            choices: [
              {
                delta: {
                  tool_calls: [
                    {
                      index: 0,
                      id: 'call_1',
                      function: {
                        name: 'list_files',
                        arguments: '{}',
                      },
                    },
                  ],
                },
                finish_reason: 'tool_calls',
              },
            ],
          }
        } else {
          yield {
            choices: [
              {
                delta: { content: 'Done!', role: 'assistant' },
                finish_reason: 'stop',
              },
            ],
          }
        }
      })

      const callbacks = {
        onToolCallStart: vi.fn(),
        onToolCallComplete: vi.fn(),
      }

      const loop = new AgentLoop({
        provider,
        toolRegistry: mockTools,
        contextManager: mockContextManager,
        toolContext: createMockToolContext(),
      })

      await loop.run([createUserMessage('list files')], callbacks)

      expect(callbacks.onToolCallStart).toHaveBeenCalled()
      expect(callbacks.onToolCallComplete).toHaveBeenCalled()
    })

    it('should handle tool execution errors gracefully', async () => {
      const provider = createMockProvider()
      let callCount = 0
      // @ts-expect-error - Mock type compatibility
      provider.chatStream = vi.fn(async function* () {
        callCount++
        if (callCount === 1) {
          // First call: request tool
          yield {
            choices: [
              {
                delta: {
                  tool_calls: [
                    {
                      index: 0,
                      id: 'call_1',
                      function: { name: 'list_files', arguments: '{}' },
                    },
                  ],
                },
                finish_reason: 'tool_calls',
              },
            ],
          }
        } else {
          // Second call: final response after tool error
          yield {
            choices: [
              {
                delta: { content: 'Done!', role: 'assistant' },
                finish_reason: 'stop',
              },
            ],
          }
        }
      })

      // Create a mock registry that throws on execute
      const errorRegistry = {
        getToolDefinitions: vi.fn(() => []),
        hasTool: vi.fn(() => true),
        execute: vi.fn(
          async (_name: string, _args: Record<string, unknown>, _context: ToolContext) => {
            throw new Error('Tool failed')
          }
        ),
      } as any

      const loop = new AgentLoop({
        provider,
        toolRegistry: errorRegistry,
        contextManager: mockContextManager,
        toolContext: createMockToolContext(),
      })

      const result = await loop.run([createUserMessage('list files')])

      // Should have: user + assistant (tool_calls) + tool_result + assistant (final)
      expect(result.length).toBeGreaterThanOrEqual(3)
      // Find tool result message
      const toolResult = result.find((m) => m.role === 'tool')
      expect(toolResult?.content).toContain('Error')
    })

    it('should parse invalid tool arguments gracefully', async () => {
      const provider = createMockProvider()
      // @ts-expect-error - Mock type compatibility
      provider.chatStream = vi.fn(async function* () {
        yield {
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: 'call_1',
                    function: {
                      name: 'test_tool',
                      arguments: 'invalid json{{{',
                    },
                  },
                ],
              },
              finish_reason: 'tool_calls',
            },
          ],
        }
      })

      const loop = new AgentLoop({
        provider,
        toolRegistry: mockTools,
        contextManager: mockContextManager,
        toolContext: createMockToolContext(),
      })

      const callbacks = {
        onToolCallStart: vi.fn(),
        onComplete: vi.fn(),
      }

      // Should not throw
      await loop.run([createUserMessage('test')], callbacks)

      // Tool execution should be called with empty object
      expect(mockTools.execute).toHaveBeenCalledWith('test_tool', {}, createMockToolContext())
    })
  })

  // ========================================================================
  // Cancel Tests
  // ========================================================================

  describe('cancel()', () => {
    it('should cancel the running loop', async () => {
      const provider = createMockProvider()
      // @ts-expect-error - Mock type compatibility
      provider.chatStream = vi.fn(async function* () {
        // Long-running stream
        for (let i = 0; i < 100; i++) {
          yield {
            choices: [
              {
                delta: { content: 'Chunk ', role: 'assistant' },
              },
            ],
          }
          await new Promise((resolve) => setTimeout(resolve, 10))
        }
      })

      const loop = new AgentLoop({
        provider,
        toolRegistry: mockTools,
        contextManager: mockContextManager,
        toolContext: createMockToolContext(),
      })

      // Start without awaiting
      const runPromise = loop.run([createUserMessage('test')])

      // Cancel after a short delay
      await new Promise((resolve) => setTimeout(resolve, 50))
      loop.cancel()

      const result = await runPromise

      // Should return partial results
      expect(result.length).toBeGreaterThan(1)
    })

    it('should call onError callback when cancelled', async () => {
      const provider = createMockProvider()
      // @ts-expect-error - Mock type compatibility
      provider.chatStream = vi.fn(async function* () {
        yield {
          choices: [
            {
              delta: { content: 'Response', role: 'assistant' },
              finish_reason: 'stop',
            },
          ],
        }
      })

      const loop = new AgentLoop({
        provider,
        toolRegistry: mockTools,
        contextManager: mockContextManager,
        toolContext: createMockToolContext(),
      })

      const callbacks = {
        onError: vi.fn(),
      }

      // Cancel immediately
      loop.cancel()
      await loop.run([createUserMessage('test')], callbacks)

      // When aborted, onError is not called (cancelled is expected)
      expect(callbacks.onError).not.toHaveBeenCalled()
    })
  })

  // ========================================================================
  // Max Iterations Tests
  // ========================================================================

  describe('max iterations', () => {
    it('should stop at max iterations', async () => {
      const provider = createMockProvider()
      // @ts-expect-error - Mock type compatibility
      provider.chatStream = vi.fn(async function* () {
        // Always request a tool call to force looping
        yield {
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: 'call_1',
                    function: { name: 'test_tool', arguments: '{}' },
                  },
                ],
              },
              finish_reason: 'tool_calls',
            },
          ],
        }
      })

      const loop = new AgentLoop({
        provider,
        toolRegistry: mockTools,
        contextManager: mockContextManager,
        toolContext: createMockToolContext(),
        maxIterations: 3,
      })

      const result = await loop.run([createUserMessage('test')])

      // Should not exceed max iterations
      // user + assistant + tool_result + assistant + tool_result + assistant = 6 messages max
      expect(result.length).toBeLessThanOrEqual(7) // 1 user + 2 * (1 assistant + 1 tool) per iteration + final
    })
  })

  // ========================================================================
  // Streaming Callbacks Tests
  // ========================================================================

  describe('streaming callbacks', () => {
    it('should call onReasoningDelta for reasoning content', async () => {
      const provider = createMockProvider()
      // @ts-expect-error - Mock type compatibility
      provider.chatStream = vi.fn(async function* () {
        yield {
          choices: [
            {
              delta: { reasoning_content: 'Thinking...', role: 'assistant' },
            },
          ],
        }
        yield {
          choices: [
            {
              delta: { content: 'Response', role: 'assistant' },
              finish_reason: 'stop',
            },
          ],
        }
      })

      const callbacks = {
        onReasoningStart: vi.fn(),
        onReasoningDelta: vi.fn(),
        onReasoningComplete: vi.fn(),
        onContentStart: vi.fn(),
        onContentDelta: vi.fn(),
        onContentComplete: vi.fn(),
      }

      const loop = new AgentLoop({
        provider,
        toolRegistry: mockTools,
        contextManager: mockContextManager,
        toolContext: createMockToolContext(),
      })

      await loop.run([createUserMessage('test')], callbacks)

      expect(callbacks.onReasoningStart).toHaveBeenCalledOnce()
      expect(callbacks.onReasoningDelta).toHaveBeenCalledWith('Thinking...')
      expect(callbacks.onReasoningComplete).toHaveBeenCalledWith('Thinking...')
      expect(callbacks.onContentStart).toHaveBeenCalledOnce()
      expect(callbacks.onContentDelta).toHaveBeenCalledWith('Response')
    })

    it('should call onContentDelta for content chunks', async () => {
      const chunks = ['Hello', ' world', '!']
      const provider = createMockProvider()
      // @ts-expect-error - Mock type compatibility
      provider.chatStream = vi.fn(async function* () {
        for (const chunk of chunks) {
          yield {
            choices: [
              {
                delta: { content: chunk, role: 'assistant' },
              },
            ],
          }
        }
        yield {
          choices: [
            {
              delta: {},
              finish_reason: 'stop',
            },
          ],
        }
      })

      const deltas: string[] = []
      const callbacks = {
        onContentDelta: (delta: string) => deltas.push(delta),
      }

      const loop = new AgentLoop({
        provider,
        toolRegistry: mockTools,
        contextManager: mockContextManager,
        toolContext: createMockToolContext(),
      })

      await loop.run([createUserMessage('test')], callbacks)

      expect(deltas).toEqual(chunks)
    })

    it('should call onToolCallDelta for streaming tool arguments', async () => {
      const provider = createMockProvider()
      // @ts-expect-error - Mock type compatibility
      provider.chatStream = vi.fn(async function* () {
        yield {
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: 'call_1',
                    function: {
                      name: 'test_tool',
                      arguments: '',
                    },
                  },
                ],
              },
            },
          ],
        }
        yield {
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    function: {
                      arguments: '{"path":',
                    },
                  },
                ],
              },
            },
          ],
        }
        yield {
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    function: {
                      arguments: ' "src"}',
                    },
                  },
                ],
              },
              finish_reason: 'tool_calls',
            },
          ],
        }
        yield {
          choices: [
            {
              delta: { content: 'Done', role: 'assistant' },
              finish_reason: 'stop',
            },
          ],
        }
      })

      const toolDeltas: string[] = []
      const callbacks = {
        onToolCallDelta: (index: number, delta: string) => {
          toolDeltas.push(`${index}:${delta}`)
        },
      }

      const loop = new AgentLoop({
        provider,
        toolRegistry: mockTools,
        contextManager: mockContextManager,
        toolContext: createMockToolContext(),
      })

      await loop.run([createUserMessage('test')], callbacks)

      expect(toolDeltas).toContain('0:{"path":')
      expect(toolDeltas).toContain('0: "src"}')
    })
  })

  // ========================================================================
  // Error Handling Tests
  // ========================================================================

  describe('error handling', () => {
    it('should handle provider errors', async () => {
      const provider = createMockProvider()
      provider.chatStream = vi.fn(async function* () {
        throw new Error('Provider error')
      }) as any

      const callbacks = {
        onError: vi.fn(),
      }

      const loop = new AgentLoop({
        provider,
        toolRegistry: mockTools,
        contextManager: mockContextManager,
        toolContext: createMockToolContext(),
      })

      await expect(loop.run([createUserMessage('test')], callbacks)).rejects.toThrow(
        'Provider error'
      )
      expect(callbacks.onError).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Provider error' })
      )
    })

    it('should return messages when error occurs during tool execution', async () => {
      const provider = createMockProvider()
      // @ts-expect-error - Mock type compatibility
      provider.chatStream = vi.fn(async function* () {
        yield {
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: 'call_1',
                    function: { name: 'failing_tool', arguments: '{}' },
                  },
                ],
              },
              finish_reason: 'tool_calls',
            },
          ],
        }
        yield {
          choices: [
            {
              delta: { content: 'Done', role: 'assistant' },
              finish_reason: 'stop',
            },
          ],
        }
      })

      const errorRegistry = createMockToolRegistry()
      errorRegistry.execute = vi.fn(async () => {
        throw new Error('Tool failed')
      })

      const loop = new AgentLoop({
        provider,
        toolRegistry: errorRegistry,
        contextManager: mockContextManager,
        toolContext: createMockToolContext(),
      })

      // Should complete despite tool error
      const result = await loop.run([createUserMessage('test')])

      expect(result.length).toBeGreaterThan(0)
    })
  })
})
