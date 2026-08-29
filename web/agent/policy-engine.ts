/**
 * Tool Policy Engine — the single authorization decision point.
 *
 * Every tool falls into one of three policy levels:
 *   auto      — run without asking (read tools, sandboxed tools, OPFS writes
 *               that still go through pending-changes review)
 *   prompt    — ask the user via the unified ToolAuthModal (disk writes,
 *               external MCP/WebMCP calls, destructive rollbacks, page-action
 *               writes, exec commands the native host flagged as prompt)
 *   forbidden — never runnable by the LLM (self-privilege-escalation)
 *
 * Decision order (first match wins, see redesign doc §3.2):
 *   1. forbidden                        → deny
 *   2. session memory hit               → allow   ("always allow this convo")
 *   3. yolo mode on                     → allow   (never for forbidden)
 *   4. level === 'auto'                 → allow
 *   5. otherwise                        → prompt via tool-auth.store
 *
 * PR-1 scope: the engine exists and exec/page-write route through it, but no
 * behavior changes — the same tools prompt as before, just through the shared
 * channel. Later PRs reclassify call_tool, add sync-to-disk, and generalize
 * yolo on top of this decision flow.
 */

import { useToolAuthStore } from '@/store/tool-auth.store'
import { useSessionAllowStore } from '@/store/session-allow.store'
import { usePageActionSessionStore } from '@/store/page-action-session.store'

export type ToolPolicyLevel = 'auto' | 'prompt' | 'forbidden'

export interface ToolPolicy {
  /** Default decision level for the tool. */
  level: ToolPolicyLevel
  /**
   * Human-readable context rendered inside ToolAuthModal. Return a short
   * sentence describing what exactly is about to happen.
   */
  describe?: (args: unknown) => string
  /**
   * Session-memory key generator. A non-null key enables the "Always allow
   * for this conversation" button and the session-allow short-circuit.
   * Return null for tools that must ask every single time (e.g. untrusted
   * external tools).
   */
  memoryKey?: (args: unknown) => string | null
}

export interface AuthorizeRequest {
  /** Tool name, e.g. 'exec', 'sync-to-disk', 'call_tool'. */
  toolName: string
  /** Tool arguments, passed to describe()/memoryKey() for context. */
  args?: unknown
  /** Conversation id (ToolContext.workspaceId). Scopes session memory. */
  conversationId?: string | null
  /** Abort signal of the originating run — aborting resolves as deny. */
  signal?: AbortSignal
  /**
   * Extra runtime constraints beyond the static policy table.
   * Currently: plan mode downgrades call_tool to per-call approval
   * ("always allow" is suppressed — a plan-phase approval must not
   * silently pre-authorize later calls, possibly in act mode).
   */
  mode?: 'plan' | 'act'
}

export type AuthResult =
  | { decision: 'allow'; via: 'forbidden-never' | 'session-memory' | 'yolo' | 'auto' }
  | { decision: 'deny'; reason: string }

/**
 * Full authorization flow for one tool invocation. Resolves when the tool may
 * run (allow) or must not (deny, with a reason the LLM can act on).
 */
export async function authorize(req: AuthorizeRequest): Promise<AuthResult> {
  const policy = getToolPolicy(req.toolName)

  // 1. forbidden — never overridable by memory, yolo, or any config.
  if (policy.level === 'forbidden') {
    return {
      decision: 'deny',
      reason: `Tool "${req.toolName}" is forbidden by tool policy and cannot be executed.`,
    }
  }

  // 2. conversation-scoped "always allow" memory. Suppressed in plan mode —
  // an approval granted during plan exploration must not pre-authorize the
  // execution phase (possibly after a plan→act switch).
  const memoryKey = policy.memoryKey?.(req.args) ?? null
  const memoryAllowed = req.mode !== 'plan'
  if (
    memoryAllowed &&
    memoryKey !== null &&
    useSessionAllowStore.getState().has(req.conversationId, memoryKey)
  ) {
    return { decision: 'allow', via: 'session-memory' }
  }

  // 3. yolo mode — skips every prompt-level modal (still not forbidden).
  if (usePageActionSessionStore.getState().pageActionYolo) {
    return { decision: 'allow', via: 'yolo' }
  }

  // 4. auto — no user interaction needed.
  if (policy.level === 'auto') {
    return { decision: 'allow', via: 'auto' }
  }

  // 5. prompt — unified modal. Resolves false on deny or abort. In plan mode
  // the "always allow" option is stripped (memoryKey forced null).
  const resolution = await useToolAuthStore.getState().request({
    toolName: req.toolName,
    description: policy.describe?.(req.args) ?? '',
    memoryKey: memoryAllowed ? memoryKey : null,
    conversationId: req.conversationId ?? null,
    signal: req.signal,
  })
  if (!resolution.approved) {
    return {
      decision: 'deny',
      reason: `User denied permission for "${req.toolName}".`,
    }
  }
  // "Always allow" — write the grant into conversation-scoped memory so the
  // short-circuit at step 2 hits on subsequent invocations.
  if (resolution.remembered && memoryKey !== null) {
    useSessionAllowStore.getState().add(req.conversationId, memoryKey)
  }
  return { decision: 'allow', via: 'auto' }
}

