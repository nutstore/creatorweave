/**
 * Tool system types for Agent tool calling.
 * Compatible with OpenAI function calling format.
 */

/** JSON Schema subset for tool parameter definitions */
export interface JSONSchemaProperty {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object'
  description?: string
  enum?: string[]
  items?: JSONSchemaProperty
  properties?: Record<string, JSONSchemaProperty>
  required?: string[]
  default?: unknown
}

export interface JSONSchema {
  type: 'object'
  properties: Record<string, JSONSchemaProperty>
  required?: string[]
}

export interface WorkflowProgressHooks {
  onStart?: (payload: {
    templateId: string
    label: string
    nodes: Array<{ id: string; kind: string; label: string }>
  }) => void
  onNodeStart?: (payload: { nodeId: string; kind: string }) => void
  onNodeComplete?: (payload: { nodeId: string; output: string }) => void
  onNodeError?: (payload: { nodeId: string; error: string }) => void
  onFinish?: (payload: {
    status: string
    totalTokens?: number
    errors?: string[]
  }) => void
}

export type SubagentTaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'killed'

export interface SubagentTaskUsage {
  total_tokens: number
  input_tokens: number
  output_tokens: number
  duration_ms: number
  tool_calls: number
}

export interface SubagentTaskSummary {
  agentId: string
  name?: string
  description: string
  status: SubagentTaskStatus
  created_at: number
  updated_at: number
}

export interface SubagentTaskNotification {
  event_type: 'task_notification'
  agentId: string
  status: SubagentTaskStatus
  summary: string
  result?: string
  exit_reason?: 'completed' | 'error' | 'signal' | 'timeout' | 'rejected' | 'stopped'
  usage?: SubagentTaskUsage
  error?: {
    code: string
    message: string
    recoverable: boolean
  }
  timestamp: number
}

export interface SpawnSubagentInput {
  description: string
  prompt: string
  name?: string
  mode?: 'plan' | 'act'
  run_in_background?: boolean
}

export interface SpawnSubagentSyncResult {
  status: 'completed'
  content: string
  usage?: SubagentTaskUsage
}

export interface SpawnSubagentAsyncResult {
  status: 'async_launched'
  agentId: string
}

export interface SubagentRuntime {
  spawn(input: SpawnSubagentInput): Promise<SpawnSubagentSyncResult | SpawnSubagentAsyncResult>
  sendMessage(input: {
    to: string
    message: string
  }): Promise<{
    success: boolean
    message: string
    queued_at?: number
    queue_position?: number
    resumed?: boolean
    resume_error?: { code: string; message: string; recoverable: boolean }
  }>
  stop(input: {
    agentId: string
    force?: boolean
  }): Promise<{ success: boolean; already_stopped?: boolean }>
  resume(input: {
    agentId: string
    prompt: string
  }): Promise<{
    status: 'resumed'
    agentId: string
    resumed_from: string | null
    transcript_entries_recovered: number
  }>
  getStatus(input: {
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
  }>
  list(input: {
    status?: string
    limit?: number
    offset?: number
  }): Promise<{
    agents: SubagentTaskSummary[]
    total: number
  }>
}

export interface ReadFileStateEntry {
  content: string
  timestamp: number
  offset?: number
  limit?: number
  isPartialView?: boolean
}

/** Tool definition in OpenAI function calling format */
export interface ToolDefinition {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: JSONSchema
  }
}

/** Context provided to tool executors */
export interface ToolContext {
  /** Root directory handle for file operations */
  directoryHandle: FileSystemDirectoryHandle | null
  /** Workspace ID bound to the current agent run */
  workspaceId?: string | null
  /** Active project ID for cross-namespace VFS routing */
  projectId?: string | null
  /** Current acting agent ID for VFS ACL checks */
  currentAgentId?: string | null
  /** Abort signal for cancellation */
  abortSignal?: AbortSignal
  /** Current context token usage (optional, for tools to self-regulate) */
  contextUsage?: {
    usedTokens: number
    maxTokens: number
  }
  /** Workflow progress callbacks for long-running workflow tools */
  workflowProgress?: WorkflowProgressHooks
  /** Agent execution mode: 'plan' (read-only) or 'act' (full access) */
  agentMode?: 'plan' | 'act'
  /** Subagent runtime for delegated execution */
  subagentRuntime?: SubagentRuntime
  /** Per-run cache of file content that was read by tools, keyed by normalized target path */
  readFileState?: Map<string, ReadFileStateEntry>
}

/** Tool executor function signature */
export type ToolExecutor = (args: Record<string, unknown>, context: ToolContext) => Promise<string>

/** Complete tool registration entry */
export interface ToolEntry {
  definition: ToolDefinition
  executor: ToolExecutor
}
