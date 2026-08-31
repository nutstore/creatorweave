// ============================================================
// Page Write Tools — page_click / page_fill / page_type / page_scroll / page_evaluate
//
// These mutate the upstream page. They go through the same bridge as the
// read tools (window.__agentWeb.runPageAction), so they inherit the
// Browser Extension + side-panel requirement.
//
// Authorization is enforced per-call via page-action-auth.resolveWriteAuthorization:
//   1. URL blacklist (login/payment/bank) → hard DENY, cannot be overridden
//   2. YOLO (session ?? global) → ALLOW
//   3. Default → PROMPT the user via context.askUserQuestion
//
// Mode visibility (plan/act) is handled by TOOL_MODE_CLASSIFICATION — write
// tools only appear in Act mode, so this code only runs in Act mode.
//
// IMPORTANT — capability limits (no chrome.debugger):
//   click/fill/type dispatch SYNTHETIC events (isTrusted=false). They work
//   on most sites but are rejected by strict anti-bot / login / payment
//   pages. For trusted input (captcha, payment confirm) a CDP path
//   (chrome.debugger) is required — that is Phase 2.
// ============================================================

import type { ToolDefinition, ToolExecutor, ToolPromptDoc, ToolContext } from './tool-types'
import { toolOkJson, toolErrorJson } from './tool-envelope'
import { isPageActionAvailable, runPageAction, type Locator } from './page-action-bridge'
import { resolveWriteAuthorization } from './page-action-auth'
import { useToolAuthStore } from '@/store/tool-auth.store'
import { useSessionAllowStore } from '@/store/session-allow.store'
import { locatorSchema } from './page-read.tool'

// Coarse conversation-scoped grant key shared with page-write-auth.store.
const PAGE_WRITE_MEMORY_KEY = 'page-action-write'

// --------------------------------------------------------------
// Authorization guard for write tools
// --------------------------------------------------------------
// Every write tool must pass this before calling runPageAction.
// Returns null on allow, or a toolErrorJson string on deny/cancel.
// When decision === 'prompt', shows a standalone modal (NOT the LLM's
// ask_user_question) that blocks until the user approves/denies.
// This modal has no timeout — it waits indefinitely for user action.
async function authorizeWriteOrError(toolName: string, context: ToolContext): Promise<string | null> {
  const auth = resolveWriteAuthorization(toolName)

  if (auth.decision === 'allow') return null

  if (auth.decision === 'deny') {
    return toolErrorJson(toolName, 'AUTH_DENIED', auth.promptMessage || auth.reason, {
      retryable: false,
      details: { reason: auth.reason },
    })
  }

  // decision === 'prompt' — conversation-scoped memory short-circuit first:
  // an earlier "Always allow" grant covers ALL page-action writes for this
  // conversation (coarse key, see page-write-auth.store). The URL blacklist
  // above is a separate hard pre-check and has already returned by now.
  const conversationId = context.workspaceId ?? null
  if (useSessionAllowStore.getState().has(conversationId, PAGE_WRITE_MEMORY_KEY)) {
    return null
  }

  // Show the standalone auth modal. This is NOT askUserQuestion (that's for
  // LLM conversation flow). It blocks until the user picks
  // Allow once / Always allow / Deny.
  const resolution = await useToolAuthStore.getState().request({
    toolName,
    description: auth.promptMessage || `Allow ${toolName} to modify the current page?`,
    // Coarse grant: one "Always allow" covers all page-action writes for the
    // conversation (the URL blacklist above remains a separate hard pre-check).
    memoryKey: PAGE_WRITE_MEMORY_KEY,
    conversationId,
    signal: context.abortSignal,
  })

  // Stale-approval guard: the queue outlives loop lifecycles — never let a
  // request from an already-aborted run proceed.
  if (!resolution.approved || context.abortSignal?.aborted) {
    return toolErrorJson(toolName, 'AUTH_DENIED_BY_USER', 'User denied the page write action.', {
      retryable: false,
      details: { reason: 'USER_DENIED' },
    })
  }

  // "Always allow" — persist the grant conversation-scoped. The modal only
  // shows this button when the memoryKey is non-null (always the case here).
  if (resolution.remembered) {
    useSessionAllowStore.getState().add(conversationId, PAGE_WRITE_MEMORY_KEY)
  }

  return null
}

// ===========================================================================
// page_click
// ===========================================================================

export const pageClickDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'page_click',
    description: [
      'Click an element on the upstream page.',
      '',
      'The locator MUST match exactly one element. If it matches multiple, the',
      'call fails with ELEMENT_AMBIGUOUS and returns candidates — refine the',
      'locator (add near_text / role / element_id) and retry.',
      '',
      'Uses synthetic mouse events (mouseover → mousedown → focus → mouseup →',
      'click). Works on most sites. Pages that reject synthetic events',
      '(anti-bot, some login/payment flows) will silently no-op — in that case',
      'tell the user the click may need to be done manually.',
      '',
      'Requires: Browser Extension + side-panel mode. Write action.',
    ].join('\n'),
    parameters: {
      type: 'object',
      properties: {
        locator: locatorSchema,
      },
      required: ['locator'],
    },
  },
}