// ---------------------------------------------------------------------------
// Policy table
// ---------------------------------------------------------------------------

const PAGE_ACTION_WRITE_TOOLS = new Set([
  'page_click',
  'page_fill',
  'page_type',
  'page_scroll',
  'page_evaluate',
])

function createPolicyTable(): Map<string, ToolPolicy> {
  const table = new Map<string, ToolPolicy>()
  const set = (name: string, policy: ToolPolicy) => table.set(name, policy)

  // -- auto: read-only & sandboxed -----------------------------------------
  for (const name of [
    'read', 'write', 'edit', 'delete', 'search', 'ls',
    'run_python', 'bash',
    'ocr',
    'canvas_add_node', 'canvas_connect', 'canvas_create', 'canvas_disconnect',
    'canvas_get', 'canvas_remove', 'canvas_run', 'canvas_update',
    'create_checkpoint', 'detect_conflicts', 'rollback_checkpoint',
    'search_conversations', 'search_skills', 'install_skill',
    'read_skill', 'read_skill_resource',
    'ask_user_question', 'delegate_to',
    'spawn_subagent', 'batch_spawn', 'send_message_to_subagent',
    'stop_subagent', 'resume_subagent', 'get_subagent_status', 'list_subagents',
    'sync-to-opfs', 'search_tools', 'get_page_tools',
    'web_search', 'web_fetch', 'generate_image',
    'page_snapshot', 'page_text_content', 'page_find_elements',
    'page_synthesize_locators', 'page_screenshot',
  ]) {
    set(name, { level: 'auto' })
  }

  // -- prompt: user confirmation required -----------------------------------

  // sync-to-disk: writing to the REAL disk is the risk-bearing step of the
  // file pipeline (OPFS writes stay auto — they have pending review +
  // snapshots as a second line of defense; the disk does not). Fixed memory
  // key so one "always allow" covers the conversation.
  set('sync-to-disk', {
    level: 'prompt',
    describe: (args) => {
      const count = (args as { count?: number } | null)?.count
      return typeof count === 'number' && count > 0
        ? `Will write ${count} pending file change${count === 1 ? '' : 's'} to the real disk directory.`
        : 'Will write pending file changes to the real disk directory.'
    },
    memoryKey: () => 'sync-to-disk',
  })

  // call_tool: first invocation of a server+tool combination always prompts;
  // "always allow" whitelists it for the conversation. Tools coming from
  // untrusted-content pages never get a memory key — they must be approved
  // every single time (prompt-injection surface).
  set('call_tool', {
    level: 'prompt',
    describe: (args) => {
      const a = args as { full_tool_name?: string } | null
      return a?.full_tool_name
        ? `The agent wants to call the external tool "${a.full_tool_name}".`
        : 'The agent wants to call an external MCP/WebMCP tool.'
    },
    memoryKey: (args) => {
      const a = args as { full_tool_name?: string; untrusted?: boolean } | null
      // Untrusted-content tools (annotated pages) are never remembered —
      // every single call must be explicitly approved.
      if (a?.untrusted) return null
      const fullName = a?.full_tool_name?.trim()
      if (!fullName) return null // unusable name → cannot build a safe key
      return `call_tool::${fullName}`
    },
  })

  set('snapshot_restore', {
    level: 'prompt',
    describe: () => 'Restores files to a previous snapshot — unsaved pending changes may be discarded.',
    memoryKey: () => null, // rollbacks are too consequential to remember
  })

  for (const name of PAGE_ACTION_WRITE_TOOLS) {
    set(name, {
      level: 'prompt',
      describe: (args) => {
        const url = (args as { url?: string } | null)?.url
        return url
          ? `The agent wants to interact with the page (${url}).`
          : 'The agent wants to interact with the current page.'
      },
      // The URL blacklist (page-action-auth.ts) is a separate hard pre-check;
      // memory is deliberately coarse — one grant covers page-action writes.
      memoryKey: () => 'page-action-write',
    })
  }

  // exec: the three-way decision itself is made by the native host
  // (execpolicy.json). The web side only receives the mapped result, so exec
  // does NOT go through getToolPolicy()/authorize() — exec.tool.ts maps
  // auto/prompt/forbidden directly onto the shared modal channel.
  set('exec', { level: 'auto' })

  // -- forbidden: LLM must never self-escalate ------------------------------
  set('switch_agent_mode', { level: 'forbidden' })

  return table
}

const POLICY_TABLE = createPolicyTable()

/** Look up a tool's policy. Unregistered tools default to auto (today's behavior). */
export function getToolPolicy(toolName: string): ToolPolicy {
  return POLICY_TABLE.get(toolName) ?? { level: 'auto' }
}

/** Test/diagnostic helper — the full table. */
export function getAllToolPolicies(): Map<string, ToolPolicy> {
  return POLICY_TABLE
}
