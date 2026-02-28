/**
 * MCP Client Service
 *
 * Browser-based MCP client supporting Streamable HTTP transport.
 * Connects to MCP servers, discovers tools/resources, and executes tool calls.
 *
 * Based on MCP specification: https://spec.modelcontextprotocol.io/
 */

import type {
  JSONRPCRequest,
  JSONRPCResponse,
  MCPServerConfig,
  MCPConnectionState,
  MCPConnectionStatus,
  MCPToolDefinition,
  MCPToolCallRequest,
  MCPToolCallResult,
  MCPResourceDefinition,
  MCPInitializeResult,
  MCPToolsListResult,
  MCPResourcesListResult,
  MCPInitializeParams,
  MCPClientEvent,
  MCPClientEventType,
  MCPEventListener,
} from '../mcp/mcp-types'

import { MCPError, MCPConnectionError, MCPToolExecutionError } from '../mcp/mcp-types'

//=============================================================================
// Configuration
//=============================================================================

const MCP_PROTOCOL_VERSION = '2024-11-05'
const DEFAULT_CLIENT_INFO = {
  name: 'bfosa-mcp-client',
  version: '0.1.0',
}

const DEFAULT_TIMEOUT = 30000 // 30 seconds

type TaskInfo = { taskId: string; status: string; statusMessage?: string }
type TaskResultLike = {
  result?: unknown
  taskId?: unknown
  status?: unknown
  statusMessage?: unknown
  content?: unknown
}

//=============================================================================
// MCP Client Service Class
//=============================================================================

export class MCPClientService {
  /** Registered servers */
  private servers: Map<string, MCPServerConfig> = new Map()

  /** Connection states by server ID */
  private connections: Map<string, MCPConnectionStatus> = new Map()

  /** Event listeners */
  private listeners: Map<MCPClientEventType, Set<MCPEventListener>> = new Map()

  /** Message ID counter for JSON-RPC */
  private messageId = 0

  //===========================================================================
  // Server Management
  //===========================================================================

  /**
   * Add or update an MCP server configuration
   */
  addServer(config: MCPServerConfig): void {
    const normalizedUrl = config.url.replace(/\/$/, '')
    const server = { ...config, url: normalizedUrl }

    const existing = this.servers.get(config.id)
    this.servers.set(config.id, server)

    this.emit({
      type: existing ? 'server:updated' : 'server:added',
      serverId: config.id,
      data: server,
      timestamp: Date.now(),
    })

    console.log(`[MCPClient] ${existing ? 'Updated' : 'Added'} server:`, config.id)
  }

  /**
   * Remove an MCP server
   */
  removeServer(serverId: string): boolean {
    const removed = this.servers.delete(serverId)
    this.connections.delete(serverId)

    if (removed) {
      this.emit({
        type: 'server:removed',
        serverId,
        timestamp: Date.now(),
      })
      console.log(`[MCPClient] Removed server:`, serverId)
    }

    return removed
  }

  /**
   * Get a server configuration by ID
   */
  getServer(serverId: string): MCPServerConfig | undefined {
    return this.servers.get(serverId)
  }

  /**
   * Get all server configurations
   */
  getAllServers(): MCPServerConfig[] {
    return Array.from(this.servers.values())
  }

  /**
   * Get only enabled servers
   */
  getEnabledServers(): MCPServerConfig[] {
    return this.getAllServers().filter((s) => s.enabled)
  }

  //===========================================================================
  // Connection Management
  //===========================================================================

  /**
   * Connect to an MCP server (initialize session)
   */
  async connect(serverId: string): Promise<MCPInitializeResult> {
    const server = this.servers.get(serverId)
    if (!server) {
      throw new MCPConnectionError(serverId, `Server not found: ${serverId}`)
    }

    if (!server.enabled) {
      throw new MCPConnectionError(serverId, `Server is disabled: ${serverId}`)
    }

    this.updateConnectionState(serverId, 'connecting')

    try {
      const initParams: MCPInitializeParams = {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: DEFAULT_CLIENT_INFO,
      }

      const result = await this.sendRequest<MCPInitializeResult>(server, 'initialize', initParams)

      // Store session ID if provided
      if (result.capabilities) {
        // Server responded with capabilities
      }

      this.updateConnectionState(serverId, 'connected')

      console.log(`[MCPClient] Connected to ${serverId}:`, result.serverInfo)

      // Auto-discover tools after connection
      await this.discoverTools(serverId)

      return result
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      this.updateConnectionState(serverId, 'error', errorMessage)
      throw new MCPConnectionError(serverId, errorMessage)
    }
  }