export const pageClickExecutor: ToolExecutor = async (args, context) => {
  if (!isPageActionAvailable()) {
    return toolErrorJson('page_click', 'PAGE_ACTION_UNAVAILABLE', 'Page tools require the Browser Extension and side-panel mode.')
  }
  const denied = await authorizeWriteOrError('page_click', context)
  if (denied) return denied
  const locator = args.locator as Locator
  if (!locator || typeof locator !== 'object') {
    return toolErrorJson('page_click', 'INVALID_INPUT', 'locator is required and must be an object')
  }
  const result = await runPageAction({ type: 'click', locator })
  if (!result.ok) {
    return toolErrorJson('page_click', result.errorCode || 'CLICK_FAILED', result.error || 'Click failed', {
      retryable: result.errorCode === 'ELEMENT_NOT_FOUND' || result.errorCode === 'EXECUTE_SCRIPT_FAILED',
      details: result.candidates ? { candidates: result.candidates } : undefined,
    })
  }
  return toolOkJson('page_click', { element: result.element })
}

// ===========================================================================
// page_fill
// ===========================================================================

export const pageFillDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'page_fill',
    description: [
      'Replace the value of an input/textarea on the upstream page.',
      '',
      'By default clears the field first, then sets the value. Uses the native',
      'setter trick so React/Vue controlled components fire onChange correctly.',
      '',
      'Locator MUST match exactly one element. Write action.',
      'Requires: Browser Extension + side-panel mode.',
    ].join('\n'),
    parameters: {
      type: 'object',
      properties: {
        locator: locatorSchema,
        value: { type: 'string', description: 'Value to set. Replaces the current content (clearFirst=true by default).' },
        clearFirst: { type: 'boolean', description: 'Clear the field before setting (default true).' },
      },
      required: ['locator', 'value'],
    },
  },
}

export const pageFillExecutor: ToolExecutor = async (args, context) => {
  if (!isPageActionAvailable()) {
    return toolErrorJson('page_fill', 'PAGE_ACTION_UNAVAILABLE', 'Page tools require the Browser Extension and side-panel mode.')
  }
  const denied = await authorizeWriteOrError('page_fill', context)
  if (denied) return denied
  const locator = args.locator as Locator
  const value = args.value
  if (!locator || typeof locator !== 'object') {
    return toolErrorJson('page_fill', 'INVALID_INPUT', 'locator is required and must be an object')
  }
  if (typeof value !== 'string') {
    return toolErrorJson('page_fill', 'INVALID_INPUT', 'value is required and must be a string')
  }
  const result = await runPageAction({
    type: 'fill',
    locator,
    value,
    clearFirst: typeof args.clearFirst === 'boolean' ? args.clearFirst : undefined,
  })
  if (!result.ok) {
    return toolErrorJson('page_fill', result.errorCode || 'FILL_FAILED', result.error || 'Fill failed', {
      retryable: result.errorCode === 'ELEMENT_NOT_FOUND' || result.errorCode === 'EXECUTE_SCRIPT_FAILED',
      details: result.candidates ? { candidates: result.candidates } : undefined,
    })
  }
  return toolOkJson('page_fill', { element: result.element })
}

// ===========================================================================
// page_type
// ===========================================================================

export const pageTypeDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'page_type',
    description: [
      'Append text to an input/textarea on the upstream page (does not clear).',
      '',
      'Use page_fill to replace; use page_type to add to existing content.',
      'Uses the native setter trick for React/Vue compatibility.',
      '',
      'Locator MUST match exactly one element. Write action.',
      'Requires: Browser Extension + side-panel mode.',
    ].join('\n'),
    parameters: {
      type: 'object',
      properties: {
        locator: locatorSchema,
        text: { type: 'string', description: 'Text to append.' },
      },
      required: ['locator', 'text'],
    },
  },
}

export const pageTypeExecutor: ToolExecutor = async (args, context) => {
  if (!isPageActionAvailable()) {
    return toolErrorJson('page_type', 'PAGE_ACTION_UNAVAILABLE', 'Page tools require the Browser Extension and side-panel mode.')
  }
  const denied = await authorizeWriteOrError('page_type', context)
  if (denied) return denied
  const locator = args.locator as Locator
  const text = args.text
  if (!locator || typeof locator !== 'object') {
    return toolErrorJson('page_type', 'INVALID_INPUT', 'locator is required and must be an object')
  }
  if (typeof text !== 'string') {
    return toolErrorJson('page_type', 'INVALID_INPUT', 'text is required and must be a string')
  }
  const result = await runPageAction({ type: 'type', locator, text })
  if (!result.ok) {
    return toolErrorJson('page_type', result.errorCode || 'TYPE_FAILED', result.error || 'Type failed', {
      retryable: result.errorCode === 'ELEMENT_NOT_FOUND' || result.errorCode === 'EXECUTE_SCRIPT_FAILED',
      details: result.candidates ? { candidates: result.candidates } : undefined,
    })
  }
  return toolOkJson('page_type', { element: result.element })
}

