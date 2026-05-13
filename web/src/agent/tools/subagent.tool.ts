import { toolErrorJson, toolOkJson } from './tool-envelope'
import { SubagentError } from './tool-types'
import type { ToolContext, ToolPromptDoc } from './tool-types'
import {
  validateAgentId,
  validateDescription,
  validateMessage,
  validateName,
  validatePrompt,
} from './subagent-validation'
import type { ToolDefinition, ToolExecutor } from './tool-types'

const TOOL_NAME_SPAWN = 'spawn_subagent'
const TOOL_NAME_BATCH_SPAWN = 'batch_spawn'
const TOOL_NAME_SEND = 'send_message_to_subagent'
const TOOL_NAME_STOP = 'stop_subagent'
const TOOL_NAME_RESUME = 'resume_subagent'
const TOOL_NAME_GET_STATUS = 'get_subagent_status'
const TOOL_NAME_LIST = 'list_subagents'

/**
 * Subagent output is no longer pre-emptively offloaded to asset files.
 * The context manager (ContextManager) handles compression when token usage
 * approaches the context window limit (85% trigger threshold). Pre-emptive
 * truncation forced the main agent to waste a tool call on `read` to recover
 * the full output — defeating the purpose of delegation.
 *
 * If we ever need a safety valve for truly enormous outputs (e.g. >500K chars),
 * the threshold should be derived from the active model's context window size,
 * not a fixed character count.
 */

//-----------------------------------------------------------------------------
// Subagent Health Detection
//-----------------------------------------------------------------------------

export interface SubagentHealth {
  ok: boolean
  reason?: string
  message?: string
  suggestion?: string
}

/**
 * Detect whether a completed subagent likely failed due to an API error.
 *
 * Heuristic: status is "completed" but the output is suspiciously short while
 * the agent already performed multiple tool calls — this pattern strongly
 * suggests the LLM response was truncated by an upstream error.
 */
function detectSubagentHealth(result: {
  content: string
  status: string
  usage?: { output_tokens?: number; tool_calls?: number }
}): SubagentHealth {
  const contentLength = (result.content || '').trim().length
  const outputTokens = result.usage?.output_tokens ?? 0
  const toolCalls = result.usage?.tool_calls ?? 0

  if (
    result.status === 'completed' &&
    contentLength < 50 &&
    outputTokens < 100 &&
    toolCalls > 0
  ) {
    return {
      ok: false,
      reason: 'suspicious_low_output',
      message: `Subagent completed but output is suspiciously short (output_tokens=${outputTokens}, tool_calls=${toolCalls}, content_length=${contentLength}). This likely indicates an API error interrupted the response. Try \`resume_subagent\` to continue.`,
      suggestion: 'resume_subagent',
    }
  }

  return { ok: true }
}

function runtimeMissing(tool: string): string {
  return toolErrorJson(
    tool,
    'SUBAGENT_RUNTIME_UNAVAILABLE',
    'Subagent runtime is not available in current tool context.'
  )
}

/** Format a SubagentError (or fallback Error) into a tool envelope string. */
function formatError(tool: string, error: unknown): string {
  if (error instanceof SubagentError) {
    return toolErrorJson(tool, error.code, error.message, {
      retryable: error.recoverable,
      details: error.field ? { field: error.field } : undefined,
    })
  }
  const message = error instanceof Error ? error.message : String(error)
  return toolErrorJson(tool, 'INTERNAL_ERROR', message)
}

export const spawnSubagentDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: TOOL_NAME_SPAWN,
    description:
      'Spawn a delegated subagent task that runs to completion. The tool blocks until the subagent finishes and returns the full result. Use for independent sub-tasks (analysis, searching, drafting).',
    parameters: {
      type: 'object',
      properties: {
        description: {
          type: 'string',
          description: 'Short task summary for tracking.',
        },
        prompt: {
          type: 'string',
          description: 'Detailed instructions for the subagent.',
        },
        name: {
          type: 'string',
          description: 'Optional unique alias for later lookup.',
        },
        mode: {
          type: 'string',
          enum: ['plan', 'act'],
          description: 'Optional execution mode for the subagent.',
        },
      },
      required: ['description', 'prompt'],
    },
  },
}

