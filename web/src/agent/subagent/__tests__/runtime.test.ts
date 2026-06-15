import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Message } from '@/agent/message-types'
import type {
  SubagentStepNotification,
  SubagentTaskNotification,
  SubagentRuntime,
} from '@/agent/tools/tool-types'
import { __resetSubagentRuntimeRegistryForTests, getOrCreateSubagentRuntime } from '@/agent/subagent/runtime'

const hoisted = vi.hoisted(() => {
  const repo = {
    findByWorkspaceId: vi.fn(async () => []),
    saveBatch: vi.fn(async () => {}),
    transitionStatus: vi.fn(async () => ({ applied: true })),
    getStatus: vi.fn(async () => null),
  }

  const loopConfigs: any[] = []
  let runImpl: (messages: Message[], config: any) => Promise<Message[]> = async (messages) => messages

  return {
    repo,
    loopConfigs,
    setRunImpl: (impl: (messages: Message[], config: any) => Promise<Message[]>) => {
      runImpl = impl
    },
    getRunImpl: () => runImpl,
  }
})

vi.mock('@/sqlite', () => ({
  getSubagentRepository: () => hoisted.repo,
}))

vi.mock('@/agent/agent-loop', () => {
  class MockAgentLoop {
    private config: any

    constructor(config: any) {
      this.config = config
      hoisted.loopConfigs.push(config)
    }

    cancel(): void {
      // no-op in tests; run completion is controlled by deferred promises
    }

    async run(messages: Message[]): Promise<Message[]> {
      return hoisted.getRunImpl()(messages, this.config)
    }
  }

  return { AgentLoop: MockAgentLoop }
})

function createAssistantMessage(content: string): Message {
  return {
    id: `assistant-${Date.now()}`,
    role: 'assistant',
    content,
    timestamp: Date.now(),
    usage: {
      promptTokens: 10,
      completionTokens: 20,
      totalTokens: 30,
    },
  }
}

function createStoredTask(input: {
  workspaceId: string
  agentId: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'killed'
  name?: string
  messages?: Message[]
  queue?: Array<{ message: string; enqueued_at: number }>
}): Record<string, unknown> {
  const now = Date.now()
  return {
    agentId: input.agentId,
    workspaceId: input.workspaceId,
    name: input.name,
    description: 'persisted task',
    status: input.status,
    mode: 'act',
    messages: input.messages || [],
    queue: input.queue || [],
    usage: undefined,
    error: undefined,
    stopped: false,
    created_at: now - 5000,
    updated_at: now - 1000,
    last_activity_at: now - 1000,
  }
}

/** Type guard: filter union array to SubagentTaskNotification entries only. */
function taskNotifications(
  events: (SubagentTaskNotification | SubagentStepNotification)[]
): SubagentTaskNotification[] {
  return events.filter(
    (e): e is SubagentTaskNotification => e.event_type === 'task_notification'
  )
}

function createRuntime(
  workspaceId: string,
  notifications: (SubagentTaskNotification | SubagentStepNotification)[]
): SubagentRuntime {
  return getOrCreateSubagentRuntime({
    workspaceId,
    provider: {} as any,
    toolRegistry: {} as any,
    contextManager: {
      getConfig: () => ({
        maxContextTokens: 128000,
        reserveTokens: 4096,
        enableSummarization: false,
        maxMessageGroups: 20,
      }),
    } as any,
    baseToolContext: {
      directoryHandle: null,
      workspaceId,
      agentMode: 'act',
    },
    onNotification: (event) => notifications.push(event),
  })
}

async function waitForStatus(runtime: SubagentRuntime, agentIdOrName: string, status: string): Promise<void> {
  for (let i = 0; i < 20; i += 1) {
    const current = await runtime.getStatus({ agentId: agentIdOrName })
    if (current.status === status) return
    await Promise.resolve()
  }
  throw new Error(`status did not reach ${status}`)
}