  /**
   * Disconnect from an MCP server
   */
  disconnect(serverId: string): void {
    this.updateConnectionState(serverId, 'disconnected')
    console.log(`[MCPClient] Disconnected from:`, serverId)
  }

  /**
   * Get connection status for a server
   */
  getConnectionStatus(serverId: string): MCPConnectionStatus | undefined {
    return this.connections.get(serverId)
  }

  /**
   * Get all connection statuses
   */
  getAllConnectionStatuses(): MCPConnectionStatus[] {
    return Array.from(this.connections.values())
  }

  //===========================================================================
  // Tool Discovery
  //===========================================================================

  /**
   * Discover available tools from a server
   */
  async discoverTools(serverId: string): Promise<MCPToolDefinition[]> {
    const server = this.servers.get(serverId)
    if (!server) {
      throw new MCPConnectionError(serverId, `Server not found: ${serverId}`)
    }

    const result = await this.sendRequest<MCPToolsListResult>(server, 'tools/list')

    // Add server ID to each tool for tracking
    const tools = result.tools.map((tool) => ({
      ...tool,
      _serverId: serverId,
    }))

    // Log tools that support MCP Tasks
    const taskSupportedTools = tools.filter((t) => t.execution?.taskSupport)
    if (taskSupportedTools.length > 0) {
      console.log(
        `[MCPClient] Found ${taskSupportedTools.length} tools with MCP Tasks support:`,
        taskSupportedTools.map((t) => `${t.name} (${t.execution?.taskSupport})`)
      )
    }

    // Update connection status with tools
    const status = this.connections.get(serverId)
    if (status) {
      status.tools = tools
    }

    this.emit({
      type: 'tools:updated',
      serverId,
      data: { tools },
      timestamp: Date.now(),
    })

    console.log(`[MCPClient] Discovered ${tools.length} tools from ${serverId}:`)

    return tools
  }

  /**
   * Get all discovered tools from all connected servers
   */
  getAllTools(): MCPToolDefinition[] {
    const allTools: MCPToolDefinition[] = []

    for (const status of this.connections.values()) {
      if (status.state === 'connected' && status.tools) {
        allTools.push(...status.tools)
      }
    }

    return allTools
  }

  //===========================================================================
  // Tool Execution
  //===========================================================================

  //===========================================================================
  // MCP Tasks Support
  //===========================================================================

  /**
   * Check if a tool result contains a task ID (MCP Tasks augmentation)
   *
   * Handles two response formats:
   * 1. Direct object with taskId/status
   * 2. TextContent with JSON string containing taskId/status
   */
  private isTaskResult(result: unknown): result is { taskId: string; status: string } {
    if (typeof result !== 'object' || result === null) {
      console.log('[MCPClient] isTaskResult: not an object or null')
      return false
    }

    // Handle FastMCP wrapping: { result: { content: [...] } }
    // FastMCP wraps CallToolResult in an extra "result" layer
    const wrapped = result as TaskResultLike
    const actualResult =
      wrapped.result && typeof wrapped.result === 'object'
        ? (wrapped.result as TaskResultLike)
        : wrapped

    // Direct format: { taskId, status, ... }
    if ('taskId' in actualResult && 'status' in actualResult) {
      const isValid =
        typeof actualResult.taskId === 'string' && typeof actualResult.status === 'string'
      console.log(`[MCPClient] isTaskResult: direct format check - ${isValid}`)
      return isValid
    }

    // TextContent format: { content: [{ type: "text", text: "{\"taskId\":\"...\",...}" }] }
    if (Array.isArray(actualResult.content)) {
      const textContent = actualResult.content[0]
      console.log('[MCPClient] isTaskResult: checking TextContent format', {
        contentType:
          textContent && typeof textContent === 'object'
            ? (textContent as { type?: unknown }).type
            : undefined,
      })
      if (
        textContent &&
        typeof textContent === 'object' &&
        (textContent as { type?: unknown }).type === 'text' &&
        typeof (textContent as { text?: unknown }).text === 'string'
      ) {
        try {
          const parsed = JSON.parse((textContent as { text: string }).text)
          const hasTaskFields =
            !!parsed &&
            typeof parsed === 'object' &&
            'taskId' in parsed &&
            'status' in parsed
          console.log(`[MCPClient] isTaskResult: TextContent parsed - ${hasTaskFields}`, parsed)
          return hasTaskFields
        } catch (e) {
          console.log('[MCPClient] isTaskResult: failed to parse TextContent', e)
          return false
        }
      }
    }

    console.log('[MCPClient] isTaskResult: no matching format', Object.keys(actualResult))
    return false
  }

