/**
 * MCP (Model Context Protocol) Type Definitions
 *
 * Based on MCP specification: https://spec.modelcontextprotocol.io/
 * Supports Streamable HTTP transport with JSON-RPC 2.0
 */

//=============================================================================
// JSON-RPC 2.0 Types
//=============================================================================

export interface JSONRPCRequest {
  jsonrpc: '2.0'
  id: number | string
  method: string
  params?: unknown
}

export interface JSONRPCResponse<T = unknown> {
  jsonrpc: '2.0'
  id: number | string
  result?: T
  error?: {
    code: number
    message: string
    data?: unknown
  }
}

//=============================================================================
// MCP Server Configuration
//=============================================================================

export type MCPServerType = 'builtin' | 'user' | 'project'

export type MCPTransportType = 'stdio' | 'streamable_http' | 'sse'

export interface MCPServerConfig {
  /** Unique server ID (user-defined, memorable format like "excel-analyzer") */
  id: string
  /** Display name */
  name: string
  /** Optional description */
  description?: string
  /** Server URL (HTTP endpoint for MCP SSE/Streamable HTTP) */
  url: string
  /** Transport type */
  transport: MCPTransportType
  /** Whether this server is enabled */
  enabled: boolean
  /** Optional authentication token (Bearer) */
  token?: string
  /** Timeout in milliseconds (default 30000) */
  timeout?: number
  /** Retry count (default 3) */
  retryCount?: number
  /** Retry delay in milliseconds (default 1000) */
  retryDelay?: number
  /** Server type/category */
  type?: MCPServerType
  /** Optional environment variables (JSON object) */
  env?: Record<string, string>
  /** Session ID for persistent connections */
  sessionId?: string
}

//=============================================================================
// MCP Connection State
//=============================================================================

export type MCPConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error'

export interface MCPConnectionStatus {
  serverId: string
  state: MCPConnectionState
  error?: string
  lastConnected?: number
  tools?: MCPToolDefinition[]
}

//=============================================================================
// MCP Tool Types
//=============================================================================

export interface MCPToolDefinition {
  name: string
  description?: string
  inputSchema: MCPToolInputSchema
  /** Execution hints for the tool */
  execution?: {
    /** Whether this tool requires/supports task augmentation */
    taskSupport?: 'required' | 'optional'
  }
  /** Optional server metadata */
  _serverId?: string
}

export interface MCPToolInputSchema {
  type: 'object'
  properties: Record<string, unknown>
  required?: string[]
  /** JSON Schema compatible additional properties */
  [key: string]: unknown
}

export interface MCPToolCallRequest {
  name: string
  arguments?: Record<string, unknown>
}

export interface MCPToolCallResult {
  content: Array<{
    type: 'text' | 'image' | 'resource'
    text?: string
    data?: string
    mimeType?: string
  }>
  isError?: boolean
  _meta?: {
    progressToken?: string | number
    [key: string]: unknown
  }
}

//=============================================================================
// MCP Resource Types
//=============================================================================

export interface MCPResourceDefinition {
  uri: string
  name: string
  description?: string
  mimeType?: string
}

export interface MCPResourceContent {
  uri: string
  contents: Array<{
    uri: string
    mimeType?: string
    text?: string
    blob?: string
  }>
}

//=============================================================================
// MCP Protocol Types
//=============================================================================

export interface MCPInitializeParams {
  protocolVersion: string
  capabilities: MCPClientCapabilities
  clientInfo: {
    name: string
    version: string
  }
}

export interface MCPClientCapabilities {
  roots?: {
    listChanged?: boolean
  }
  sampling?: {}
}

export interface MCPInitializeResult {
  protocolVersion: string
  serverInfo: {
    name: string
    version: string
  }
  capabilities: MCPServerCapabilities
}

export interface MCPServerCapabilities {
  tools?: {}
  resources?: {
    subscribe?: boolean
    listChanged?: boolean
  }
  prompts?: {}
}

export interface MCPToolsListResult {
  tools: MCPToolDefinition[]
}

export interface MCPResourcesListResult {
  resources: MCPResourceDefinition[]
}

//=============================================================================
// MCP Client Events
//=============================================================================

export type MCPClientEventType =
  | 'connection:stateChange'
  | 'connection:error'
  | 'tools:updated'
  | 'tool:executed'
  | 'server:added'
  | 'server:removed'
  | 'server:updated'

export interface MCPClientEvent {
  type: MCPClientEventType
  serverId: string
  data?: unknown
  timestamp: number
}

export type MCPEventListener = (event: MCPClientEvent) => void

//=============================================================================
// Error Classes (exported as values for runtime use)
//=============================================================================

export class MCPError extends Error {
  constructor(
    message: string,
    public code: number,
    public serverId?: string
  ) {
    super(message)
    this.name = 'MCPError'
  }
}

export class MCPConnectionError extends MCPError {
  constructor(serverId: string, message: string) {
    super(message, -1, serverId)
    this.name = 'MCPConnectionError'
  }
}

export class MCPToolExecutionError extends MCPError {
  constructor(serverId: string, toolName: string, message: string) {
    super(`Tool ${toolName} failed: ${message}`, -32603, serverId)
    this.name = 'MCPToolExecutionError'
  }
}

//=============================================================================
// MCP Tasks Types (MCP Tasks Specification - Nov 2025)
//=============================================================================

export type MCPTaskStatus = 'working' | 'completed' | 'failed' | 'cancelled'

export interface MCPTaskInfo {
  taskId: string
  status: MCPTaskStatus
  createdAt: string
  lastUpdatedAt: string
  /** Suggested poll interval in milliseconds */
  pollInterval?: number
  /** Human-readable status message */
  statusMessage?: string
  /** Optional TTL for task result storage */
  ttl?: number
}

export interface MCPTaskResultResponse {
  result?: MCPToolCallResult
  error?: {
    code: string
    message: string
  }
  status?: MCPTaskInfo
}

//=============================================================================
// SEP-1306: Binary Mode Elicitation for File Uploads
//=============================================================================

export type ElicitationMode = 'form' | 'url' | 'binary'

export interface FileSchemaProperty {
  type: 'file'
  title?: string
  description?: string
  accept?: string[] // MIME types or extensions like [".xlsx", ".csv"]
  maxSize?: number
  multiple?: boolean
  required?: boolean
}

export interface ElicitationSchema {
  type: 'object'
  properties: Record<string, unknown>
  required?: string[]
}

export interface UploadEndpoint {
  url: string
  method: 'POST' | 'PUT'
  uploadId: string
}

export interface BinaryElicitation {
  mode: 'binary'
  message: string
  requestedSchema: ElicitationSchema
  uploadEndpoints: Record<string, UploadEndpoint>
}

export interface FileMetadata {
  name: string
  size: number
  mimeType: string
  uploadId: string
  // Additional fields for tool usage
  file_id?: string
  download_url?: string
}
