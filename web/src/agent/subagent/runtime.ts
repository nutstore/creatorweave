import { type AgentMode } from '@/agent/agent-mode'
import { AgentLoop } from '@/agent/agent-loop'
import { ContextManager } from '@/agent/context-manager'
import { createUserMessage, generateId, type Message } from '@/agent/message-types'
import type { PiAIProvider } from '@/agent/llm/pi-ai-provider'
import type { ToolRegistry } from '@/agent/tool-registry'
import type {
  BatchSpawnSubagentInput,
  SpawnSubagentInput,
  SpawnSubagentSyncResult,
  SubagentRuntime,
  SubagentTaskNotification,
  SubagentTaskStatus,
  SubagentTaskSummary,
  SubagentTaskUsage,
  ToolContext,
} from '@/agent/tools/tool-types'

type SubagentTaskInternal = {
  agentId: string
  name?: string
  description: string
  status: SubagentTaskStatus
  created_at: number
  updated_at: number
  last_activity_at: number
  mode: AgentMode
  messages: Message[]
  queue: Array<{ message: string; enqueued_at: number }>
  usage?: SubagentTaskUsage
  error?: { code: string; message: string }
  loop?: AgentLoop
  processing: boolean
  processingPromise?: Promise<void>
  stopped: boolean
}

type RuntimeDeps = {
  workspaceId: string
  provider: PiAIProvider
  toolRegistry: ToolRegistry
  contextManager: ContextManager
  baseToolContext: ToolContext
  onNotification?: (event: SubagentTaskNotification) => void
}

const SUBAGENT_SYSTEM_PROMPT = `You are a sub-agent executing a specific task. Follow the instructions precisely.
When done, provide a concise summary of what you accomplished.
If you encounter errors, describe them clearly including what you tried and what failed.`

const SUBAGENT_CONTROL_TOOLS = new Set([
  'spawn_subagent',
  'batch_spawn',
  'send_message_to_subagent',
  'stop_subagent',
  'resume_subagent',
  'get_subagent_status',
  'list_subagents',
])

class SubagentRuntimeImpl implements SubagentRuntime {
  private tasks = new Map<string, SubagentTaskInternal>()
  private nameToId = new Map<string, string>()
  private deps: RuntimeDeps
  private hydrationPromise: Promise<void>

  constructor(deps: RuntimeDeps) {
    this.deps = deps
    this.hydrationPromise = this.hydrateFromSQLite()
  }

  updateDeps(deps: RuntimeDeps): void {
    this.deps = deps
  }

  async spawn(
    input: SpawnSubagentInput
  ): Promise<SpawnSubagentSyncResult | { status: 'async_launched'; agentId: string }> {
    await this.ensureHydrated()
    const description = (input.description || '').trim()
    const prompt = (input.prompt || '').trim()
    const name = typeof input.name === 'string' ? input.name.trim() : undefined
    const mode = input.mode || this.deps.baseToolContext.agentMode || 'act'
    const runInBackground = input.run_in_background !== false

    if (!description) {
      throw new Error('INVALID_INPUT: description is required')
    }
    if (!prompt) {
      throw new Error('INVALID_INPUT: prompt is required')
    }
    if (name) {
      const existing = this.nameToId.get(name)
      if (existing) {
        throw new Error('NAME_CONFLICT: name already exists')
      }
    }

    const now = Date.now()
    const agentId = `subagent_${generateId()}`
    const task: SubagentTaskInternal = {
      agentId,
      name,
      description,
      status: 'pending',
      created_at: now,
      updated_at: now,
      last_activity_at: now,
      mode,
      messages: [],
      queue: [{ message: prompt, enqueued_at: now }],
      processing: false,
      stopped: false,
    }

    this.tasks.set(agentId, task)
    if (name) this.nameToId.set(name, agentId)
    this.persistToSQLite()

    if (runInBackground) {
      this.ensureProcessing(task)
      return {
        status: 'async_launched',
        agentId,
      }
    }

    await this.ensureProcessing(task)
    const latest = this.tasks.get(agentId)
    if (!latest) {
      throw new Error('TASK_NOT_FOUND')
    }
    if (latest.status !== 'completed') {
      throw new Error(latest.error?.code || 'SUBAGENT_FAILED')
    }
    return {
      status: 'completed',
      content: this.extractLatestAssistantContent(latest.messages),
      usage: latest.usage,
    }
  }

