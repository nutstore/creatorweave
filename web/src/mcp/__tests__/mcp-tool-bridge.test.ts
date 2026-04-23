/**
 * MCP Tool Bridge 单元测试
 *
 * 测试 MCP 工具注册到 ToolRegistry 的完整流程
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { ToolDefinition } from '../../agent/tools/tool-types'

// ============================================================================
// Mock MCP Manager
// ============================================================================

const mockMCPTools = [
  {
    name: 'analyze_spreadsheet',
    description: 'Analyze spreadsheet file with direct data access',
    inputSchema: {
      type: 'object' as const,
      properties: {
        file_path: {
          type: 'string' as const,
          description: 'Path to the spreadsheet file',
        },
        sheet_name: {
          type: 'string' as const,
          description: 'Name of the sheet to analyze (optional)',
        },
      },
      required: ['file_path'] as string[],
    },
  },
  {
    name: 'poll_analysis_task',
    description: 'Poll for analysis task progress',
    inputSchema: {
      type: 'object' as const,
      properties: {
        task_id: {
          type: 'string' as const,
          description: 'Task ID to poll',
        },
      },
      required: ['task_id'] as string[],
    },
  },
]

const mockServerConfig = {
  id: 'excel-analyzer',
  name: 'Excel文档分析智能体',
  description: '可以对excel文件做分析',
  url: 'http://localhost:8080/mcp',
  transport: 'sse' as const,
  enabled: true,
}

// ============================================================================
// Mock MCP Client Service
// ============================================================================

const mockMCPClient = {
  addServer: vi.fn(),
  removeServer: vi.fn(),
  connect: vi.fn().mockResolvedValue({
    serverInfo: { name: 'Excel Analyzer', version: '1.0.0' },
    capabilities: { tools: {} },
  }),
  disconnect: vi.fn(),
  discoverTools: vi.fn().mockResolvedValue(mockMCPTools),
  executeTool: vi.fn().mockResolvedValue({
    content: [{ type: 'text', text: 'Analysis complete' }],
  }),
  getConnectionStatus: vi.fn().mockReturnValue({
    state: 'connected',
    tools: mockMCPTools,
  }),
  on: vi.fn(),
  off: vi.fn(),
}

// ============================================================================
// Mock MCP Repository
// ============================================================================

const mockMCPRepository = {
  findAll: vi.fn().mockResolvedValue([mockServerConfig]),
  findById: vi.fn().mockResolvedValue(mockServerConfig),
  save: vi.fn().mockResolvedValue(undefined),
  update: vi.fn().mockResolvedValue(undefined),
  delete: vi.fn().mockResolvedValue(undefined),
  setEnabled: vi.fn().mockResolvedValue(undefined),
  validateServerId: vi.fn().mockReturnValue({
    valid: true,
  }),
}

// ============================================================================
// Mock MCP Manager
// ============================================================================

const mockMCPManager = {
  initialize: vi.fn().mockResolvedValue(undefined),
  addServer: vi.fn().mockResolvedValue(undefined),
  updateServer: vi.fn().mockResolvedValue(undefined),
  removeServer: vi.fn().mockResolvedValue(undefined),
  getServer: vi.fn().mockReturnValue(mockServerConfig),
  getAllServers: vi.fn().mockReturnValue([mockServerConfig]),
  getEnabledServers: vi.fn().mockReturnValue([mockServerConfig]),
  connect: vi.fn().mockResolvedValue({
    serverInfo: { name: 'Excel Analyzer', version: '1.0.0' },
    capabilities: { tools: {} },
  }),
  disconnect: vi.fn(),
  getConnectionStatus: vi.fn().mockReturnValue({
    serverId: 'excel-analyzer',
    state: 'connected',
    tools: mockMCPTools,
    config: mockServerConfig,
  }),
  getAllTools: vi.fn().mockReturnValue(new Map([['excel-analyzer', mockMCPTools]])),
  getAllConnectionStatuses: vi.fn().mockReturnValue([
    {
      serverId: 'excel-analyzer',
      state: 'connected',
      tools: mockMCPTools,
      config: mockServerConfig,
    },
  ]),
  executeTool: vi.fn().mockResolvedValue({
    content: [{ type: 'text', text: 'Mock result' }],
  }),
  validateServerId: vi.fn().mockReturnValue({ valid: true }),
  getAvailableMCPServicesBlock: vi.fn().mockReturnValue('<mcp_system>...</mcp_system>'),
  on: vi.fn(),
  off: vi.fn(),
  dispose: vi.fn(),
}

// ============================================================================
// Setup Mocks
// ============================================================================

vi.mock('@/mcp/mcp-manager', () => ({
  getMCPManager: vi.fn(() => mockMCPManager),
  resetMCPManager: vi.fn(),
}))

vi.mock('@/services/mcp-client.service', () => ({
  getMCPClient: vi.fn(() => mockMCPClient),
}))

vi.mock('../sqlite/repositories/mcp.repository', () => ({
  getMCPRepository: vi.fn(() => mockMCPRepository),
}))

// ============================================================================
// Import after mocks
// ============================================================================

import { mcpToolToToolDefinition, createMCPToolExecutor } from '../mcp-tool-bridge'
import { registerAllMCPTools, unregisterAllMCPTools } from '../mcp-tool-bridge'
import type { MCPToolDefinition } from '../mcp-types'

// ============================================================================
// Test Registry
// ============================================================================

class TestToolRegistry {
  private tools = new Map<string, ToolDefinition>()

  register(definition: ToolDefinition, _executor: unknown): void {
    const name = definition.function.name
    this.tools.set(name, definition)
  }

  unregister(name: string): boolean {
    return this.tools.delete(name)
  }

  getToolDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values())
  }

  has(name: string): boolean {
    return this.tools.has(name)
  }

  get size(): number {
    return this.tools.size
  }

  clear(): void {
    this.tools.clear()
  }
}

// ============================================================================
// Test Suites
// ============================================================================

describe('mcp-tool-bridge', () => {
  let testRegistry: TestToolRegistry

  beforeEach(() => {
    testRegistry = new TestToolRegistry()
    vi.clearAllMocks()
  })

  afterEach(() => {
    testRegistry.clear()
  })

  // ========================================================================
  // mcpToolToToolDefinition Tests
  // ========================================================================

  describe('mcpToolToToolDefinition', () => {
    it('should convert MCP tool definition to ToolDefinition format', () => {
      const mcpTool: MCPToolDefinition = {
        name: 'test_tool',
        description: 'A test tool',
        inputSchema: {
          type: 'object',
          properties: {
            arg1: { type: 'string' },
            arg2: { type: 'number' },
          },
          required: ['arg1'],
        },
      }

      const result = mcpToolToToolDefinition('test-server', mcpTool)

      expect(result.type).toBe('function')
      expect(result.function.name).toBe('test-server:test_tool')
      expect(result.function.description).toBe('A test tool')
      expect(result.function.parameters.type).toBe('object')
      expect(result.function.parameters.properties).toHaveProperty('arg1')
      expect(result.function.parameters.properties).toHaveProperty('arg2')
      expect(result.function.parameters.required).toEqual(['arg1'])
    })

    it('should include server name in description when provided', () => {
      const mcpTool: MCPToolDefinition = {
        name: 'test_tool',
        description: 'Test tool',
        inputSchema: { type: 'object', properties: {} },
      }

      const serverConfig = {
        id: 'test-server',
        name: 'Test Server',
        description: 'A test server',
        url: 'http://localhost:8080/mcp',
        transport: 'sse' as const,
        enabled: true,
      }

      const result = mcpToolToToolDefinition('test-server', mcpTool, serverConfig)

      expect(result.function.description).toBe('[Test Server] Test tool')
    })

    it('should use server ID in tool name', () => {
      const mcpTool: MCPToolDefinition = {
        name: 'analyze',
        description: 'Analyze data',
        inputSchema: { type: 'object', properties: {} },
      }

      const result = mcpToolToToolDefinition('data-server', mcpTool)

      expect(result.function.name).toBe('data-server:analyze')
    })
  })

  // ========================================================================
  // createMCPToolExecutor Tests
  // ========================================================================

  describe('createMCPToolExecutor', () => {
    it('should create an executor that calls MCPManager.executeTool', async () => {
      const executor = createMCPToolExecutor('test-server', 'test_tool')
      const mockContext = {} as any

      await executor({ arg1: 'value1' }, mockContext)

      expect(mockMCPManager.executeTool).toHaveBeenCalledWith(
        'test-server',
        'test_tool',
        {
          arg1: 'value1',
        },
        expect.any(Function)
      )
    })

    it('should extract text content from MCP result', async () => {
      mockMCPManager.executeTool.mockResolvedValueOnce({
        content: [
          { type: 'text', text: 'Line 1' },
          { type: 'text', text: 'Line 2' },
        ],
      })

      const executor = createMCPToolExecutor('test-server', 'test_tool')
      const result = await executor({}, {} as any)

      const parsed = JSON.parse(result)
      expect(parsed.ok).toBe(true)
      expect(parsed.tool).toBe('test-server:test_tool')
      expect(parsed.version).toBe(2)
      expect(parsed.data.text).toBe('Line 1\n\nLine 2')
    })

    it('should return single text part without extra newlines', async () => {
      mockMCPManager.executeTool.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Single result' }],
      })

      const executor = createMCPToolExecutor('test-server', 'test_tool')
      const result = await executor({}, {} as any)

      const parsed = JSON.parse(result)
      expect(parsed.ok).toBe(true)
      expect(parsed.data.text).toBe('Single result')
    })

    it('should handle error results from MCP', async () => {
      mockMCPManager.executeTool.mockResolvedValueOnce({
        isError: true,
        content: [{ type: 'text', text: 'Error occurred' }],
      })

      const executor = createMCPToolExecutor('test-server', 'test_tool')
      const result = await executor({}, {} as any)

      const parsed = JSON.parse(result)
      expect(parsed.ok).toBe(false)
      expect(parsed.tool).toBe('test-server:test_tool')
      expect(parsed.version).toBe(2)
      expect(parsed.error.code).toBe('mcp_tool_error')
      expect(parsed.error.message).toBe('Error occurred')
      expect(parsed.error.retryable).toBe(true)
      expect(parsed.error.details.serverId).toBe('test-server')
      expect(parsed.error.details.toolName).toBe('test_tool')
    })

    it('should handle execution errors gracefully', async () => {
      mockMCPManager.executeTool.mockRejectedValueOnce(new Error('Connection failed'))

      const executor = createMCPToolExecutor('test-server', 'test_tool')
      const result = await executor({}, {} as any)

      const parsed = JSON.parse(result)
      expect(parsed.ok).toBe(false)
      expect(parsed.tool).toBe('test-server:test_tool')
      expect(parsed.error.code).toBe('mcp_execution_failed')
      expect(parsed.error.message).toContain('Connection failed')
      expect(parsed.error.retryable).toBe(true)
      expect(parsed.error.details.serverId).toBe('test-server')
      expect(parsed.error.details.toolName).toBe('test_tool')
    })

    it('should JSON stringify non-object results', async () => {
      mockMCPManager.executeTool.mockResolvedValueOnce('plain string result')

      const executor = createMCPToolExecutor('test-server', 'test_tool')
      const result = await executor({}, {} as any)

      const parsed = JSON.parse(result)
      expect(parsed.ok).toBe(true)
      expect(parsed.data.text).toBe('plain string result')
    })
  })

  // ========================================================================
  // registerAllMCPTools Tests (Unit Tests with Mocks)
  // ========================================================================

  describe('registerAllMCPTools (unit)', () => {
    it('should initialize MCP manager before registering tools', async () => {
      await registerAllMCPTools(testRegistry as any)

      expect(mockMCPManager.initialize).toHaveBeenCalled()
    })

    it('should get enabled servers and connect to them', async () => {
      await registerAllMCPTools(testRegistry as any)

      expect(mockMCPManager.getEnabledServers).toHaveBeenCalled()
      expect(mockMCPManager.connect).toHaveBeenCalledWith('excel-analyzer')
    })

    it('should register tools from connected servers', async () => {
      const count = await registerAllMCPTools(testRegistry as any)

      expect(count).toBeGreaterThan(0)
      expect(testRegistry.size).toBe(mockMCPTools.length)
    })

    it('should register tools with correct naming convention', async () => {
      await registerAllMCPTools(testRegistry as any)

      const tools = testRegistry.getToolDefinitions()
      const toolNames = tools.map((t) => t.function.name)

      expect(toolNames).toContain('excel-analyzer:analyze_spreadsheet')
      expect(toolNames).toContain('excel-analyzer:poll_analysis_task')
    })

    it('should include tool schema in registered definitions', async () => {
      await registerAllMCPTools(testRegistry as any)

      const tools = testRegistry.getToolDefinitions()
      const analyzeTool = tools.find(
        (t) => t.function.name === 'excel-analyzer:analyze_spreadsheet'
      )

      expect(analyzeTool).toBeDefined()
      expect(analyzeTool?.function.parameters).toHaveProperty('properties')
      expect(analyzeTool?.function.parameters.properties).toHaveProperty('file_path')
      expect(analyzeTool?.function.parameters.required).toContain('file_path')
    })

    it('should handle connection errors gracefully', async () => {
      mockMCPManager.connect.mockRejectedValueOnce(new Error('Connection failed'))

      const count = await registerAllMCPTools(testRegistry as any)

      // Should not throw, but return 0 since no tools were registered
      expect(count).toBe(0)
      expect(testRegistry.size).toBe(0)
    })

    it('should skip servers with no discovered tools', async () => {
      mockMCPManager.getConnectionStatus.mockReturnValueOnce({
        serverId: 'excel-analyzer',
        state: 'connected',
        tools: [], // No tools discovered
        config: mockServerConfig,
      })

      const count = await registerAllMCPTools(testRegistry as any)

      expect(count).toBe(0)
      expect(testRegistry.size).toBe(0)
    })

    it('should continue processing other servers if one fails', async () => {
      // Add a second server that will fail
      const servers = [
        mockServerConfig,
        { ...mockServerConfig, id: 'failing-server', name: 'Failing Server' },
      ]
      mockMCPManager.getEnabledServers.mockReturnValueOnce(servers as any)
      mockMCPManager.connect
        .mockResolvedValueOnce({
          serverInfo: { name: 'Excel Analyzer' },
          capabilities: { tools: {} },
        })
        .mockRejectedValueOnce(new Error('Connection failed'))

      mockMCPManager.getConnectionStatus.mockImplementation((serverId: string) => {
        if (serverId === 'excel-analyzer') {
          return {
            serverId: 'excel-analyzer',
            state: 'connected',
            tools: mockMCPTools,
            config: mockServerConfig,
          }
        }
        return { serverId: 'failing-server', state: 'error', error: 'Connection failed' }
      })

      const count = await registerAllMCPTools(testRegistry as any)

      // Should still register tools from the working server
      expect(count).toBe(mockMCPTools.length)
      expect(testRegistry.size).toBe(mockMCPTools.length)
    })
  })

  // ========================================================================
  // unregisterAllMCPTools Tests
  // ========================================================================

  describe('unregisterAllMCPTools', () => {
    it('should unregister all MCP tools', async () => {
      // First register some tools
      await registerAllMCPTools(testRegistry as any)
      expect(testRegistry.size).toBeGreaterThan(0)

      // Then unregister
      const count = await unregisterAllMCPTools(testRegistry as any)

      expect(count).toBe(mockMCPTools.length)
      expect(testRegistry.size).toBe(0)
    })

    it('should return 0 when no MCP tools are registered', async () => {
      // Clear any existing tools first
      testRegistry.clear()
      mockMCPManager.getAllTools.mockReturnValueOnce(new Map())

      const count = await unregisterAllMCPTools(testRegistry as any)
      expect(count).toBe(0)
    })
  })

  // ========================================================================
  // Integration Tests (with real MCP server at localhost:8080)
  // ========================================================================

  describe('MCP integration (real server)', () => {
    it('should connect to real MCP server and register tools', async () => {
      // This test requires a real MCP server running at http://localhost:8080/mcp
      // Skip if server is not available
      const serverAvailable = await fetch('http://localhost:8080/mcp', {
        method: 'GET',
        signal: AbortSignal.timeout(1000),
      })
        .then(() => true)
        .catch(() => false)

      if (!serverAvailable) {
        console.warn('Skipping integration test - MCP server not available')
        return
      }

      // Import real implementations
      const { getMCPManager } = await import('@/mcp/mcp-manager')
      const { resetMCPManager } = await import('@/mcp/mcp-manager')

      try {
        // Reset any existing state
        resetMCPManager()

        // Add the test server
        const manager = getMCPManager()
        await manager.addServer({
          id: 'excel-analyzer-test',
          name: 'Excel Analyzer (Test)',
          description: 'Test MCP server',
          url: 'http://localhost:8080/mcp',
          transport: 'sse',
          enabled: true,
        })

        // Register tools
        const count = await registerAllMCPTools(testRegistry as any)

        // Verify tools were registered
        expect(count).toBeGreaterThan(0)
        expect(testRegistry.size).toBeGreaterThan(0)

        // Verify tool format
        const tools = testRegistry.getToolDefinitions()
        const excelTool = tools.find((t) => t.function.name.includes('analyze_spreadsheet'))

        expect(excelTool).toBeDefined()
        expect(excelTool?.type).toBe('function')
        expect(excelTool?.function.name).toContain('analyze_spreadsheet')
        expect(excelTool?.function.parameters).toHaveProperty('properties')

        console.log('✅ Integration test passed - registered', count, 'tools')
      } finally {
        // Cleanup
        resetMCPManager()
      }
    }, 10000)
  })
})