  /**
   * Extract task info from a task-augmented result
   */
  private extractTaskInfo(result: unknown): TaskInfo {
    // Handle FastMCP wrapping: { result: { content: [...] } }
    const wrapped = (typeof result === 'object' && result !== null ? result : {}) as TaskResultLike
    const actualResult =
      wrapped.result && typeof wrapped.result === 'object'
        ? (wrapped.result as TaskResultLike)
        : wrapped

    // Direct format
    if (typeof actualResult.taskId === 'string' && typeof actualResult.status === 'string') {
      return {
        taskId: actualResult.taskId,
        status: actualResult.status,
        statusMessage:
          typeof actualResult.statusMessage === 'string' ? actualResult.statusMessage : undefined,
      }
    }

    // TextContent format
    if (Array.isArray(actualResult.content)) {
      const first = actualResult.content[0]
      if (
        first &&
        typeof first === 'object' &&
        (first as { type?: unknown }).type === 'text' &&
        typeof (first as { text?: unknown }).text === 'string'
      ) {
        try {
          const parsed = JSON.parse((first as { text: string }).text) as Partial<TaskInfo>
          if (typeof parsed.taskId === 'string' && typeof parsed.status === 'string') {
            return {
              taskId: parsed.taskId,
              status: parsed.status,
              statusMessage:
                typeof parsed.statusMessage === 'string' ? parsed.statusMessage : undefined,
            }
          }
        } catch {
          throw new Error('Failed to parse task result')
        }
      }
    }

    throw new Error('Invalid task result format')
  }

