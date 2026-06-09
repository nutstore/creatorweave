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

// Tool Bridge (on-demand: 2 persistent tools only)
export {
  mcpToolToToolDefinition,
  createMCPToolExecutor,
  registerServerTools,
  unregisterServerTools,
  registerAllMCPTools,
  unregisterAllMCPTools,
  syncMCPTools,
} from './mcp-tool-bridge'

// On-Demand Bridge (the 2 persistent tools + prompt doc)
export {
  ON_DEMAND_MCP_TOOLS,
  mcpOnDemandPromptDoc,
  mcpGetToolSchemaDefinition,
  mcpGetToolSchemaExecutor,
  mcpToolCallDefinition,
  mcpToolCallExecutor,
} from './mcp-ondemand-bridge'

// Injection (lightweight catalog for system prompt)
export {
  buildAvailableMCPServicesBlock,
  getMCPServicesSummary,
  hasConnectedMCPServices,
  getAllMCPToolNames,
} from './mcp-injection'
export type { MCPInjectionContext } from './mcp-injection'
