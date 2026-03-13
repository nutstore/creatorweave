# MCP Integration Architecture Design

## Overview

将 MCP (Model Context Protocol) 服务发现和工具调用能力集成到 creatorweave (bfosa) 中，使 Agent 能够动态调用外部 MCP 服务器提供的工具。

## Design Goals

1. **非侵入式集成**: 与现有 Skills 系统并行，不破坏现有架构
2. **服务发现**: 类似 `available_skills` 的 MCP 服务发现机制
3. **工具桥接**: 将 MCP 工具自动注册到 ToolRegistry
4. **生命周期管理**: 连接、重连、错误处理
5. **可扩展性**: 支持多个 MCP 服务器同时连接

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Agent Loop                                         │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  System Prompt Enhancement                                       │  │
│  │  ├─ available_skills (existing)                                  │  │
│  │  └─ available_mcp_services (NEW)                                │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                     │                                    │
│  ┌─────────────────────────────────────────────────────────────────┐ │  │
│  │                      ToolRegistry                                │  │  │
│  │  ├─ Built-in tools (file_read, glob, ...)                         │  │  │
│  │  ├─ WASM Plugin tools                                               │  │  │
│  │  └─ MCP Service tools (NEW)                                       │◄─┐
│  └─────────────────────────────────────────────────────────────────┘  │  │
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                      MCPManager (NEW)                             │    │
│  │  - Server configuration (add/remove/enable/disable)                │    │
│  │  - Connection lifecycle (connect/disconnect/reconnect)             │────┘
│  │  - Tool discovery and caching                                       │
│  │  - Tool execution with error handling                             │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                      MCPClientService                              │    │
│  │  - JSON-RPC 2.0 over HTTP (SSE streaming)                        │◄──┘
│  │  - Session management                                               │
│  │  - SSE stream parsing                                              │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────┘
```

## Module: MCPManager

**Location**: `src/mcp/mcp-manager.ts`

### Responsibilities

- 管理 MCP 服务器配置 (CRUD)
- 连接生命周期管理
- 工具发现和缓存
- 将 MCP 工具桥接到 ToolRegistry

### Key Methods

```typescript
class MCPManager {
  // 服务器配置管理
  addServer(config: MCPServerConfig): void
  removeServer(serverId: string): void
  updateServer(serverId: string, config: Partial<MCPServerConfig>): void
  getServer(serverId: string): MCPServerConfig | undefined
  getAllServers(): MCPServerConfig[]
  getEnabledServers(): MCPServerConfig[]

  // 连接管理
  connect(serverId: string): Promise<MCPInitializeResult>
  disconnect(serverId: string): void
  disconnectAll(): void
  getConnectionStatus(serverId: string): MCPConnectionStatus

  // 工具发现
  discoverTools(serverId: string): Promise<MCPToolDefinition[]>
  getAllTools(): Promise<MCPToolDefinition[]>  // 聚合所有服务器的工具

  // 工具执行
  executeTool(serverId: string, toolName: string, args: unknown): Promise<unknown>

  // ToolRegistry 集成
  registerMCPTools(serverId: string): void          // 注册工具到 ToolRegistry
  unregisterMCPTools(serverId: string): void       // 取消注册
  syncToolsToRegistry(): Promise<void>             // 同步所有工具

  // 系统提示增强
  getAvailableMCPServicesBlock(): string           // 生成 available_mcp_services XML
}

class MCPManagerEvents {
  // 事件监听
  onServerConnected(callback: (serverId: string) => void): void
  onServerDisconnected(callback: (serverId: string) => void): void
  onToolsUpdated(callback: (serverId: string, tools: MCPToolDefinition[]) => void): void
  onToolExecuted(callback: (serverId: string, toolName: string, result: unknown) => void): void
}
```

## Module: MCPClientService

**Location**: `src/services/mcp-client.service.ts`

**Status**: ✅ 已实现

### Features

- JSON-RPC 2.0 over HTTP
- SSE (Server-Sent Events) 流式响应
- 会话管理 (可选的 `Mcp-Session-Id` 头)
- 错误处理和重试
- 30秒超时

## Module: MCP Types

**Location**: `src/mcp/mcp-types.ts`

**Status**: ✅ 已实现

### Key Types

```typescript
// 服务器配置
interface MCPServerConfig {
  id: string
  name: string
  url: string
  enabled: boolean
  token?: string
  type?: 'builtin' | 'user' | 'project'
  sessionId?: string
}

// 工具定义
interface MCPToolDefinition {
  name: string
  description?: string
  inputSchema: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
  }
  _serverId?: string
}

// 连接状态
type MCPConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error'

interface MCPConnectionStatus {
  serverId: string
  state: MCPConnectionState
  error?: string
  lastConnected?: number
  tools?: MCPToolDefinition[]
}
```

## System Prompt Enhancement

### Existing: `available_skills`

```xml
<skills_system priority="1">
<available_skills>
  <skill>...</skill>
</available_skills>
</skills_system>
```

### New: `available_mcp_services`

```xml
<mcp_system priority="1">
<available_mcp_services>
  <service id="contextgen-doc" name="Excel Analyzer" url="http://localhost:8080/mcp">
    <status>connected</status>
    <tools>analyze_spreadsheet, poll_analysis_task</tools>
  </service>
</available_mcp_services>

<usage>
When available, you can use tools from MCP services:

