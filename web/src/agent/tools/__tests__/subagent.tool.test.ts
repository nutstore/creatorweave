import { describe, expect, it, vi } from 'vitest'
import type { SubagentRuntime, ToolContext } from '../tool-types'
import {
  batchSpawnDefinition,
  batchSpawnExecutor,
  getSubagentStatusDefinition,
  getSubagentStatusExecutor,
  sendMessageToSubagentDefinition,
  spawnSubagentDefinition,
  spawnSubagentExecutor,
} from '../subagent.tool'

function parseJson(result: string): Record<string, unknown> {
  return JSON.parse(result) as Record<string, unknown>
}

function createMockRuntime(): SubagentRuntime {
  return {
    spawn: vi.fn().mockResolvedValue({
      status: 'async_launched',
      agentId: 'subagent_1',
    }),
    sendMessage: vi.fn().mockResolvedValue({
      success: true,
      message: 'queued',
      queue_position: 1,
    }),
    stop: vi.fn().mockResolvedValue({
      success: true,
    }),
    resume: vi.fn().mockResolvedValue({
      status: 'resumed',
      agentId: 'subagent_1',
      resumed_from: null,
      transcript_entries_recovered: 1,
    }),
    getStatus: vi.fn().mockResolvedValue({
      agentId: 'subagent_1',
      status: 'running',
      description: 'task',
      created_at: 1,
      updated_at: 2,
      last_activity_at: 2,
      queue_depth: 0,
    }),
    list: vi.fn().mockResolvedValue({
      agents: [],
      total: 0,
    }),
    batchSpawn: vi.fn().mockResolvedValue({
      launched: [{ task_index: 0, agentId: 'subagent_1' }],
      rejected: [],
    }),
  }
}

describe('subagent tools', () => {
  it('exposes expected tool names', () => {
    expect(spawnSubagentDefinition.function.name).toBe('spawn_subagent')
    expect(batchSpawnDefinition.function.name).toBe('batch_spawn')
    expect(sendMessageToSubagentDefinition.function.name).toBe('send_message_to_subagent')
    expect(getSubagentStatusDefinition.function.name).toBe('get_subagent_status')
  })

  it('returns runtime unavailable when runtime is missing', async () => {
    const result = await spawnSubagentExecutor(
      { description: 'task', prompt: 'do it' },
      { directoryHandle: null } as ToolContext
    )
    const parsed = parseJson(result)
    expect(parsed.ok).toBe(false)
    expect((parsed.error as { code: string }).code).toBe('SUBAGENT_RUNTIME_UNAVAILABLE')
  })

  it('spawns subagent with runtime', async () => {
    const runtime = createMockRuntime()
    const result = await spawnSubagentExecutor(
      { description: 'task', prompt: 'do it' },
      { directoryHandle: null, subagentRuntime: runtime } as ToolContext
    )
    const parsed = parseJson(result)
    expect(parsed.ok).toBe(true)
    expect((runtime.spawn as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1)
  })

  it('maps status query error to TASK_NOT_FOUND', async () => {
    const runtime = createMockRuntime()
    ;(runtime.getStatus as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('TASK_NOT_FOUND'))
    const result = await getSubagentStatusExecutor(
      { agentId: 'missing' },
      { directoryHandle: null, subagentRuntime: runtime } as ToolContext
    )
    const parsed = parseJson(result)
    expect(parsed.ok).toBe(false)
    expect((parsed.error as { code: string }).code).toBe('TASK_NOT_FOUND')
  })

  it('supports batch spawn tool', async () => {
    const runtime = createMockRuntime()
    const result = await batchSpawnExecutor(
      {
        tasks: [{ description: 't1', prompt: 'p1' }],
        max_concurrency: 2,
      },
      { directoryHandle: null, subagentRuntime: runtime } as ToolContext
    )
    const parsed = parseJson(result)
    expect(parsed.ok).toBe(true)
    expect((runtime.batchSpawn as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1)
  })
})
