/**
 * Ask User Question Tool - allows the agent to ask the user a question
 * and synchronously wait for a response.
 *
 * This is a meta-tool: the executor pauses until the user responds via UI.
 * It is classified as a "read" tool so it's available in both Plan and Act modes.
 *
 * Supported question types:
 * - yes_no: Binary confirmation (default)
 * - single_choice: Select one from options
 * - multi_choice: Select multiple from options
 * - free_text: Open-ended text input
 */

import type { ToolDefinition, ToolExecutor } from './tool-types'
import { toolErrorJson, toolOkJson } from './tool-envelope'

export const askUserQuestionDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'ask_user_question',
    description: [
      'Ask the user a question and wait for their response. The agent loop automatically resumes after the user answers.',
      '',
      '## Why you should use this tool',
      'When you call this tool, the agent loop pauses and automatically resumes once the user answers — you get the answer back as the tool result and can continue working in the same loop turn.',
      'If you skip asking and guess wrong, the user has to send a new message and start a brand-new loop, wasting all the context and work from the current turn.',
      '**Asking is far cheaper than guessing wrong and redoing the work.**',
      '',
      '## When to use',
      '1. Disambiguate — when the user request has multiple possible interpretations',
      '2. Confirm — before executing irreversible / destructive operations',
      '3. Choose — when multiple viable approaches exist',
      '4. Gather info — when critical parameters are missing',
      '',
      '## When NOT to use',
      '- You can find the answer yourself via read/search tools — prefer tools over asking the user',
      '- The answer has one obvious interpretation and the cost of being wrong is low',
    ].join('\n'),
    parameters: {
      type: 'object',
      properties: {
        question: {
          type: 'string',
          description: '要向用户提出的问题。应该清晰、具体、易于回答。',
        },
        type: {
          type: 'string',
          enum: ['yes_no', 'single_choice', 'multi_choice', 'free_text'],
          description: [
            '问题类型：',
            '- yes_no: 是/否确认（默认）',
            '- single_choice: 单选',
            '- multi_choice: 多选',
            '- free_text: 自由文本输入',
          ].join('\n'),
        },
        options: {
          type: 'array',
          items: { type: 'string' },
          description: '选项列表（type 为 single_choice 或 multi_choice 时必填，至少 2 个选项）。',
        },
        default_answer: {
          type: 'string',
          description: '默认答案（可选），用于 UI 预选以及超时/取消时的降级回答。',
        },
        context: {
          type: 'object',
          properties: {
            affected_files: {
              type: 'array',
              items: { type: 'string' },
              description: '受影响的文件列表（用于确认操作时展示上下文）',
            },
            preview: {
              type: 'string',
              description: '预览内容（如 diff 摘要、操作说明），帮助用户做知情决策',
            },
          },
          description: '附加上下文信息，帮助用户理解问题的背景。',
        },
        timeout_ms: {
          type: 'number',
          description: '超时时间（毫秒）。默认 300000（5 分钟）。范围：5000 ~ 3600000。',
        },
      },
      required: ['question'],
    },
  },
}

/**
 * Executor for the ask_user_question tool.
 *
 * The executor calls context.askUserQuestion (injected by the UI layer)
 * to display a question card and wait for the user's response.
 *
 * If no handler is registered (e.g. in subagent context), it falls back
 * to the default_answer or a generic response.
 */
export const askUserQuestionExecutor: ToolExecutor = async (
  args: Record<string, unknown>,
  context
) => {
  const {
    question,
    type = 'yes_no',
    options,
    default_answer,
    context: questionContext,
    timeout_ms = 300_000,
  } = args as {
    question: string
    type?: 'yes_no' | 'single_choice' | 'multi_choice' | 'free_text'
    options?: string[]
    default_answer?: string
    context?: { affected_files?: string[]; preview?: string }
    timeout_ms?: number
  }

  // --- Parameter validation ---
  if (!question?.trim()) {
    return toolErrorJson(
      'ask_user_question',
      'INVALID_INPUT',
      'Parameter "question" is required and must be non-empty.',
      { retryable: true }
    )
  }

  const questionType = type as 'yes_no' | 'single_choice' | 'multi_choice' | 'free_text'

  if (
    (questionType === 'single_choice' || questionType === 'multi_choice') &&
    (!options || options.length < 2)
  ) {
    return toolErrorJson(
      'ask_user_question',
      'INVALID_INPUT',
      `Parameter "options" must have at least 2 items for type "${questionType}".`,
      { retryable: true }
    )
  }

  // Clamp timeout to safe bounds [5s, 1h]
  const clampedTimeout = Math.max(5_000, Math.min(timeout_ms, 3_600_000))

  // --- No handler: fallback ---
  if (!context.askUserQuestion) {
    return toolOkJson('ask_user_question', {
      answer: default_answer ?? 'yes',
      confirmed: false,
      timed_out: false,
    }, {
      warning:
        'No askUserQuestion handler registered. Used default answer. This is expected in subagent contexts.',
    })
  }

  // --- Wait for user response with timeout ---
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  try {
    const timeoutPromise = new Promise<{ answer: string; confirmed: boolean; timed_out: boolean }>(
      (resolve) => {
        timeoutId = setTimeout(
          () =>
            resolve({
              answer: default_answer ?? 'timeout',
              confirmed: false,
              timed_out: true,
            }),
          clampedTimeout
        )
      }
    )

    const result = await Promise.race([
      context.askUserQuestion({
        question,
        type: questionType,
        options,
        defaultAnswer: default_answer,
        context: questionContext,
        signal: context.abortSignal,
        toolCallId: context.currentToolCallId,
      }),
      timeoutPromise,
    ])

    return toolOkJson('ask_user_question', result)
  } catch {
    // AbortSignal cancelled (user stopped the agent loop)
    return toolOkJson('ask_user_question', {
      answer: default_answer ?? 'cancelled',
      confirmed: false,
      timed_out: false,
    }, {
      warning: 'Question was cancelled (agent loop aborted).',
    })
  } finally {
    // Always clean up the timeout timer to prevent memory leaks
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId)
    }
  }
}