  async sendMessage(input: {
    to: string
    message: string
  }): Promise<{
    success: boolean
    message: string
    queued_at?: number
    queue_position?: number
    resumed?: boolean
    resume_error?: { code: string; message: string; recoverable: boolean }
  }> {
    await this.ensureHydrated()
    const to = (input.to || '').trim()
    const message = (input.message || '').trim()
    if (!message) {
      return {
        success: false,
        message: 'INVALID_MESSAGE',
      }
    }
    const task = this.getByIdOrName(to)
    if (!task) {
      return {
        success: false,
        message: 'TASK_NOT_FOUND',
      }
    }

    if (task.status === 'completed') {
      return {
        success: false,
        message: 'TASK_ALREADY_COMPLETED',
      }
    }

    const queuedAt = Date.now()
    if (task.status === 'failed' || task.status === 'killed') {
      task.status = 'pending'
      task.stopped = false
      task.error = undefined
      task.queue.push({ message, enqueued_at: queuedAt })
      task.updated_at = queuedAt
      task.last_activity_at = queuedAt
      this.persistToSQLite()
      this.ensureProcessing(task)
      return {
        success: true,
        message: 'resumed',
        queued_at: queuedAt,
        queue_position: task.queue.length,
        resumed: true,
      }
    }

    task.queue.push({ message, enqueued_at: queuedAt })
    task.updated_at = queuedAt
    task.last_activity_at = queuedAt
    this.persistToSQLite()
    this.ensureProcessing(task)
    return {
      success: true,
      message: 'queued',
      queued_at: queuedAt,
      queue_position: task.queue.length,
    }
  }

  async stop(input: {
    agentId: string
    force?: boolean
  }): Promise<{ success: boolean; already_stopped?: boolean }> {
    await this.ensureHydrated()
    const task = this.getByIdOrName((input.agentId || '').trim())
    if (!task) {
      throw new Error('TASK_NOT_FOUND')
    }
    if (task.status === 'completed' || task.status === 'failed' || task.status === 'killed') {
      return { success: true, already_stopped: true }
    }
    task.status = 'killed'
    task.stopped = true
    task.updated_at = Date.now()
    task.last_activity_at = task.updated_at
    task.error = input.force
      ? { code: 'STOPPED_FORCE', message: 'Subagent stopped by force.' }
      : { code: 'STOPPED', message: 'Subagent stopped.' }
    this.persistToSQLite()
    this.emitNotification({
      event_type: 'task_notification',
      agentId: task.agentId,
      status: 'killed',
      summary: task.error.message,
      exit_reason: 'stopped',
      error: {
        code: task.error.code,
        message: task.error.message,
        recoverable: false,
      },
      timestamp: Date.now(),
    })
    task.loop?.cancel()
    return { success: true }
  }

  async resume(input: {
    agentId: string
    prompt: string
  }): Promise<{
    status: 'resumed'
    agentId: string
    resumed_from: string | null
    transcript_entries_recovered: number
  }> {
    await this.ensureHydrated()
    const task = this.getByIdOrName((input.agentId || '').trim())
    if (!task) {
      throw new Error('TASK_NOT_FOUND')
    }
    const prompt = (input.prompt || '').trim()
    if (!prompt) {
      throw new Error('INVALID_INPUT: prompt is required')
    }
    const recovered = task.messages.length
    task.status = 'pending'
    task.stopped = false
    task.error = undefined
    task.queue.push({ message: prompt, enqueued_at: Date.now() })
    task.updated_at = Date.now()
    task.last_activity_at = task.updated_at
    this.persistToSQLite()
    this.ensureProcessing(task)
    return {
      status: 'resumed',
      agentId: task.agentId,
      resumed_from: null,
      transcript_entries_recovered: recovered,
    }
  }