describe('subagent runtime', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    __resetSubagentRuntimeRegistryForTests()
    hoisted.loopConfigs.length = 0
    hoisted.repo.findByWorkspaceId.mockImplementation(async () => [])
    hoisted.repo.transitionStatus.mockImplementation(async () => ({ applied: true }))
    hoisted.repo.getStatus.mockImplementation(async () => null)
    hoisted.setRunImpl(async (messages) => [...messages, createAssistantMessage('ok')])
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('spawn blocks until completion and returns result', async () => {
    const notifications: (SubagentTaskNotification | SubagentStepNotification)[] = []
    const runtime = createRuntime(`workspace-blocking-${Date.now()}`, notifications)
    const result = await runtime.spawn({
      description: 'blocking test',
      prompt: 'run',
    })
    expect(result.status).toBe('completed')
    expect(result.content).toBe('ok')
    expect(result.agentId).toBeTruthy()
    expect(result.usage).toBeDefined()
    expect(taskNotifications(notifications).some((event) => event.status === 'completed')).toBe(true)
  })

  it('releases name after spawn completes so it can be reused', async () => {
    const notifications: (SubagentTaskNotification | SubagentStepNotification)[] = []
    const runtime = createRuntime(`workspace-name-reuse-${Date.now()}`, notifications)

    const first = await runtime.spawn({
      description: 'first run',
      prompt: 'do something',
      name: 'my-agent',
    })
    expect(first.status).toBe('completed')

    // Name should be released — second spawn with same name should work
    const second = await runtime.spawn({
      description: 'second run',
      prompt: 'do something else',
      name: 'my-agent',
    })
    expect(second.status).toBe('completed')
    expect(second.agentId).not.toBe(first.agentId)
  })

  it('cleans up completed task from memory after spawn', async () => {
    const runtime = createRuntime(`workspace-cleanup-${Date.now()}`, [])
    const result = await runtime.spawn({
      description: 'cleanup test',
      prompt: 'run',
    })
    // Task should be removed — getStatus should throw TASK_NOT_FOUND
    try {
      await runtime.getStatus({ agentId: result.agentId })
      expect.unreachable('should have thrown')
    } catch (e: any) {
      expect(e.code).toBe('TASK_NOT_FOUND')
    }
  })

  it('spawn throws when subagent times out', async () => {
    let resolveRun = () => {}
    hoisted.setRunImpl(
      (messages) =>
        new Promise<Message[]>((resolve) => {
          resolveRun = () => resolve([...messages, createAssistantMessage('late')])
        })
    )

    const notifications: (SubagentTaskNotification | SubagentStepNotification)[] = []
    const runtime = createRuntime(`workspace-timeout-${Date.now()}`, notifications)

    // Start spawn without awaiting — it blocks until subagent completes
    const spawnPromise = runtime.spawn({
      description: 'timeout test',
      prompt: 'run',
      timeout_ms: 10,
    })

    // Advance timers to trigger the timeout
    await vi.advanceTimersByTimeAsync(20)

    // Resolve the run so processQueue can complete
    resolveRun()

    // spawn should throw because task timed out
    try {
      await spawnPromise
      expect.unreachable('should have thrown')
    } catch (e: any) {
      expect(e.code).toBe('SUBAGENT_TIMEOUT')
    }

    expect(
      taskNotifications(notifications).some(
        (event) => event.status === 'failed' && event.exit_reason === 'timeout'
      )
    ).toBe(true)
  })

  it('spawn throws when subagent fails', async () => {
    hoisted.setRunImpl(() => {
      throw new Error('something went wrong')
    })

    const notifications: (SubagentTaskNotification | SubagentStepNotification)[] = []
    const runtime = createRuntime(`workspace-fail-${Date.now()}`, notifications)

    try {
      await runtime.spawn({
        description: 'fail test',
        prompt: 'run',
      })
      expect.unreachable('should have thrown')
    } catch (e: any) {
      expect(e.message).toContain('failed')
    }

    expect(taskNotifications(notifications).some((event) => event.status === 'failed')).toBe(true)
  })

  it('rejects enqueue when queue is full', async () => {
    hoisted.setRunImpl(() => new Promise<Message[]>(() => {}))

    const notifications: (SubagentTaskNotification | SubagentStepNotification)[] = []
    const runtime = createRuntime(`workspace-queue-full-${Date.now()}`, notifications)

    // Start spawn without awaiting (it blocks until completion)
    runtime.spawn({
      description: 'queue full test',
      prompt: 'run',
      name: 'queue-test-agent',
    }).catch(() => {})

    await waitForStatus(runtime, 'queue-test-agent', 'running')

    for (let i = 0; i < 100; i += 1) {
      const result = await runtime.sendMessage({ to: 'queue-test-agent', message: `msg-${i}` })
      expect(result.success).toBe(true)
    }

    const overflow = await runtime.sendMessage({ to: 'queue-test-agent', message: 'overflow', timeout_ms: 0 })
    expect(overflow.success).toBe(false)
    expect(overflow.message).toBe('QUEUE_FULL')
  })

  it('waits for enqueue timeout before returning QUEUE_FULL', async () => {
    hoisted.setRunImpl(() => new Promise<Message[]>(() => {}))

    const notifications: (SubagentTaskNotification | SubagentStepNotification)[] = []
    const runtime = createRuntime(`workspace-enqueue-timeout-${Date.now()}`, notifications)

    runtime.spawn({
      description: 'enqueue timeout test',
      prompt: 'run',
      name: 'enqueue-test-agent',
    }).catch(() => {})

    await waitForStatus(runtime, 'enqueue-test-agent', 'running')

    for (let i = 0; i < 100; i += 1) {
      const result = await runtime.sendMessage({ to: 'enqueue-test-agent', message: `msg-${i}`, timeout_ms: 0 })
      expect(result.success).toBe(true)
    }

    let settled = false
    let queueResult: { success: boolean; message: string } = { success: true, message: '' }
    const pending = runtime
      .sendMessage({ to: 'enqueue-test-agent', message: 'overflow', timeout_ms: 30 })
      .then((value) => {
        settled = true
        queueResult = value
      })
    await Promise.resolve()
    expect(settled).toBe(false)

    await vi.advanceTimersByTimeAsync(29)
    expect(settled).toBe(false)

    await vi.advanceTimersByTimeAsync(1)
    await pending
    expect(settled).toBe(true)
    expect(queueResult.success).toBe(false)
    expect(queueResult.message).toBe('QUEUE_FULL')
  })

  it('drops expired queued messages before enqueueing new ones', async () => {
    hoisted.setRunImpl(() => new Promise<Message[]>(() => {}))

    const notifications: (SubagentTaskNotification | SubagentStepNotification)[] = []
    const runtime = createRuntime(`workspace-queue-timeout-${Date.now()}`, notifications)

    runtime.spawn({
      description: 'queue timeout test',
      prompt: 'run',
      name: 'expire-test-agent',
    }).catch(() => {})

    await waitForStatus(runtime, 'expire-test-agent', 'running')

    const first = await runtime.sendMessage({ to: 'expire-test-agent', message: 'stale' })
    expect(first.success).toBe(true)

    await vi.advanceTimersByTimeAsync(300001)

    const second = await runtime.sendMessage({ to: 'expire-test-agent', message: 'fresh' })
    expect(second.success).toBe(true)

    const status = await runtime.getStatus({ agentId: 'expire-test-agent' })
    expect(status.queue_depth).toBe(1)
  })

  it('keeps killed status when stop wins race against late completion', async () => {
    let resolveRun = () => {}
    hoisted.setRunImpl(
      (messages) =>
        new Promise<Message[]>((resolve) => {
          resolveRun = () => resolve([...messages, createAssistantMessage('completed late')])
        })
    )

    const notifications: (SubagentTaskNotification | SubagentStepNotification)[] = []
    const runtime = createRuntime(`workspace-race-${Date.now()}`, notifications)

    // Start spawn without awaiting
    runtime.spawn({
      description: 'race test',
      prompt: 'run',
      name: 'race-test-agent',
    }).catch(() => {})

    await waitForStatus(runtime, 'race-test-agent', 'running')
    const status = await runtime.getStatus({ agentId: 'race-test-agent' })
    const agentId = status.agentId

    const stopping = runtime.stop({ agentId, timeout_ms: 100 })
    resolveRun()
    await stopping

    const finalStatus = await runtime.getStatus({ agentId })
    expect(finalStatus.status).toBe('killed')
    const taskNotifs = taskNotifications(notifications)
    expect(taskNotifs.some((event) => event.status === 'killed')).toBe(true)
    expect(taskNotifs.some((event) => event.status === 'completed')).toBe(false)
  })

  it('escalates soft stop to forced kill when cleanup timeout is reached', async () => {
    hoisted.setRunImpl(() => new Promise<Message[]>(() => {}))

    const notifications: (SubagentTaskNotification | SubagentStepNotification)[] = []
    const runtime = createRuntime(`workspace-stop-timeout-${Date.now()}`, notifications)

    runtime.spawn({
      description: 'stop timeout test',
      prompt: 'run',
      name: 'stop-test-agent',
    }).catch(() => {})

    await waitForStatus(runtime, 'stop-test-agent', 'running')
    const status = await runtime.getStatus({ agentId: 'stop-test-agent' })
    const agentId = status.agentId

    let stopped = false
    const stopping = runtime.stop({ agentId, timeout_ms: 40 }).then(() => {
      stopped = true
    })
    await Promise.resolve()
    expect(stopped).toBe(false)

    await vi.advanceTimersByTimeAsync(40)
    await stopping

    const finalStatus = await runtime.getStatus({ agentId })
    expect(finalStatus.status).toBe('killed')
    expect(finalStatus.error?.code).toBe('STOPPED_FORCE_TIMEOUT')
  })

  it('sends running notification only when a tool call happens', async () => {
    hoisted.setRunImpl(async (messages) => [...messages, createAssistantMessage('no tools used')])

    const notifications: (SubagentTaskNotification | SubagentStepNotification)[] = []
    const runtime = createRuntime(`workspace-running-notify-${Date.now()}`, notifications)
    await runtime.spawn({
      description: 'no tool call',
      prompt: 'run',
    })

    expect(taskNotifications(notifications).some((event) => event.status === 'running')).toBe(false)
  })

  it('hydrates running task as failed with SESSION_INTERRUPTED and supports alias lookup', async () => {
    const workspaceId = `workspace-hydrate-running-${Date.now()}`
    hoisted.repo.findByWorkspaceId.mockResolvedValueOnce([
      createStoredTask({
        workspaceId,
        agentId: 'subagent_persisted_1',
        status: 'running',
        name: 'persisted-alias',
        queue: [{ message: 'queued-before-restart', enqueued_at: Date.now() - 1000 }],
      }),
    ] as any)
    hoisted.setRunImpl(() => new Promise<Message[]>(() => {}))

    const notifications: (SubagentTaskNotification | SubagentStepNotification)[] = []
    const runtime = createRuntime(workspaceId, notifications)
    const status = await runtime.getStatus({ agentId: 'persisted-alias' })
    expect(status.status).toBe('failed')
    expect(status.error?.code).toBe('SESSION_INTERRUPTED')

    const resumed = await runtime.sendMessage({ to: 'persisted-alias', message: 'resume work' })
    expect(resumed.success).toBe(true)
    expect(resumed.resumed).toBe(true)
  })

  it('hydrates pending task as failed and preserves transcript count for resume', async () => {
    const workspaceId = `workspace-hydrate-pending-${Date.now()}`
    hoisted.repo.findByWorkspaceId.mockResolvedValueOnce([
      createStoredTask({
        workspaceId,
        agentId: 'subagent_persisted_2',
        status: 'pending',
        messages: [
          {
            id: 'u1',
            role: 'user',
            content: 'first',
            timestamp: Date.now() - 3000,
          },
          {
            id: 'a1',
            role: 'assistant',
            content: 'answer',
            timestamp: Date.now() - 2000,
          },
        ],
      }),
    ] as any)

    const notifications: (SubagentTaskNotification | SubagentStepNotification)[] = []
    const runtime = createRuntime(workspaceId, notifications)
    const status = await runtime.getStatus({ agentId: 'subagent_persisted_2' })
    expect(status.status).toBe('failed')
    expect(status.error?.code).toBe('SESSION_INTERRUPTED')

    const resumed = await runtime.resume({
      agentId: 'subagent_persisted_2',
      prompt: 'continue from checkpoint',
    })
    expect(resumed.status).toBe('resumed')
    expect(resumed.transcript_entries_recovered).toBe(2)
  })

  it('rejects spawn when concurrency limit is reached', async () => {
    const notifications: (SubagentTaskNotification | SubagentStepNotification)[] = []
    const runtime = createRuntime(`workspace-concurrency-${Date.now()}`, notifications)

    // Block all runs so tasks stay in running/pending state
    hoisted.setRunImpl(
      () => new Promise<Message[]>(() => {})
    )

    // Spawn 20 tasks concurrently (each blocks but creates task synchronously)
    const spawnPromises: Promise<any>[] = []
    for (let i = 0; i < 20; i++) {
      spawnPromises.push(
        runtime.spawn({
          description: `task-${i}`,
          prompt: `run ${i}`,
          name: `task-${i}`,
        }).catch(() => {})
      )
    }

    // 21st should fail — tasks are created synchronously before their first await
    try {
      await runtime.spawn({
        description: 'overflow',
        prompt: 'too many',
      })
      expect.unreachable('should have thrown')
    } catch (e: any) {
      expect(e.code).toBe('CONCURRENCY_LIMIT')
    }
  })

  it('shutdown marks all active tasks as failed with SESSION_INTERRUPTED', async () => {
    const notifications: (SubagentTaskNotification | SubagentStepNotification)[] = []
    const runtime = createRuntime(`workspace-shutdown-${Date.now()}`, notifications)

    // Block runs
    hoisted.setRunImpl(
      () => new Promise<Message[]>(() => {})
    )

    // Start spawns without awaiting
    runtime.spawn({
      description: 'active-1',
      prompt: 'run',
      name: 'shutdown-1',
    }).catch(() => {})

    runtime.spawn({
      description: 'active-2',
      prompt: 'run',
      name: 'shutdown-2',
    }).catch(() => {})

    // Both should be running/pending
    const s1 = await runtime.getStatus({ agentId: 'shutdown-1' })
    const s2 = await runtime.getStatus({ agentId: 'shutdown-2' })
    expect(['pending', 'running']).toContain(s1.status)
    expect(['pending', 'running']).toContain(s2.status)

    // Shutdown
    runtime.shutdown()

    // Both should be failed
    const s1After = await runtime.getStatus({ agentId: 'shutdown-1' })
    const s2After = await runtime.getStatus({ agentId: 'shutdown-2' })
    expect(s1After.status).toBe('failed')
    expect(s1After.error?.code).toBe('SESSION_INTERRUPTED')
    expect(s2After.status).toBe('failed')
    expect(s2After.error?.code).toBe('SESSION_INTERRUPTED')
  })
})