**contextgen-doc** (http://localhost:8080/mcp)
- analyze_spreadsheet: Analyze spreadsheet files with direct data access
- poll_analysis_task: Poll for analysis progress
</usage>
</mcp_system>
```

## Tool Bridge: MCP → ToolRegistry

### Tool Naming Convention

MCP 工具通过唯一名称注册到 ToolRegistry：
```
{serverId}:{toolName}
```

例如: `contextgen-doc:analyze_spreadsheet`

### ToolExecutor Implementation

```typescript
// src/mcp/mcp-tool-bridge.ts
export function createMCPToolExecutor(serverId: string, toolName: string): ToolExecutor {
  return async (args: Record<string, unknown>, context: ToolContext): Promise<string> => {
    const mcpManager = getMCPManager()
    const result = await mcpManager.executeTool(serverId, toolName, args)
    return JSON.stringify(result)
  }
}

// 注册到 ToolRegistry
function registerMCPTool(serverId: string, tool: MCPToolDefinition): void {
  const registry = getToolRegistry()
  const toolName = `${serverId}:${tool.name}`

  const definition: ToolDefinition = {
    function: {
      name: toolName,
      description: tool.description || `MCP tool from ${serverId}`,
      parameters: tool.inputSchema as any,
    }
  }

  const executor = createMCPToolExecutor(serverId, tool.name)
  registry.register(definition, executor)
}
```

## Storage: MCP Server Configuration

### Schema

```sql
CREATE TABLE mcp_servers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  enabled INTEGER DEFAULT 1,
  token TEXT,
  type TEXT DEFAULT 'user',
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);
```

### Store Module

**Location**: `src/store/mcp.store.ts`

```typescript
class MCPStore {
  async getServers(): Promise<MCPServerConfig[]>
  async addServer(config: MCPServerConfig): Promise<void>
  async updateServer(id: string, config: Partial<MCPServerConfig>): Promise<void>
  async deleteServer(id: string): Promise<void>
  async setEnabled(id: string, enabled: boolean): Promise<void>
}
```

## UI Components

### 1. MCP Settings Panel

**Location**: `src/components/mcp/MCPSettings.tsx`

**Features**:
- 服务器列表展示
- 添加/编辑/删除服务器
- 启用/禁用切换
- 连接状态显示
- 工具列表预览

### 2. Connection Status Indicator

**Location**: `src/components/mcp/ConnectionStatus.tsx`

**States**:
- 🟢 Connected
- 🟡 Connecting
- 🔴 Disconnected
- ⚠️ Error

### 3. MCP Tool Badge

在工具列表中显示 MCP 工具的来源标识。

## Implementation Phases

### Phase 1: Core Manager (Foundation)
- [x] MCPClientService (SSE streaming)
- [ ] MCPManager (lifecycle + tool bridge)
- [ ] MCP types (refine if needed)

### Phase 2: Storage & Persistence
- [ ] MCPStore (SQLite)
- [ ] Initial/default servers
- [ ] Migration

### Phase 3: Tool Registry Integration
- [ ] MCP tool bridge executor
- [ ] Tool registration/unregistration
- [ ] Tool execution with error handling

### Phase 4: System Prompt Enhancement
- [ ] `buildAvailableMCPServicesBlock()`
- [ ] Integration into AgentLoop
- [ ] Skill-like recommendation system

### Phase 5: UI Components
- [ ] MCP Settings panel
- [ ] Connection status indicators
- [ ] Tool badges

## Error Handling

### Connection Errors

```typescript
- Network error: Check CORS, server availability
- Timeout: 30s default, configurable per server
- Authentication: Invalid token handling
- Not Acceptable: Server requires both JSON and SSE in Accept header
```

### Tool Execution Errors

```typescript
- Tool not found: Return clear error to user
- Invalid arguments: Server returns JSON-RPC error
- Server error: Retry logic with exponential backoff
- Timeout: Separate timeout for tool execution
```

## Security Considerations

1. **CORS**: Server must configure proper CORS headers
2. **Token Storage**: Store auth tokens securely (SQLite, encrypted)
3. **URL Validation**: Validate server URLs to prevent SSRF
4. **Rate Limiting**: Client-side throttling for tool calls
5. **Input Sanitization**: MCP server responsible for validation

## Configuration Examples

### Default Servers

```typescript
const DEFAULT_SERVERS: MCPServerConfig[] = [
  {
    id: 'contextgen-doc',
    name: 'Excel Analyzer',
    url: 'http://localhost:8080/mcp',
    enabled: false,  // opt-in for performance
    type: 'builtin'
  }
]
```

### Project-Specific Servers

```typescript
// Workspace-specific MCP servers stored per project
const workspaceMcpServers: Record<string, MCPServerConfig[]> = {
  '/path/to/project': [
    {
      id: 'project-analyzer',
      name: 'Project Analyzer',
      url: 'http://localhost:9000/mcp',
      enabled: true
    }
  ]
}
```

## Testing Strategy

### Unit Tests

- MCPClientService: Mock fetch responses
- MCPManager: Mock MCPClientService
- Tool bridge: Mock ToolRegistry
- Store: Use in-memory SQLite

### Integration Tests

- Test with real MCP server (contextgen_doc)
- Connection lifecycle (connect, disconnect, reconnect)
- Tool execution flow
- Error recovery

### E2E Tests

- Configure server via UI
- Call MCP tool from Agent
- Verify result handling