  async getStatus(input: {
    agentId: string
  }): Promise<{
    agentId: string
    status: SubagentTaskStatus
    description: string
    created_at: number
    updated_at: number
    last_activity_at: number
    queue_depth: number
    usage?: SubagentTaskUsage
    error?: { code: string; message: string }
  }> {
    await this.ensureHydrated()
    const task = this.getByIdOrName((input.agentId || '').trim())
    if (!task) {
      throw new Error('TASK_NOT_FOUND')
    }
    return {
      agentId: task.agentId,
      status: task.status,
      description: task.description,
      created_at: task.created_at,
      updated_at: task.updated_at,
      last_activity_at: task.last_activity_at,
      queue_depth: task.queue.length,
      usage: task.usage,
      error: task.error,
    }
  }

  async list(input: {
    status?: string
    limit?: number
    offset?: number
  }): Promise<{
    agents: SubagentTaskSummary[]
    total: number
  }> {
    await this.ensureHydrated()
    const statusFilter = typeof input.status === 'string' ? input.status.trim() : ''
    const limit = Number.isFinite(input.limit) ? Math.max(1, Math.min(200, Number(input.limit))) : 50
    const offset = Number.isFinite(input.offset) ? Math.max(0, Math.floor(Number(input.offset))) : 0

    const all = Array.from(this.tasks.values())
      .filter((task) => !statusFilter || task.status === statusFilter)
      .sort((a, b) => b.updated_at - a.updated_at)

    return {
      agents: all.slice(offset, offset + limit).map((task) => ({
        agentId: task.agentId,
        name: task.name,
        description: task.description,
        status: task.status,
        created_at: task.created_at,
        updated_at: task.updated_at,
      })),
      total: all.length,
    }
  }