export const sendMessageToSubagentDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: TOOL_NAME_SEND,
    description:
      'Send a follow-up message to a running/pending subagent by agentId or alias name.',
    parameters: {
      type: 'object',
      properties: {
        to: {
          type: 'string',
          description: 'Target subagent id or alias.',
        },
        message: {
          type: 'string',
          description: 'Message payload for the target subagent.',
        },
        timeout_ms: {
          type: 'number',
          description: 'Optional enqueue wait timeout in milliseconds.',
        },
        overflow_action: {
          type: 'string',
          enum: ['reject', 'drop_oldest'],
          description: 'Queue overflow strategy. Default reject.',
        },
      },
      required: ['to', 'message'],
    },
  },
}

export const batchSpawnDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: TOOL_NAME_BATCH_SPAWN,
    description:
      'Launch multiple independent subagent tasks in parallel. Blocks until all tasks complete. Useful for parallelizable subtasks.',
    parameters: {
      type: 'object',
      properties: {
        tasks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              description: { type: 'string' },
              prompt: { type: 'string' },
              name: { type: 'string' },
              mode: { type: 'string', enum: ['plan', 'act'] },
            },
            required: ['description', 'prompt'],
          },
          description: 'Subagent tasks to launch.',
        },
        max_concurrency: {
          type: 'number',
          description: 'Max parallel tasks per batch (default 5, max 20).',
        },
      },
      required: ['tasks'],
    },
  },
}

export const stopSubagentDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: TOOL_NAME_STOP,
    description: 'Stop a subagent by agentId or alias. Safe to call repeatedly (idempotent).',
    parameters: {
      type: 'object',
      properties: {
        agentId: {
          type: 'string',
          description: 'Target subagent id or alias.',
        },
        force: {
          type: 'boolean',
          description: 'Force immediate stop.',
        },
        timeout_ms: {
          type: 'number',
          description: 'Soft-stop wait timeout in milliseconds (default 10000).',
        },
      },
      required: ['agentId'],
    },
  },
}

export const resumeSubagentDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: TOOL_NAME_RESUME,
    description: 'Resume a stopped or failed subagent with an additional prompt.',
    parameters: {
      type: 'object',
      properties: {
        agentId: {
          type: 'string',
          description: 'Target subagent id or alias.',
        },
        prompt: {
          type: 'string',
          description: 'Prompt to continue the task.',
        },
      },
      required: ['agentId', 'prompt'],
    },
  },
}

export const getSubagentStatusDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: TOOL_NAME_GET_STATUS,
    description: 'Get current status and queue depth of a subagent by id or alias.',
    parameters: {
      type: 'object',
      properties: {
        agentId: {
          type: 'string',
          description: 'Target subagent id or alias.',
        },
      },
      required: ['agentId'],
    },
  },
}

export const listSubagentsDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: TOOL_NAME_LIST,
    description: 'List subagents in current workspace with optional status filter and pagination.',
    parameters: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          description: 'Optional status filter: pending|running|completed|failed|killed.',
        },
        limit: {
          type: 'number',
          description: 'Pagination limit. Default 50, max 200.',
        },
        offset: {
          type: 'number',
          description: 'Pagination offset. Default 0.',
        },
      },
    },
  },
}

export const spawnSubagentExecutor: ToolExecutor = async (args, context) => {
  const runtime = context.subagentRuntime
  if (!runtime) return runtimeMissing(TOOL_NAME_SPAWN)

  try {
    const description = validateDescription(args.description)
    const prompt = validatePrompt(args.prompt)
    const name = validateName(args.name)

    const result = await runtime.spawn({
      description,
      prompt,
      name,
      mode: args.mode === 'plan' || args.mode === 'act' ? args.mode : undefined,
    })

    // Health check: detect suspicious low output that likely indicates an API error
    const health = detectSubagentHealth(result)

    return toolOkJson(
      TOOL_NAME_SPAWN,
      result,
      health.ok ? undefined : { health },
    )
  } catch (error) {
    return formatError(TOOL_NAME_SPAWN, error)
  }
}

