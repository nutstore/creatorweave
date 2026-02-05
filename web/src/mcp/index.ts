/**
 * MCP Module Index
 *
 * Exports MCP client functionality for browser-fs-analyzer.
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

// Tool Bridge
export {
  mcpToolToToolDefinition,
  createMCPToolExecutor,
  registerServerTools,
  unregisterServerTools,
  registerAllMCPTools,
  unregisterAllMCPTools,
  syncMCPTools,
} from './mcp-tool-bridge'

// Injection
export {
  buildAvailableMCPServicesBlock,
  getMCPServicesSummary,
  hasConnectedMCPServices,
  getAllMCPToolNames,
} from './mcp-injection'
export type { MCPInjectionContext, FormattedMCPService } from './mcp-injection'