  async batchSpawn(input: BatchSpawnSubagentInput): Promise<{
    launched: Array<{
      task_index: number
      agentId: string
    }>
    rejected: Array<{
      task_index: number
      reason: string
      error_code: string
    }>
  }> {
    await this.ensureHydrated()
    const tasks = Array.isArray(input.tasks) ? input.tasks : []
    const maxConcurrency = Number.isFinite(input.max_concurrency)
      ? Math.max(1, Math.min(20, Math.floor(Number(input.max_concurrency))))
      : 5
    const runInBackground = input.run_in_background !== false

    const launched: Array<{ task_index: number; agentId: string }> = []
    const rejected: Array<{ task_index: number; reason: string; error_code: string }> = []

    let cursor = 0
    const workers = Array.from({ length: Math.min(maxConcurrency, Math.max(tasks.length, 1)) }).map(
      async () => {
        while (cursor < tasks.length) {
          const taskIndex = cursor
          cursor += 1
          const task = tasks[taskIndex]
          try {
            const result = await this.spawn({
              ...task,
              run_in_background: runInBackground,
            })
            if (result.status === 'async_launched') {
              launched.push({ task_index: taskIndex, agentId: result.agentId })
            } else {
              const existing = this.findByDescriptionAndLatest(task.description)
              launched.push({ task_index: taskIndex, agentId: existing?.agentId || '' })
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            rejected.push({
              task_index: taskIndex,
              reason: message,
              error_code: message.includes('NAME_CONFLICT')
                ? 'NAME_CONFLICT'
                : message.includes('INVALID_INPUT')
                  ? 'INVALID_INPUT'
                  : 'BATCH_SPAWN_FAILED',
            })
          }
        }
      }
    )
    await Promise.all(workers)

    return { launched, rejected }
  }

  private getByIdOrName(idOrName: string): SubagentTaskInternal | undefined {
    if (!idOrName) return undefined
    const direct = this.tasks.get(idOrName)
    if (direct) return direct
    const mapped = this.nameToId.get(idOrName)
    return mapped ? this.tasks.get(mapped) : undefined
  }

  private ensureProcessing(task: SubagentTaskInternal): Promise<void> {
    if (task.processing && task.processingPromise) {
      return task.processingPromise
    }
    task.processing = true
    task.processingPromise = this.processQueue(task).finally(() => {
      task.processing = false
      task.processingPromise = undefined
      this.persistToSQLite()
    })
    return task.processingPromise
  }

  private async processQueue(task: SubagentTaskInternal): Promise<void> {
    while (task.queue.length > 0) {
      if (task.status === 'killed' || task.stopped) {
        return
      }
      const queued = task.queue.shift()
      if (!queued) return

      task.status = 'running'
      task.updated_at = Date.now()
      task.last_activity_at = task.updated_at
      this.persistToSQLite()
      this.emitNotification({
        event_type: 'task_notification',
        agentId: task.agentId,
        status: 'running',
        summary: `Subagent "${task.description}" is running.`,
        timestamp: task.updated_at,
      })

      try {
        const loop = this.ensureLoop(task)
        task.messages.push(createUserMessage(queued.message))
        const startedAt = Date.now()
        task.messages = await loop.run(task.messages)
        const completedAt = Date.now()
        task.status = 'completed'
        task.updated_at = completedAt
        task.last_activity_at = completedAt

        const latestAssistant = [...task.messages].reverse().find((msg) => msg.role === 'assistant')
        if (latestAssistant?.usage) {
          task.usage = {
            total_tokens: latestAssistant.usage.totalTokens,
            input_tokens: latestAssistant.usage.promptTokens,
            output_tokens: latestAssistant.usage.completionTokens,
            duration_ms: Math.max(0, completedAt - startedAt),
            tool_calls: task.messages.filter((msg) => msg.role === 'tool').length,
          }
        }
        const finalResult = this.extractLatestAssistantContent(task.messages)
        const structured = this.parseStructuredResult(finalResult)
        this.persistToSQLite()
        this.emitNotification({
          event_type: 'task_notification',
          agentId: task.agentId,
          status: 'completed',
          summary: `Subagent "${task.description}" completed.`,
          result: finalResult,
          result_schema_id: structured ? 'subagent.result.v1' : undefined,
          result_json: structured || undefined,
          exit_reason: 'completed',
          usage: task.usage,
          timestamp: completedAt,
        })
      } catch (error) {
        if (task.stopped) {
          return
        }
        const message = error instanceof Error ? error.message : String(error)
        task.status = 'failed'
        task.updated_at = Date.now()
        task.last_activity_at = task.updated_at
        task.error = { code: 'SUBAGENT_FAILED', message }
        this.persistToSQLite()
        this.emitNotification({
          event_type: 'task_notification',
          agentId: task.agentId,
          status: 'failed',
          summary: `Subagent "${task.description}" failed.`,
          exit_reason: 'error',
          error: {
            code: task.error.code,
            message: task.error.message,
            recoverable: true,
          },
          timestamp: task.updated_at,
        })
        return
      }
    }
  }

  private ensureLoop(task: SubagentTaskInternal): AgentLoop {
    if (task.loop) return task.loop

    const contextConfig = this.deps.contextManager.getConfig()
    const subContextManager = new ContextManager({
      maxContextTokens: contextConfig.maxContextTokens,
      reserveTokens: contextConfig.reserveTokens,
      enableSummarization: contextConfig.enableSummarization,
      maxMessageGroups: contextConfig.maxMessageGroups,
      systemPrompt: SUBAGENT_SYSTEM_PROMPT,
    })
    const taskContext: ToolContext = {
      ...this.deps.baseToolContext,
      agentMode: task.mode,
      subagentRuntime: undefined,
      readFileState: new Map(),
    }

    task.loop = new AgentLoop({
      provider: this.deps.provider,
      toolRegistry: this.deps.toolRegistry,
      contextManager: subContextManager,
      systemPrompt: SUBAGENT_SYSTEM_PROMPT,
      toolContext: taskContext,
      mode: task.mode,
      beforeToolCall: ({ toolName }) => {
        if (SUBAGENT_CONTROL_TOOLS.has(toolName)) {
          return {
            block: true,
            reason: `Tool "${toolName}" is blocked in subagent runtime.`,
          }
        }
        return undefined
      },
    })

    return task.loop
  }

  private extractLatestAssistantContent(messages: Message[]): string {
    const assistant = [...messages].reverse().find((msg) => msg.role === 'assistant')
    return (assistant?.content || '').trim()
  }

  private parseStructuredResult(content: string): Record<string, unknown> | null {
    const trimmed = content.trim()
    if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return null
    try {
      const parsed = JSON.parse(trimmed) as unknown
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>
      }
      return null
    } catch {
      return null
    }
  }