  /**
   * Poll for task status using the MCP Tasks /tasks/get endpoint
   */
  private async getTaskStatus(
    server: MCPServerConfig,
    taskId: string
  ): Promise<{
    taskId: string
    status: string
    statusMessage?: string
    createdAt: string
    lastUpdatedAt: string
  }> {
    const baseUrl = server.url.replace(/\/mcp?$/, '')

    const response = await fetch(`${baseUrl}/tasks/get`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(server.token && { Authorization: `Bearer ${server.token}` }),
      },
      body: JSON.stringify({ taskId }),
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: Failed to get task status`)
    }

    const data = await response.json()

    if (data.error) {
      throw new Error(data.error.message || 'Failed to get task status')
    }

    return data.result
  }

  /**
   * Get final task result using the MCP Tasks /tasks/result endpoint
   * Implements client-side polling based on pollInterval from server
   */
  private async getTaskResult(
    server: MCPServerConfig,
    taskId: string,
    onProgress?: (status: string, message?: string) => void
  ): Promise<MCPToolCallResult> {
    const baseUrl = server.url.replace(/\/mcp?$/, '')
    const DEFAULT_POLL_INTERVAL = 2000 // 2 seconds
    const MAX_POLL_TIME = 300000 // 5 minutes max

    const startTime = Date.now()

    while (Date.now() - startTime < MAX_POLL_TIME) {
      // Poll /tasks/result - returns immediately with current status
      const response = await fetch(`${baseUrl}/tasks/result`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(server.token && { Authorization: `Bearer ${server.token}` }),
        },
        body: JSON.stringify({ taskId }),
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: Failed to get task result`)
      }

      const data = await response.json()

      // Check if task returned an error
      if (data.error) {
        throw new Error(data.error.message || 'Task failed')
      }

      // Check if we have the final result
      if (data.result) {
        return data.result as MCPToolCallResult
      }

      // Task still in progress - get pollInterval and wait
      if (data.status) {
        const { status, statusMessage, pollInterval } = data.status as {
          status: string
          statusMessage?: string
          pollInterval?: number
        }

        onProgress?.(status, statusMessage)

        // Wait based on server's pollInterval (in ms), or use default
        const waitTime = pollInterval || DEFAULT_POLL_INTERVAL
        await new Promise((resolve) => setTimeout(resolve, waitTime))
      } else {
        // Unexpected response format
        throw new Error('Unexpected response from server: missing status and result')
      }
    }

    throw new Error('Task result timeout after 5 minutes')
  }

  /**
   * Execute a tool with automatic MCP Tasks handling
   *
   * If the tool returns a taskId, this method will poll for status
   * and return the final result automatically.
   *
   * @param serverId - The MCP server ID
   * @param toolCall - The tool call request
   * @param onProgress - Optional callback for progress updates
   * @returns The final tool result (after task completion if applicable)
   */
  async executeTool(
    serverId: string,
    toolCall: MCPToolCallRequest,
    onProgress?: (status: string, message?: string) => void
  ): Promise<MCPToolCallResult> {
    const server = this.servers.get(serverId)
    if (!server) {
      throw new MCPConnectionError(serverId, `Server not found: ${serverId}`)
    }

    const status = this.connections.get(serverId)
    if (status?.state !== 'connected') {
      throw new MCPConnectionError(serverId, `Server not connected: ${serverId}`)
    }

    // Check if tool declares task support (from discovery)
    const tool = status.tools?.find((t) => t.name === toolCall.name)
    const taskSupport = tool?.execution?.taskSupport

    // Auto-add task parameter for tools that support/require it
    let finalToolCall = toolCall
    if (taskSupport === 'required' || taskSupport === 'optional') {
      // Wrap arguments with task parameter for MCP Tasks
      finalToolCall = {
        ...toolCall,
        arguments: {
          ...toolCall.arguments,
          task: { ttl: 300000 }, // 5 minute timeout
        },
      }
      console.log(
        `[MCPClient] Auto-enabled task mode for ${toolCall.name} (taskSupport=${taskSupport})`
      )
    }

    try {
      const result = await this.sendRequest<MCPToolCallResult>(server, 'tools/call', finalToolCall)

      // Check if this is a task-augmented response
      if (this.isTaskResult(result)) {
        const taskResult = this.extractTaskInfo(result)

        console.log(`[MCPClient] Task created: ${taskResult.taskId}, status: ${taskResult.status}`)

        if (onProgress) {
          onProgress(taskResult.status, taskResult.statusMessage)
        }

        // Wait for task completion and get final result
        const finalResult = await this.getTaskResult(server, taskResult.taskId, onProgress)

        this.emit({
          type: 'tool:executed',
          serverId,
          data: { toolName: toolCall.name, result: finalResult, taskId: taskResult.taskId },
          timestamp: Date.now(),
        })

        return finalResult
      }

      this.emit({
        type: 'tool:executed',
        serverId,
        data: { toolName: toolCall.name, result },
        timestamp: Date.now(),
      })

      return result
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      throw new MCPToolExecutionError(serverId, toolCall.name, errorMessage)
    }
  }

  /**
   * Execute a tool and return immediately with taskId if it's a long-running task
   *
   * This is the "fire and forget" mode - useful when you want to start
   * a task and poll for status separately.
   *
   * @param serverId - The MCP server ID
   * @param toolCall - The tool call request
   * @returns The tool result (may contain taskId)
   */
  async executeToolAsync(
    serverId: string,
    toolCall: MCPToolCallRequest
  ): Promise<{ result: MCPToolCallResult; taskId?: string }> {
    const server = this.servers.get(serverId)
    if (!server) {
      throw new MCPConnectionError(serverId, `Server not found: ${serverId}`)
    }

    const status = this.connections.get(serverId)
    if (status?.state !== 'connected') {
      throw new MCPConnectionError(serverId, `Server not connected: ${serverId}`)
    }

    const result = await this.sendRequest<MCPToolCallResult>(server, 'tools/call', toolCall)

    // Check if this is a task-augmented response
    if (this.isTaskResult(result)) {
      const taskResult = this.extractTaskInfo(result)
      return { result, taskId: taskResult.taskId }
    }

    return { result }
  }

  /**
   * Poll for task status (for async tool execution)
   *
   * @param serverId - The MCP server ID
   * @param taskId - The task ID to poll
   * @returns Current task status
   */
  async pollTaskStatus(
    serverId: string,
    taskId: string
  ): Promise<{
    taskId: string
    status: string
    statusMessage?: string
    createdAt: string
    lastUpdatedAt: string
  }> {
    const server = this.servers.get(serverId)
    if (!server) {
      throw new MCPConnectionError(serverId, `Server not found: ${serverId}`)
    }

    return this.getTaskStatus(server, taskId)
  }

  /**
   * Get the final result of a completed task
   *
   * @param serverId - The MCP server ID
   * @param taskId - The task ID
   * @param onProgress - Optional callback for progress updates during polling
   * @returns The final tool result
   */
  async getTaskResultById(
    serverId: string,
    taskId: string,
    onProgress?: (status: string, message?: string) => void
  ): Promise<MCPToolCallResult> {
    const server = this.servers.get(serverId)
    if (!server) {
      throw new MCPConnectionError(serverId, `Server not found: ${serverId}`)
    }

    return this.getTaskResult(server, taskId, onProgress)
  }

  /**
   * Execute a tool by full tool name (format: serverId:toolName)
   */
  async executeToolByFullName(
    fullToolName: string,
    args: Record<string, unknown> = {}
  ): Promise<MCPToolCallResult> {
    const [serverId, ...toolNameParts] = fullToolName.split(':')
    const toolName = toolNameParts.join(':')

    if (!serverId || !toolName) {
      throw new Error(`Invalid tool name format: ${fullToolName}. Expected: serverId:toolName`)
    }

    return this.executeTool(serverId, { name: toolName, arguments: args })
  }

  //===========================================================================
  // Resources
  //===========================================================================

  /**
   * List available resources from a server
   */
  async listResources(serverId: string): Promise<MCPResourceDefinition[]> {
    const server = this.servers.get(serverId)
    if (!server) {
      throw new MCPConnectionError(serverId, `Server not found: ${serverId}`)
    }

    const result = await this.sendRequest<MCPResourcesListResult>(server, 'resources/list')

    console.log(`[MCPClient] Found ${result.resources.length} resources from ${serverId}`)

    return result.resources
  }

  /**
   * Read a resource from a server
   */
  async readResource(serverId: string, uri: string): Promise<unknown> {
    const server = this.servers.get(serverId)
    if (!server) {
      throw new MCPConnectionError(serverId, `Server not found: ${serverId}`)
    }

    return this.sendRequest(server, 'resources/read', { uri })
  }

  //===========================================================================
  // Low-level Communication
  //===========================================================================

  /**
   * Send a JSON-RPC request to an MCP server
   */
  private async sendRequest<T>(
    server: MCPServerConfig,
    method: string,
    params: unknown = {}
  ): Promise<T> {
    const requestId = ++this.messageId

    const request: JSONRPCRequest = {
      jsonrpc: '2.0',
      id: requestId,
      method,
      params,
    }

    console.log(`[MCPClient] → ${server.id} ${method}:`, params)

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    }

    // Add auth token if present
    if (server.token) {
      headers['Authorization'] = `Bearer ${server.token}`
    }

    // Add session ID if present
    if (server.sessionId) {
      headers['Mcp-Session-Id'] = server.sessionId
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT)

    try {
      const response = await fetch(server.url, {
        method: 'POST',
        headers,
        body: JSON.stringify(request),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const contentType = response.headers.get('Content-Type') || ''

      // Handle SSE stream response
      if (contentType.includes('text/event-stream')) {
        return await this.readSSEStream<T>(response)
      }

      // Handle JSON response
      const data: JSONRPCResponse<T> = await response.json()

      if (data.error) {
        console.error(`[MCPClient] ← ${server.id} error:`, data.error)
        throw new MCPError(data.error.message, data.error.code, server.id)
      }

      console.log(`[MCPClient] ← ${server.id} ${method}:`, data.result)
      // Log the full response for debugging task detection
      if (method === 'tools/call') {
        console.log('[MCPClient] Full tools/call response:', JSON.stringify(data, null, 2))
      }

      return data.result as T
    } catch (error) {
      clearTimeout(timeoutId)

      if (error instanceof TypeError && error.message === 'Failed to fetch') {
        throw new MCPConnectionError(
          server.id,
          'Network error - check CORS and server availability'
        )
      }

      if (error instanceof Error && error.name === 'AbortError') {
        throw new MCPConnectionError(server.id, `Request timeout (${DEFAULT_TIMEOUT}ms)`)
      }

      throw error
    }
  }

  /**
   * Read an SSE stream response from the server
   *
   * SSE format from FastMCP:
   *   event: message
   *   data: {"jsonrpc":"2.0","id":1,"result":{...}}
   *
   * Note: event field is optional, data field contains the JSON-RPC message
   */
  private async readSSEStream<T>(response: Response): Promise<T> {
    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('No response body for SSE stream')
    }

    const decoder = new TextDecoder()
    let buffer = ''
    let result: T | null = null

    try {
      let doneReading = false
      while (!doneReading) {
        const { done, value } = await reader.read()
        if (done) {
          doneReading = true
          break
        }

        buffer += decoder.decode(value, { stream: true })

        // Normalize line endings and split by double newline
        const normalized = buffer.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
        const events = normalized.split('\n\n')
        buffer = events.pop() || '' // Keep incomplete part

        for (const event of events) {
          if (!event.trim()) continue // Skip empty events

          // Parse event lines (format: "field: value")
          const lines = event.trim().split('\n')
          let eventData: string | null = null

          for (const line of lines) {
            if (line.startsWith('data:')) {
              eventData = line.slice(5).trim() // Remove "data:" prefix
            }
          }

          if (eventData) {
            try {
              const parsed = JSON.parse(eventData)

              // JSON-RPC response
              if ('result' in parsed) {
                result = parsed.result as T
              } else if ('error' in parsed) {
                throw new MCPError(
                  (parsed.error as { message: string }).message,
                  (parsed.error as { code: number }).code
                )
              }
            } catch (e) {
              if (e instanceof MCPError) throw e
              console.warn('[MCPClient] Failed to parse SSE data:', eventData)
            }
          }
        }

        // If we got a result, we can stop reading
        if (result) {
          break
        }
      }

      if (!result) {
        throw new Error('SSE stream ended without response')
      }

      return result
    } finally {
      reader.releaseLock()
    }
  }

  //===========================================================================
  // Event Handling
  //===========================================================================

  /**
   * Add an event listener
   */
  on(eventType: MCPClientEventType, listener: MCPEventListener): void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set())
    }
    this.listeners.get(eventType)!.add(listener)
  }

  /**
   * Remove an event listener
   */
  off(eventType: MCPClientEventType, listener: MCPEventListener): void {
    this.listeners.get(eventType)?.delete(listener)
  }

  /**
   * Emit an event to all listeners
   */
  private emit(event: MCPClientEvent): void {
    const listeners = this.listeners.get(event.type)
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener(event)
        } catch (error) {
          console.error(`[MCPClient] Event listener error:`, error)
        }
      }
    }
  }

  //===========================================================================
  // Utility Methods
  //===========================================================================

  /**
   * Update connection state for a server
   */
  private updateConnectionState(serverId: string, state: MCPConnectionState, error?: string): void {
    const status: MCPConnectionStatus = {
      serverId,
      state,
      ...(error && { error }),
      ...(state === 'connected' && { lastConnected: Date.now() }),
    }

    // Preserve existing tools
    const existing = this.connections.get(serverId)
    if (existing?.tools) {
      status.tools = existing.tools
    }

    this.connections.set(serverId, status)

    this.emit({
      type: 'connection:stateChange',
      serverId,
      data: status,
      timestamp: Date.now(),
    })
  }

  /**
   * Connect to all enabled servers
   */
  async connectAll(): Promise<Map<string, MCPInitializeResult>> {
    const results = new Map<string, MCPInitializeResult>()
    const servers = this.getEnabledServers()

    console.log(`[MCPClient] Connecting to ${servers.length} enabled servers...`)

    for (const server of servers) {
      try {
        const result = await this.connect(server.id)
        results.set(server.id, result)
      } catch (error) {
        console.error(`[MCPClient] Failed to connect to ${server.id}:`, error)
      }
    }

    return results
  }

  /**
   * Disconnect from all servers
   */
  disconnectAll(): void {
    for (const serverId of this.servers.keys()) {
      this.disconnect(serverId)
    }
  }

  /**
   * Clear all servers and connections
   */
  clear(): void {
    this.disconnectAll()
    this.servers.clear()
    this.connections.clear()
  }
}

//=============================================================================
// Singleton Instance
//=============================================================================

let clientInstance: MCPClientService | null = null

export function getMCPClient(): MCPClientService {
  if (!clientInstance) {
    clientInstance = new MCPClientService()
  }
  return clientInstance
}

/**
 * Reset the singleton instance (mainly for testing)
 */
export function resetMCPClient(): void {
  clientInstance?.clear()
  clientInstance = null
}
