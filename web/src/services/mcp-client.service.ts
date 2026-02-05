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

  /**
   * Execute a tool call on a specific server
   */
  async executeTool(serverId: string, toolCall: MCPToolCallRequest): Promise<MCPToolCallResult> {
    const server = this.servers.get(serverId)
    if (!server) {
      throw new MCPConnectionError(serverId, `Server not found: ${serverId}`)
    }

    const status = this.connections.get(serverId)
    if (status?.state !== 'connected') {
      throw new MCPConnectionError(serverId, `Server not connected: ${serverId}`)
    }

    try {
      const result = await this.sendRequest<MCPToolCallResult>(server, 'tools/call', toolCall)

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
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

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
