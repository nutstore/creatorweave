/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * 测试工具函数库
 *
 * 提供 Mock 对象、测试辅助函数等
 */

import { renderHook } from '@testing-library/react'
import { vi } from 'vitest'

// ============================================================================
// Mock 对象工厂
// ============================================================================

/**
 * 创建假的 FileSystemDirectoryHandle
 *
 * @example
 * const mockHandle = createMockDirHandle({
 *   'file.txt': { size: 1000, type: 'file' },
 *   'subdir': { size: 0, type: 'directory' }
 * })
 */
export function createMockDirHandle(
  entries: Record<string, { size: number; type: 'file' | 'directory' }>
): FileSystemDirectoryHandle {
  const mockHandle = {
    name: 'mock-directory',
    kind: 'directory' as const,
    entries: vi.fn(async function* () {
      for (const [name, info] of Object.entries(entries)) {
        if (info.type === 'file') {
          yield [name, createMockFileHandle(name, info.size)] as [string, FileSystemFileHandle]
        } else {
          yield [name, createMockDirHandle({})] as [string, FileSystemDirectoryHandle]
        }
      }
    }),
    getDirectoryHandle: vi.fn(async (name: string) => {
      const entry = entries[name]
      if (entry?.type === 'directory') {
        return createMockDirHandle({})
      }
      throw new DOMException('Not found', 'NotFoundError')
    }),
    getFileHandle: vi.fn(async (name: string) => {
      const entry = entries[name]
      if (entry?.type === 'file') {
        return createMockFileHandle(name, entry.size)
      }
      throw new DOMException('Not found', 'NotFoundError')
    }),
    queryPermission: vi.fn(async () => 'granted' as const),
    requestPermission: vi.fn(async () => 'granted' as const),
    isSameEntry: vi.fn(async () => false),
    removeEntry: vi.fn(async () => {}),
    resolve: vi.fn(async () => null),
  }

  return mockHandle as unknown as FileSystemDirectoryHandle
}

/**
 * 创建假的 FileSystemFileHandle
 */
export function createMockFileHandle(
  name: string,
  size: number,
  content: string = ''
): FileSystemFileHandle {
  const mockFile = {
    name,
    kind: 'file' as const,
    getFile: vi.fn(async () => ({
      name,
      size,
      type: 'text/plain',
      lastModified: Date.now(),
      text: async () => content,
      arrayBuffer: async () => new ArrayBuffer(size),
      stream: async () => new ReadableStream(),
      slice: async () => null,
    })),
  }

  return mockFile as unknown as FileSystemFileHandle
}

/**
 * 创建假的 Zustand store
 *
 * @example
 * const mockStore = createMockStore({ count: 0, name: 'test' })
 * mockStore.setState({ count: 1 })
 * mockStore.getState().count // 1
 */