// ===========================================================================
// page_scroll
// ===========================================================================

export const pageScrollDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'page_scroll',
    description: [
      'Scroll the upstream page.',
      '',
      '- With a locator: scroll the element into view (block: center).',
      '- Without a locator: scroll the window to (x, y).',
      '',
      'Write action (changes scroll position).',
      'Requires: Browser Extension + side-panel mode.',
    ].join('\n'),
    parameters: {
      type: 'object',
      properties: {
        locator: { ...locatorSchema, description: 'Optional element to scroll into view. Omit for window scroll.' },
        x: { type: 'number', description: 'Window scroll target x (only when no locator). Default 0.' },
        y: { type: 'number', description: 'Window scroll target y (only when no locator). Default 0.' },
        behavior: { type: 'string', enum: ['auto', 'smooth', 'instant'], description: 'Scroll behavior. Default smooth.' },
      },
    },
  },
}

export const pageScrollExecutor: ToolExecutor = async (args, context) => {
  if (!isPageActionAvailable()) {
    return toolErrorJson('page_scroll', 'PAGE_ACTION_UNAVAILABLE', 'Page tools require the Browser Extension and side-panel mode.')
  }
  const denied = await authorizeWriteOrError('page_scroll', context)
  if (denied) return denied
  const locator = args.locator as Locator | undefined
  const result = await runPageAction({
    type: 'scroll',
    locator,
    x: typeof args.x === 'number' ? args.x : undefined,
    y: typeof args.y === 'number' ? args.y : undefined,
    behavior: typeof args.behavior === 'string' ? (args.behavior as 'auto' | 'smooth' | 'instant') : undefined,
  })
  if (!result.ok) {
    return toolErrorJson('page_scroll', result.errorCode || 'SCROLL_FAILED', result.error || 'Scroll failed', { retryable: result.errorCode === 'EXECUTE_SCRIPT_FAILED' })
  }
  return toolOkJson('page_scroll', { ok: true })
}

// ===========================================================================
// page_evaluate
// ===========================================================================

export const pageEvaluateDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'page_evaluate',
    description: [
      'Execute a JavaScript expression in the upstream page context and return',
      'the result. Intended for READ-ONLY diagnostics and dynamic data',
      'extraction (e.g. read a global variable, inspect computed styles).',
      '',
      'AVOID using this for DOM mutation — prefer page_click/page_fill which',
      'dispatch proper events. Misuse can break the page.',
      '',
      'The expression runs as an async function body, so `await` is allowed.',
      'Requires: Browser Extension + side-panel mode.',
    ].join('\n'),
    parameters: {
      type: 'object',
      properties: {
        expression: { type: 'string', description: 'JavaScript expression to evaluate (async function body).' },
      },
      required: ['expression'],
    },
  },
}

export const pageEvaluateExecutor: ToolExecutor = async (args, context) => {
  if (!isPageActionAvailable()) {
    return toolErrorJson('page_evaluate', 'PAGE_ACTION_UNAVAILABLE', 'Page tools require the Browser Extension and side-panel mode.')
  }
  const denied = await authorizeWriteOrError('page_evaluate', context)
  if (denied) return denied
  const expression = args.expression
  if (typeof expression !== 'string' || !expression.trim()) {
    return toolErrorJson('page_evaluate', 'INVALID_INPUT', 'expression is required and must be a non-empty string')
  }
  const result = await runPageAction({ type: 'evaluate', expression })
  if (!result.ok) {
    return toolErrorJson('page_evaluate', result.errorCode || 'EVALUATE_FAILED', result.error || 'Evaluation failed', { retryable: result.errorCode === 'EXECUTE_SCRIPT_FAILED' })
  }
  return toolOkJson('page_evaluate', { result: result.result })
}

// ===========================================================================
// Prompt doc
// ===========================================================================

export const pageWritePromptDoc: ToolPromptDoc = {
  category: 'page',
  section: '### Page Tools (write — Browser Extension + side panel)',
  lines: [
    '- `page_click(locator)` - Click an element (synthetic events; locator must match exactly one)',
    '- `page_fill(locator, value, clearFirst?)` - Replace input value (React/Vue compatible)',
    '- `page_type(locator, text)` - Append text to an input',
    '- `page_scroll(locator?, x?, y?, behavior?)` - Scroll element into view, or window to (x,y)',
    '- `page_evaluate(expression)` - Run JS in the page (read-only diagnostics; avoid DOM mutation)',
  ],
}
