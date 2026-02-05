/**
 * file_upload tool unit tests
 *
 * Tests the file upload tool that uploads files to MCP servers.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { ToolContext } from '../tool-types'

// ============================================================================
// Mock OPFS Store - Must be defined before imports that use it
// ============================================================================

const mockFileContent = new Uint8Array([1, 2, 3, 4, 5])
const mockFileMetadata = {
  size: 5,
  contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  lastModified: Date.now(),
}

const mockReadFile = vi.fn().mockResolvedValue({
  content: mockFileContent,
  metadata: mockFileMetadata,
})

vi.mock('@/store/opfs.store', () => ({
  useOPFSStore: Object.assign(
    vi.fn(() => ({
      readFile: mockReadFile,
    })),
    {
      getState: () => ({
        readFile: mockReadFile,
      }),
    }
  ),
}))

// ============================================================================
// Mock MCP Manager
// ============================================================================

const mockServerConfig = {
  id: 'excel-analyzer',
  name: 'Excel Analyzer',
  description: 'Excel analysis MCP server',
  url: 'http://localhost:8080/mcp',
  transport: 'sse' as const,
  enabled: true,
}

const mockMCPManager = {
  initialize: vi.fn().mockResolvedValue(undefined),
  getEnabledServers: vi.fn().mockReturnValue([mockServerConfig]),
  getServer: vi.fn().mockReturnValue(mockServerConfig),
  connect: vi.fn().mockResolvedValue(undefined),
  getConnectionStatus: vi.fn().mockReturnValue({
    serverId: 'excel-analyzer',
    state: 'connected',
    tools: [],
    config: mockServerConfig,
  }),
}

vi.mock('@/mcp', () => ({
  getMCPManager: vi.fn(() => mockMCPManager),
}))

// Import after mocks are set up
import { fileUploadDefinition, fileUploadExecutor } from '../file-upload.tool'

// ============================================================================
// Test Context
// ============================================================================

const createMockContext = (): ToolContext => ({
  directoryHandle: {
    name: 'test-project',
  } as FileSystemDirectoryHandle,
})

// ============================================================================
// Test Suites
// ============================================================================

describe('file-upload.tool', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Mock successful fetch response
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        file_id: 'test_123456.xlsx',
        filename: 'test.xlsx',
        download_url: 'http://localhost:8080/download/test_123456.xlsx',
        size: 5,
      }),
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ========================================================================
  // Tool Definition Tests
  // ========================================================================

  describe('fileUploadDefinition', () => {
    it('should have correct tool name', () => {
      expect(fileUploadDefinition.function.name).toBe('file_upload')
    })

    it('should have required parameters', () => {
      const params = fileUploadDefinition.function.parameters
      expect(params.properties).toHaveProperty('path')
      expect(params.properties).toHaveProperty('server_id')
      expect(params.required).toContain('path')
      expect(params.required).not.toContain('server_id')
    })

    it('should have descriptive description', () => {
      expect(fileUploadDefinition.function.description).toContain('upload')
      expect(fileUploadDefinition.function.description).toContain('MCP')
    })
  })

  // ========================================================================
  // Executor Tests
  // ========================================================================

  describe('fileUploadExecutor', () => {
    it('should upload file successfully', async () => {
      const context = createMockContext()
      const args = { path: 'data/test.xlsx' }

      const result = await fileUploadExecutor(args, context)
      const parsed = JSON.parse(result)

      expect(parsed.success).toBe(true)
      expect(parsed.file_id).toBe('test_123456.xlsx')
      expect(parsed.download_url).toContain('localhost:8080')
      expect(mockReadFile).toHaveBeenCalledWith('data/test.xlsx', context.directoryHandle)
    })

    it('should use specified server_id when provided', async () => {
      const context = createMockContext()
      const args = { path: 'data/test.xlsx', server_id: 'custom-server' }

      mockMCPManager.getServer.mockReturnValueOnce({
        ...mockServerConfig,
        id: 'custom-server',
      })

      await fileUploadExecutor(args, context)

      expect(mockMCPManager.getServer).toHaveBeenCalledWith('custom-server')
    })

    it('should return error when no directory selected', async () => {
      const context: ToolContext = {
        directoryHandle: null,
      }
      const args = { path: 'test.xlsx' }

      const result = await fileUploadExecutor(args, context)
      const parsed = JSON.parse(result)

      expect(parsed.error).toContain('No directory selected')
    })

    it('should return error when no MCP servers configured', async () => {
      const context = createMockContext()
      mockMCPManager.getEnabledServers.mockReturnValueOnce([])

      const args = { path: 'test.xlsx' }
      const result = await fileUploadExecutor(args, context)
      const parsed = JSON.parse(result)

      expect(parsed.error).toContain('No MCP servers')
    })

    it('should handle fetch errors gracefully', async () => {
      const context = createMockContext()
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => 'Server error',
      })

      const args = { path: 'test.xlsx' }
      const result = await fileUploadExecutor(args, context)
      const parsed = JSON.parse(result)

      expect(parsed.error).toContain('Upload failed')
      expect(parsed.error).toContain('500')
    })

    it('should construct correct upload URL', async () => {
      const context = createMockContext()
      const args = { path: 'test.xlsx' }

      await fileUploadExecutor(args, context)

      const fetchCall = (global.fetch as any).mock.calls[0]
      expect(fetchCall[0]).toBe('http://localhost:8080/upload')
      expect(fetchCall[1].method).toBe('POST')
    })

    it('should send file as FormData', async () => {
      const context = createMockContext()
      const args = { path: 'data/test.xlsx' }

      await fileUploadExecutor(args, context)

      const fetchCall = (global.fetch as any).mock.calls[0]
      const formData = fetchCall[1].body

      expect(formData).toBeInstanceOf(FormData)
      expect(formData.get('file')).toBeInstanceOf(Blob)
    })
  })
})
