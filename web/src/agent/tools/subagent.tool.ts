import { toolErrorJson, toolOkJson } from './tool-envelope'
import type { ToolDefinition, ToolExecutor } from './tool-types'

const TOOL_NAME_SPAWN = 'spawn_subagent'
const TOOL_NAME_BATCH_SPAWN = 'batch_spawn'
const TOOL_NAME_SEND = 'send_message_to_subagent'
const TOOL_NAME_STOP = 'stop_subagent'
const TOOL_NAME_RESUME = 'resume_subagent'
const TOOL_NAME_GET_STATUS = 'get_subagent_status'
const TOOL_NAME_LIST = 'list_subagents'

function runtimeMissing(tool: string): string {
  return toolErrorJson(
    tool,
    'SUBAGENT_RUNTIME_UNAVAILABLE',
    'Subagent runtime is not available in current tool context.'
  )
}

export const spawnSubagentDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: TOOL_NAME_SPAWN,
    description:
      'Spawn a delegated subagent task. Use for independent sub-tasks (analysis, searching, drafting) so the main agent can continue with orchestration.',
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
        run_in_background: {
          type: 'boolean',
          description: 'When true (default), launch asynchronously and return immediately.',
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
      'Launch multiple independent subagent tasks in one call. Useful for parallelizable subtasks.',
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
              run_in_background: { type: 'boolean' },
            },
            required: ['description', 'prompt'],
          },
          description: 'Subagent tasks to launch.',
        },
        run_in_background: {
          type: 'boolean',
          description: 'When true (default), launch tasks asynchronously.',
        },
        max_concurrency: {
          type: 'number',
          description: 'Max parallel launches per batch (default 5, max 20).',
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
    const result = await runtime.spawn({
      description: typeof args.description === 'string' ? args.description : '',
      prompt: typeof args.prompt === 'string' ? args.prompt : '',
      name: typeof args.name === 'string' ? args.name : undefined,
      mode: args.mode === 'plan' || args.mode === 'act' ? args.mode : undefined,
      run_in_background: args.run_in_background === false ? false : true,
    })
    return toolOkJson(TOOL_NAME_SPAWN, result)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const isNameConflict = message.includes('NAME_CONFLICT')
    const isInputError = message.includes('INVALID_INPUT')
    return toolErrorJson(
      TOOL_NAME_SPAWN,
      isNameConflict ? 'NAME_CONFLICT' : isInputError ? 'INVALID_INPUT' : 'SUBAGENT_SPAWN_FAILED',
      message
    )
  }
}

export const batchSpawnExecutor: ToolExecutor = async (args, context) => {
  const runtime = context.subagentRuntime
  if (!runtime) return runtimeMissing(TOOL_NAME_BATCH_SPAWN)

  try {
    const result = await runtime.batchSpawn({
      tasks: Array.isArray(args.tasks)
        ? (args.tasks as Array<Record<string, unknown>>).map((task) => ({
            description: typeof task.description === 'string' ? task.description : '',
            prompt: typeof task.prompt === 'string' ? task.prompt : '',
            name: typeof task.name === 'string' ? task.name : undefined,
            mode: task.mode === 'plan' || task.mode === 'act' ? task.mode : undefined,
            run_in_background: task.run_in_background === false ? false : true,
          }))
        : [],
      run_in_background: args.run_in_background === false ? false : true,
      max_concurrency: typeof args.max_concurrency === 'number' ? args.max_concurrency : undefined,
    })
    return toolOkJson(TOOL_NAME_BATCH_SPAWN, result)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return toolErrorJson(TOOL_NAME_BATCH_SPAWN, 'BATCH_SPAWN_FAILED', message)
  }
}

export const sendMessageToSubagentExecutor: ToolExecutor = async (args, context) => {
  const runtime = context.subagentRuntime
  if (!runtime) return runtimeMissing(TOOL_NAME_SEND)

  const to = typeof args.to === 'string' ? args.to : ''
  const message = typeof args.message === 'string' ? args.message : ''
  const result = await runtime.sendMessage({ to, message })
  if (!result.success) {
    return toolErrorJson(TOOL_NAME_SEND, result.message, result.message, {
      details: result,
    })
  }
  return toolOkJson(TOOL_NAME_SEND, result)
}

export const stopSubagentExecutor: ToolExecutor = async (args, context) => {
  const runtime = context.subagentRuntime
  if (!runtime) return runtimeMissing(TOOL_NAME_STOP)

  try {
    const result = await runtime.stop({
      agentId: typeof args.agentId === 'string' ? args.agentId : '',
      force: args.force === true,
    })
    return toolOkJson(TOOL_NAME_STOP, result)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return toolErrorJson(
      TOOL_NAME_STOP,
      message.includes('TASK_NOT_FOUND') ? 'TASK_NOT_FOUND' : 'SUBAGENT_STOP_FAILED',
      message
    )
  }
}

export const resumeSubagentExecutor: ToolExecutor = async (args, context) => {
  const runtime = context.subagentRuntime
  if (!runtime) return runtimeMissing(TOOL_NAME_RESUME)

  try {
    const result = await runtime.resume({
      agentId: typeof args.agentId === 'string' ? args.agentId : '',
      prompt: typeof args.prompt === 'string' ? args.prompt : '',
    })
    return toolOkJson(TOOL_NAME_RESUME, result)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return toolErrorJson(
      TOOL_NAME_RESUME,
      message.includes('TASK_NOT_FOUND') ? 'TASK_NOT_FOUND' : 'SUBAGENT_RESUME_FAILED',
      message
    )
  }
}

export const getSubagentStatusExecutor: ToolExecutor = async (args, context) => {
  const runtime = context.subagentRuntime
  if (!runtime) return runtimeMissing(TOOL_NAME_GET_STATUS)

  try {
    const result = await runtime.getStatus({
      agentId: typeof args.agentId === 'string' ? args.agentId : '',
    })
    return toolOkJson(TOOL_NAME_GET_STATUS, result)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return toolErrorJson(
      TOOL_NAME_GET_STATUS,
      message.includes('TASK_NOT_FOUND') ? 'TASK_NOT_FOUND' : 'SUBAGENT_STATUS_FAILED',
      message
    )
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
