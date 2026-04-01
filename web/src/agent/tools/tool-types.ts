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
