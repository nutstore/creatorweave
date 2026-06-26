/**
 * MCP Module Index
 *
 * Exports MCP client functionality for the app.
 */

// Type definitions
export type {
  JSONRPCRequest,
  JSONRPCResponse,
  MCPServerConfig,
  MCPServerType,
  MCPTransportType,
  MCPConnectionState,
  MCPConnectionStatus,
  MCPToolDefinition,
  MCPToolInputSchema,
  MCPToolCallRequest,
  MCPToolCallResult,
  MCPResourceDefinition,
  MCPResourceContent,
  MCPInitializeParams,
  MCPInitializeResult,
  MCPClientCapabilities,
  MCPServerCapabilities,
  MCPToolsListResult,
  MCPResourcesListResult,
  MCPClientEvent,
  MCPClientEventType,
  MCPEventListener,
} from './mcp-types'

export { MCPError, MCPConnectionError, MCPToolExecutionError } from './mcp-types'

// Service
export { getMCPClient, resetMCPClient, MCPClientService } from '@/services/mcp-client.service'

// Manager
export { getMCPManager, resetMCPManager, MCPManager } from './mcp-manager'
export type { MCPManagerConfig, MCPManagerConnectionStatus } from './mcp-manager'

// Repository
export { getMCPRepository, MCPRepository } from '../sqlite/repositories/mcp.repository'
export type { StoredMCPServer } from '../sqlite/repositories/mcp.repository'

// NOTE: MCP tool discovery & execution is handled by the unified external-tool
// bridge (search_tools + call_tool) in src/agent/external-tool-bridge.ts.
// The old on-demand bridge (mcp_get_tool_schema + mcp_call) and the
// <available_mcp_services> system-prompt injection have been removed.