  private emitNotification(event: SubagentTaskNotification): void {
    try {
      this.deps.onNotification?.(event)
    } catch {
      // best-effort notification
    }
  }

  private async ensureHydrated(): Promise<void> {
    await this.hydrationPromise
  }

  private persistToSQLite(): void {
    void this.persistToSQLiteInternal()
  }

  private async persistToSQLiteInternal(): Promise<void> {
    try {
      const { getSubagentRepository } = await import('@/sqlite')
      const repo = getSubagentRepository()
      const serializable = Array.from(this.tasks.values()).map((task) => this.toStoredTask(task))
      await repo.saveBatch(this.deps.workspaceId, serializable)
    } catch {
      // ignore persistence failures for runtime continuity
    }
  }

  private async hydrateFromSQLite(): Promise<void> {
    try {
      const { getSubagentRepository } = await import('@/sqlite')
      const repo = getSubagentRepository()
      const parsed = await repo.findByWorkspaceId(this.deps.workspaceId)
      for (const item of parsed) {
        const revived: SubagentTaskInternal = {
          agentId: item.agentId,
          name: item.name,
          description: item.description,
          status:
            item.status === 'running' || item.status === 'pending' ? 'failed' : item.status,
          error:
            item.status === 'running' || item.status === 'pending'
              ? { code: 'SESSION_INTERRUPTED', message: 'Subagent interrupted by session restart.' }
              : item.error,
          created_at: item.created_at,
          updated_at: item.updated_at,
          last_activity_at: item.last_activity_at,
          mode: item.mode,
          messages: item.messages,
          queue: item.queue,
          usage: item.usage,
          processing: false,
          processingPromise: undefined,
          loop: undefined,
          stopped: item.stopped ?? false,
        }
        this.tasks.set(revived.agentId, revived)
        if (revived.name) this.nameToId.set(revived.name, revived.agentId)
      }
    } catch {
      // ignore hydration failures; runtime remains usable in-memory
    }
  }

  private toStoredTask(task: SubagentTaskInternal): {
    agentId: string
    workspaceId: string
    name?: string
    description: string
    status: SubagentTaskStatus
    mode: AgentMode
    messages: Message[]
    queue: Array<{ message: string; enqueued_at: number }>
    usage?: SubagentTaskUsage
    error?: { code: string; message: string }
    stopped: boolean
    created_at: number
    updated_at: number
    last_activity_at: number
  } {
    return {
      agentId: task.agentId,
      workspaceId: this.deps.workspaceId,
      name: task.name,
      description: task.description,
      status: task.status,
      mode: task.mode,
      messages: task.messages,
      queue: task.queue,
      usage: task.usage,
      error: task.error,
      stopped: task.stopped,
      created_at: task.created_at,
      updated_at: task.updated_at,
      last_activity_at: task.last_activity_at,
    }
  }

  private findByDescriptionAndLatest(description: string): SubagentTaskInternal | undefined {
    return Array.from(this.tasks.values())
      .filter((task) => task.description === description)
      .sort((a, b) => b.created_at - a.created_at)[0]
  }
}

const runtimeRegistry = new Map<string, SubagentRuntimeImpl>()

export function getOrCreateSubagentRuntime(input: {
  workspaceId: string
  provider: PiAIProvider
  toolRegistry: ToolRegistry
  contextManager: ContextManager
  baseToolContext: ToolContext
  onNotification?: (event: SubagentTaskNotification) => void
}): SubagentRuntime {
  const key = input.workspaceId || 'default'
  const existing = runtimeRegistry.get(key)
  const deps: RuntimeDeps = {
    workspaceId: key,
    provider: input.provider,
    toolRegistry: input.toolRegistry,
    contextManager: input.contextManager,
    baseToolContext: input.baseToolContext,
    onNotification: input.onNotification,
  }
  if (existing) {
    existing.updateDeps(deps)
    return existing
  }
  const created = new SubagentRuntimeImpl(deps)
  runtimeRegistry.set(key, created)
  return created
}