export function createMockStore<T extends object>(initialState: T) {
  let state = initialState
  const listeners = new Set<() => void>()

  return {
    getState: () => state,
    setState: (partial: Partial<T> | ((state: T) => Partial<T>)) => {
      const newState =
        typeof partial === 'function' ? (partial as (state: T) => Partial<T>)(state) : partial
      state = { ...state, ...newState }
      listeners.forEach((listener) => listener())
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    destroy: () => {
      listeners.clear()
    },
  }
}

/**
 * 创建假的 Worker
 *
 * @example
 * const { worker, postMessage, on } = createMockWorker()
 * postMessage({ type: 'START' })
 * on('message', (data) => console.log(data))
 */
export function createMockWorker() {
  type WorkerHandler = (event: { data: unknown }) => void
  const handlers = new Map<string, WorkerHandler[]>()

  const worker = {
    postMessage: vi.fn((data: any) => {
      const messageHandlers = handlers.get('message')
      messageHandlers?.forEach((handler) => handler({ data }))
    }),
    terminate: vi.fn(),
    addEventListener: vi.fn((event: string, handler: WorkerHandler) => {
      if (!handlers.has(event)) {
        handlers.set(event, [])
      }
      handlers.get(event)!.push(handler)
    }),
    removeEventListener: vi.fn((event: string, handler: WorkerHandler) => {
      const eventHandlers = handlers.get(event)
      if (eventHandlers) {
        const index = eventHandlers.indexOf(handler)
        if (index > -1) {
          eventHandlers.splice(index, 1)
        }
      }
    }),
    dispatchEvent: vi.fn(),
    // 测试辅助方法
    _emit: (event: string, data: any) => {
      const eventHandlers = handlers.get(event)
      eventHandlers?.forEach((handler) => handler({ data }))
    },
    _clearHandlers: () => {
      handlers.clear()
    },
  }

  return {
    worker,
    postMessage: worker.postMessage,
    on: (event: string, handler: WorkerHandler) => {
      worker.addEventListener(event, handler)
    },
    off: (event: string, handler: WorkerHandler) => {
      worker.removeEventListener(event, handler)
    },
    emit: worker._emit,
    clear: worker._clearHandlers,
  }
}

/**
 * 创建假的 LLM Provider
 */
export function createMockLLMProvider() {
  return {
    chat: vi.fn(),
    streamChat: vi.fn(),
    maxContextTokens: 128000,
  }
}

/**
 * 创建假的 ToolRegistry
 */
export function createMockToolRegistry() {
  const mockTools = new Map()

  return {
    getTool: vi.fn((name: string) => mockTools.get(name)),
    listTools: vi.fn(() => Array.from(mockTools.keys())),
    registerTool: vi.fn((name: string, tool: any) => {
      mockTools.set(name, tool)
    }),
    unregisterTool: vi.fn((name: string) => {
      mockTools.delete(name)
    }),
    hasTool: vi.fn((name: string) => mockTools.has(name)),
  }
}

/**
 * 创建假的 ContextManager
 */
export function createMockContextManager() {
  return {
    buildContext: vi.fn(async () => ({ messages: [], tokens: 0 })),
    estimateTokens: vi.fn((text: string) => Math.ceil(text.length / 3)),
    maxContextTokens: 128000,
    reserveTokens: 4096,
  }
}

// ============================================================================
// 异步测试辅助函数
// ============================================================================

/**
 * 等待条件成立
 *
 * @example
 * await waitFor(() => store.getState().count > 0)
 */
export async function waitFor(
  condition: () => boolean,
  options: { timeout?: number; interval?: number } = {}
): Promise<void> {
  const { timeout = 5000, interval = 10 } = options
  const startTime = Date.now()

  while (!condition()) {
    if (Date.now() - startTime > timeout) {
      throw new Error(`Timeout waiting for condition after ${timeout}ms`)
    }
    await new Promise((resolve) => setTimeout(resolve, interval))
  }
}

/**
 * 等待元素出现
 */
export async function waitForElement<T>(
  getter: () => T | null | undefined,
  options?: { timeout?: number }
): Promise<T> {
  const { timeout = 5000 } = options || {}
  const startTime = Date.now()

  while (Date.now() - startTime <= timeout) {
    const element = getter()
    if (element != null) {
      return element
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }

  throw new Error(`Element not found after ${timeout}ms`)
}

/**
 * 等待指定时间
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * 等待所有 pending 的 Promise 完成
 */
export async function waitForMicrotasks(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await new Promise((resolve) => setImmediate(resolve))
}

// ============================================================================
// Store 测试辅助函数
// ============================================================================

/**
 * 渲染 store hook 并返回辅助方法
 *
 * @example
 * const { store, getState, setState } = renderStoreHook(() => useConversationStore())
 */
export function renderStoreHook<T>(hook: () => T) {
  const { result, rerender } = renderHook(hook)

  return {
    result,
    rerender,
    getState: () => {
      const state = result.current
      // 处理 Zustand store
      if (state && typeof state === 'object' && 'getState' in state) {
        return (state as any).getState()
      }
      return state
    },
    setState: (update: any) => {
      const state = result.current
      // 处理 Zustand store
      if (state && typeof state === 'object' && 'setState' in state) {
        (state as any).setState(update)
      }
    },
  }
}

/**
 * 重置 store 状态
 */
export function resetStore(store: any) {
  if (store && typeof store.setState === 'function') {
    store.setState({
      conversations: [],
      activeConversationId: null,
      loaded: true,
      // 根据具体 store 调整
    })
  }
}

// ============================================================================
// 事件测试辅助函数
// ============================================================================

/**
 * 创建 Mock 事件
 */
export function createMockEvent<T extends Event = Event>(type: string, properties?: Partial<T>): T {
  return {
    type,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    defaultPrevented: false,
    ...properties,
  } as unknown as T
}

/**
 * 模拟用户输入事件
 */
export function createMockInputEvent(value: string) {
  return {
    target: { value },
    currentTarget: { value },
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as unknown as React.ChangeEvent<HTMLInputElement>
}

// ============================================================================
// 时间测试辅助函数
// ============================================================================

/**
 * Mock 定时器
 */
export function mockTimers() {
  vi.useFakeTimers()
}

/**
 * 恢复真实定时器
 */
export function restoreTimers() {
  vi.useRealTimers()
}

/**
 * 快进时间
 */
export async function advanceTimers(ms: number) {
  vi.advanceTimersByTime(ms)
  await waitForMicrotasks()
}

// ============================================================================
// 性能测试辅助函数
// ============================================================================

/**
 * 测量函数执行时间
 */
export async function measureTime<T>(
  fn: () => T | Promise<T>
): Promise<{ result: T; duration: number }> {
  const start = performance.now()
  const result = await fn()
  const duration = performance.now() - start
  return { result, duration }
}

/**
 * 测量内存使用 (需要在支持 performance.measureUserAgentSpecificMemory() 的环境中)
 */
export async function measureMemory(): Promise<number> {
  // @ts-ignore
  if (performance.measureUserAgentSpecificMemory) {
    // @ts-ignore
    const memory = await performance.measureUserAgentSpecificMemory()
    return memory.bytes
  }
  return 0
}

// ============================================================================
// 断言辅助函数
// ============================================================================

/**
 * 断言元素存在
 */
export function assertExists<T>(value: T | null | undefined, message?: string): asserts value is T {
  if (value == null) {
    throw new Error(message || `Expected value to exist, but received ${value}`)
  }
}

/**
 * 断言函数被调用
 */
export function assertCalled(fn: ReturnType<typeof vi.fn>, times = 1): void {
  // 使用 vitest 的 vi.fn 进行断言
  const mock = fn as any
  if (mock._isMockFunction) {
    const actualTimes = mock.mock.calls.length
    if (actualTimes !== times) {
      throw new Error(
        `Expected function to be called ${times} times, but was called ${actualTimes} times`
      )
    }
  }
}

/**
 * 断言函数未调用
 */
export function assertNotCalled(fn: ReturnType<typeof vi.fn>): void {
  const mock = fn as any
  if (mock._isMockFunction && mock.mock.calls.length > 0) {
    throw new Error(
      `Expected function not to be called, but was called ${mock.mock.calls.length} times`
    )
  }
}

// ============================================================================
// 快照测试辅助函数
// ============================================================================

/**
 * 创建带快照的测试
 * 注意：使用此函数需要在测试文件中导入 expect
 */
export function createSnapshotTest(name: string, _component: React.ReactNode) {
  // 快照测试需要在测试文件中使用 it() 和 expect()
  // 这里仅作为占位符，实际使用时在测试文件中编写
  return name
}

// ============================================================================
// 导出所有工具
// ============================================================================

export const testHelpers = {
  // Mock 对象工厂
  createMockDirHandle,
  createMockFileHandle,
  createMockStore,
  createMockWorker,
  createMockLLMProvider,
  createMockToolRegistry,
  createMockContextManager,

  // 异步辅助函数
  waitFor,
  waitForElement,
  delay,
  waitForMicrotasks,

  // Store 辅助函数
  renderStoreHook,
  resetStore,

  // 事件辅助函数
  createMockEvent,
  createMockInputEvent,

  // 时间辅助函数
  mockTimers,
  restoreTimers,
  advanceTimers,

  // 性能辅助函数
  measureTime,
  measureMemory,

  // 断言辅助函数
  assertExists,
  assertCalled,
  assertNotCalled,
}