export const batchSpawnExecutor: ToolExecutor = async (args, context) => {
  const runtime = context.subagentRuntime
  if (!runtime) return runtimeMissing(TOOL_NAME_BATCH_SPAWN)

  try {
    const tasks = Array.isArray(args.tasks)
      ? (args.tasks as Array<Record<string, unknown>>).map((task) => ({
          description: validateDescription(task.description),
          prompt: validatePrompt(task.prompt),
          name: validateName(task.name),
          mode: (task.mode === 'plan' || task.mode === 'act' ? task.mode : undefined) as 'plan' | 'act' | undefined,
        }))
      : []
    const max_concurrency = typeof args.max_concurrency === 'number' ? args.max_concurrency : undefined

    const result = await runtime.batchSpawn({
      tasks,
      max_concurrency,
    })
    const healthCheckedCompleted = result.completed.map((item) => {
      const health = detectSubagentHealth(item)
      return {
        ...item,
        ...(health.ok ? {} : { health }),
      }
    })
    return toolOkJson(TOOL_NAME_BATCH_SPAWN, { ...result, completed: healthCheckedCompleted })
  } catch (error) {
    return formatError(TOOL_NAME_BATCH_SPAWN, error)
  }
}

export const sendMessageToSubagentExecutor: ToolExecutor = async (args, context) => {
  const runtime = context.subagentRuntime
  if (!runtime) return runtimeMissing(TOOL_NAME_SEND)

  try {
    const to = validateAgentId(args.to)
    const message = validateMessage(args.message)

    const result = await runtime.sendMessage({
      to,
      message,
      timeout_ms: typeof args.timeout_ms === 'number' ? args.timeout_ms : undefined,
      overflow_action:
        args.overflow_action === 'drop_oldest' || args.overflow_action === 'reject'
          ? args.overflow_action
          : undefined,
    })
    if (!result.success) {
      return toolErrorJson(TOOL_NAME_SEND, result.message, result.message, {
        details: result,
      })
    }
    return toolOkJson(TOOL_NAME_SEND, result)
  } catch (error) {
    return formatError(TOOL_NAME_SEND, error)
  }
}

export const stopSubagentExecutor: ToolExecutor = async (args, context) => {
  const runtime = context.subagentRuntime
  if (!runtime) return runtimeMissing(TOOL_NAME_STOP)

  try {
    const agentId = validateAgentId(args.agentId)
    const result = await runtime.stop({
      agentId,
      force: args.force === true,
      timeout_ms: typeof args.timeout_ms === 'number' ? args.timeout_ms : undefined,
    })
    return toolOkJson(TOOL_NAME_STOP, result)
  } catch (error) {
    return formatError(TOOL_NAME_STOP, error)
  }
}

export const resumeSubagentExecutor: ToolExecutor = async (args, context) => {
  const runtime = context.subagentRuntime
  if (!runtime) return runtimeMissing(TOOL_NAME_RESUME)

  try {
    const agentId = validateAgentId(args.agentId)
    const prompt = validatePrompt(args.prompt)

    const result = await runtime.resume({
      agentId,
      prompt,
    })
    return toolOkJson(TOOL_NAME_RESUME, result)
  } catch (error) {
    return formatError(TOOL_NAME_RESUME, error)
  }
}

export const getSubagentStatusExecutor: ToolExecutor = async (args, context) => {
  const runtime = context.subagentRuntime
  if (!runtime) return runtimeMissing(TOOL_NAME_GET_STATUS)

  try {
    const agentId = validateAgentId(args.agentId)
    const result = await runtime.getStatus({ agentId })
    return toolOkJson(TOOL_NAME_GET_STATUS, result)
  } catch (error) {
    return formatError(TOOL_NAME_GET_STATUS, error)
  }
}

export const listSubagentsExecutor: ToolExecutor = async (args, context) => {
  const runtime = context.subagentRuntime
  if (!runtime) return runtimeMissing(TOOL_NAME_LIST)

  const result = await runtime.list({
    status: typeof args.status === 'string' ? args.status : undefined,
    limit: typeof args.limit === 'number' ? args.limit : undefined,
    offset: typeof args.offset === 'number' ? args.offset : undefined,
  })
  return toolOkJson(TOOL_NAME_LIST, result)
}

export const subagentPromptDoc: ToolPromptDoc = {
  category: 'subagent',
  section: '### Subagent Delegation',
  lines: [
    '- `spawn_subagent(description, prompt, ...)` - Delegate an independent sub-task to a child agent',
    '- `send_message_to_subagent(to, message)` - Send follow-up instruction to a running/pending child',
    '- `stop_subagent(agentId)` - Stop a child task when scope changes',
    '- `resume_subagent(agentId, prompt)` - Resume a stopped/failed/completed child with new instructions',
    '- `get_subagent_status(agentId)` - Query child status, queue depth, and errors',
    '- `list_subagents(status?, limit?, offset?)` - Enumerate all child tasks in this workspace',
  ],
}
