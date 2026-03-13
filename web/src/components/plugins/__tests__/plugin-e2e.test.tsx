// @ts-nocheck - Tests need migration to updated types
/**
 * Plugin Manager E2E Tests
 *
 * End-to-end tests for the plugin system UI components.
 * These tests cover the complete user workflow from plugin
 * upload to execution and results display.
 */

import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { PluginManager } from '../PluginManager'
import { PluginExecutor } from '../PluginExecutor'
import { PluginResults } from '../PluginResults'
import type {
  PluginInstance,
  FileEntry,
  PluginResult as PluginResultType,
} from '../../../types/plugin'

//=============================================================================
// Mock Data
//=============================================================================

// Valid WASM magic number for testing
const validWasmBytes = new Uint8Array([
  0x00,
  0x61,
  0x73,
  0x6d, // \0asm
  0x01,
  0x00,
  0x00,
  0x00, // version 1
])

// Mock plugin instance
const mockPlugin: PluginInstance = {
  metadata: {
    id: 'test-plugin',
    name: 'Test Plugin',
    version: '1.0.0',
    api_version: '2.0.0',
    description: 'A test plugin for E2E testing',
    author: 'CreatorWeave Team',
    capabilities: {
      metadata_only: false,
      requires_content: true,
      supports_streaming: false,
      max_file_size: 10 * 1024 * 1024,
      file_extensions: ['txt', 'md'],
    },
    resource_limits: {
      max_memory: 16 * 1024 * 1024,
      max_execution_time: 5000,
      worker_count: 1,
    },
  },
  state: 'Loaded',
  worker: null as unknown as Worker,
  loadedAt: Date.now(),
}

// Mock file entries
const mockFiles: FileEntry[] = [
  {
    path: '/test/file1.txt',
    name: 'file1.txt',
    size: 1024,
    lastModified: Date.now(),
    type: 'text/plain',
  },
  {
    path: '/test/file2.txt',
    name: 'file2.txt',
    size: 2048,
    lastModified: Date.now(),
    type: 'text/plain',
  },
]

// Mock aggregate result
const mockAggregateResult: PluginResultType = {
  pluginId: 'test-plugin',
  pluginName: 'Test Plugin',
  status: 'Success',
  summary: {
    totalPlugins: 1,
    totalFiles: 2,
    totalProcessed: 2,
    totalErrors: 0,
    duration: 150,
  },
  byPlugin: {
    'test-plugin': {
      totalFiles: 2,
      processed: 2,
      skipped: 0,
      errors: 0,
      results: {},
    },
  },
  byFile: {},
}

//=============================================================================
// Mock IndexedDB
//=============================================================================

const mockStore = {
  plugins: [] as PluginInstance[],
  get: vi.fn((key: string) => mockStore.plugins.find((p) => p.metadata?.id === key)),
  set: vi.fn((key: string, value: PluginInstance) => {
    const index = mockStore.plugins.findIndex((p) => p.metadata?.id === key)
    if (index >= 0) {
      mockStore.plugins[index] = value
    } else {
      mockStore.plugins.push(value)
    }
  }),
  delete: vi.fn((key: string) => {
    mockStore.plugins = mockStore.plugins.filter((p) => p.metadata?.id !== key)
  }),
  getAll: vi.fn(() => mockStore.plugins),
}

//=============================================================================
// Mock Worker
//===========================================================================

class MockWorker {
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null

  constructor(url: string | URL, options?: WorkerOptions) {
    // Simulate async loading
    setTimeout(() => {
      if (this.onmessage) {
        this.onmessage(
          new MessageEvent('message', {
            data: {
              type: 'LOADED',
              payload: {
                metadata: mockPlugin.metadata,
                wasmModule: 'test-plugin',
              },
            },
          })
        )
      }
    }, 100)
  }

  postMessage(message: any) {
    // Simulate responses
    setTimeout(() => {
      if (this.onmessage) {
        if (message.type === 'EXECUTE') {
          this.onmessage(
            new MessageEvent('message', {
              data: {
                type: 'RESULT',
                payload: {
                  output: {
                    path: message.payload?.fileInput?.path || '/test/file.txt',
                    status: 'Success',
                    data: { test: 'data' },
                  },
                  fileId: message.payload?.fileInput?.path || '/test/file.txt',
                },
              },
            })
          )
        } else if (message.type === 'FINALIZE') {
          this.onmessage(
            new MessageEvent('message', {
              data: {
                type: 'RESULT',
                payload: {
                  result: mockAggregateResult,
                  pluginId: 'test-plugin',
                },
              },
            })
          )
        }
      }
    }, 50)
  }

  terminate() {
    // Cleanup
  }

  addEventListener(type: string, listener: EventListener) {
    if (type === 'message') {
      this.onmessage = listener
    } else if (type === 'error') {
      this.onerror = listener
    }
  }

  removeEventListener(type: string, listener: EventListener) {
    if (type === 'message' && this.onmessage === listener) {
      this.onmessage = null
    } else if (type === 'error' && this.onerror === listener) {
      this.onerror = null
    }
  }
}

// Mock Worker constructor
global.Worker = MockWorker as any

//=============================================================================
// Plugin Upload Tests
//=============================================================================

describe('Plugin Upload E2E', () => {
  beforeEach(() => {
    mockStore.plugins = []
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should validate WASM format on upload', async () => {
    const user = userEvent.setup()
    render(<PluginManager />)

    // Find file input
    const fileInput = screen.getByLabelText(/upload.*plugin/i) as HTMLInputElement
    expect(fileInput).toBeInTheDocument()

    // Create invalid file (not WASM)
    const invalidFile = new File([JSON.stringify({ data: 'test' })], 'invalid.json', {
      type: 'application/json',
    })

    // Attempt upload
    await user.upload(fileInput, invalidFile)

    // Should show error
    await waitFor(() => {
      expect(screen.getByText(/invalid.*wasm/i)).toBeInTheDocument()
    })
  })

  it('should accept valid WASM file', async () => {
    const user = userEvent.setup()
    render(<PluginManager />)

    const fileInput = screen.getByLabelText(/upload.*plugin/i) as HTMLInputElement

    // Create valid WASM file
    const validFile = new File([validWasmBytes], 'test-plugin.wasm', {
      type: 'application/wasm',
    })

    await user.upload(fileInput, validFile)

    // Should show loading state
    await waitFor(() => {
      expect(screen.getByText(/loading/i)).toBeInTheDocument()
    })

    // Should eventually show the loaded plugin
    await waitFor(
      () => {
        expect(screen.getByText(/test-plugin/i)).toBeInTheDocument()
      },
      { timeout: 1000 }
    )
  })

  it('should show upload progress for large files', async () => {
    const user = userEvent.setup()
    render(<PluginManager />)

    const fileInput = screen.getByLabelText(/upload.*plugin/i) as HTMLInputElement

    // Create a larger WASM file
    const largeWasmBytes = new Uint8Array([...validWasmBytes, ...new Uint8Array(10000)])
    const largeFile = new File([largeWasmBytes], 'large-plugin.wasm', {
      type: 'application/wasm',
    })

    await user.upload(fileInput, largeFile)

    // Should show progress bar
    await waitFor(() => {
      const progressBar = screen.getByRole('progressbar')
      expect(progressBar).toBeInTheDocument()
    })
  })
})

//=============================================================================
// Plugin Manager Tests
//=============================================================================

describe('Plugin Manager E2E', () => {
  beforeEach(() => {
    mockStore.plugins = [{ ...mockPlugin }]
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should display list of installed plugins', () => {
    render(<PluginManager />)

    expect(screen.getByText('Test Plugin')).toBeInTheDocument()
    expect(screen.getByText(/1\.0\.0/)).toBeInTheDocument()
    expect(screen.getByText(/test plugin for e2e testing/i)).toBeInTheDocument()
  })

  it('should allow plugin deletion', async () => {
    const user = userEvent.setup()
    render(<PluginManager />)

    // Find delete button
    const deleteButton = screen.getByRole('button', { name: /delete|remove/i })
    expect(deleteButton).toBeInTheDocument()

    // Click delete
    await user.click(deleteButton)

    // Should show confirmation dialog
    expect(screen.getByText(/are you sure/i)).toBeInTheDocument()

    // Confirm deletion
    const confirmButton = screen.getByRole('button', { name: /confirm|yes/i })
    await user.click(confirmButton)

    // Plugin should be removed
    await waitFor(() => {
      expect(screen.queryByText('Test Plugin')).not.toBeInTheDocument()
    })
  })

  it('should switch between grid and list views', async () => {
    const user = userEvent.setup()
    render(<PluginManager />)

    // Find view toggle buttons
    const gridButton = screen.getByRole('button', { name: /grid/i })
    const listButton = screen.getByRole('button', { name: /list/i })

    expect(gridButton).toBeInTheDocument()
    expect(listButton).toBeInTheDocument()

    // Click list view
    await user.click(listButton)

    // Container should have list class
    const container = screen.getByTestId('plugin-list')
    expect(container).toHaveClass('plugin-list--list')
  })

  it('should filter plugins by search', async () => {
    const user = userEvent.setup()
    render(<PluginManager />)

    // Find search input
    const searchInput = screen.getByPlaceholderText(/search|filter/i)
    expect(searchInput).toBeInTheDocument()

    // Type search query
    await user.type(searchInput, 'test')

    // Should show matching plugins
    expect(screen.getByText('Test Plugin')).toBeInTheDocument()

    // Type non-matching query
    await user.clear(searchInput)
    await user.type(searchInput, 'nonexistent')

    // Should show no results
    await waitFor(() => {
      expect(screen.getByText(/no plugins found/i)).toBeInTheDocument()
    })
  })

  it('should sort plugins by name', async () => {
    const user = userEvent.setup()

    // Add multiple plugins
    mockStore.plugins = [
      { ...mockPlugin, metadata: { ...mockPlugin.metadata, id: 'zebra', name: 'Zebra Plugin' } },
      { ...mockPlugin, metadata: { ...mockPlugin.metadata, id: 'alpha', name: 'Alpha Plugin' } },
    ]

    render(<PluginManager />)

    // Find sort dropdown
    const sortSelect = screen.getByRole('combobox', { name: /sort by/i })
    expect(sortSelect).toBeInTheDocument()

    // Select sort by name
    await user.selectOptions(sortSelect, 'name')

    // Plugins should be sorted alphabetically
    const pluginCards = screen.getAllByTestId('plugin-card')
    expect(within(pluginCards[0]).getByText('Alpha Plugin')).toBeInTheDocument()
    expect(within(pluginCards[1]).getByText('Zebra Plugin')).toBeInTheDocument()
  })
})

//=============================================================================
// Plugin Execution Tests
//=============================================================================

describe('Plugin Execution E2E', () => {
  beforeEach(() => {
    mockStore.plugins = [{ ...mockPlugin }]
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should execute plugin on selected files', async () => {
    const user = userEvent.setup()
    const onProgress = vi.fn()
    const onComplete = vi.fn()

    render(
      <PluginExecutor
        plugins={[mockPlugin]}
        files={mockFiles}
        onProgress={onProgress}
        onComplete={onComplete}
      />
    )

    // Find execute button
    const executeButton = screen.getByRole('button', { name: /execute|run/i })
    expect(executeButton).toBeInTheDocument()

    // Click execute
    await user.click(executeButton)

    // Should show executing state
    await waitFor(() => {
      expect(screen.getByText(/executing|processing/i)).toBeInTheDocument()
    })

    // Should report progress
    await waitFor(() => {
      expect(onProgress).toHaveBeenCalled()
    })

    // Should complete
    await waitFor(
      () => {
        expect(onComplete).toHaveBeenCalledWith(
          expect.objectContaining({
            status: 'Success',
          })
        )
      },
      { timeout: 2000 }
    )
  })

  it('should display execution progress', async () => {
    const user = userEvent.setup()
    render(<PluginExecutor plugins={[mockPlugin]} files={mockFiles} />)

    const executeButton = screen.getByRole('button', { name: /execute|run/i })
    await user.click(executeButton)

    // Should show progress bar
    await waitFor(() => {
      const progressBar = screen.getByRole('progressbar')
      expect(progressBar).toBeInTheDocument()
    })

    // Should show file count
    expect(screen.getByText(/2 files/i)).toBeInTheDocument()
  })

  it('should support canceling execution', async () => {
    const user = userEvent.setup()
    render(<PluginExecutor plugins={[mockPlugin]} files={mockFiles} />)

    const executeButton = screen.getByRole('button', { name: /execute|run/i })
    await user.click(executeButton)

    // Wait for execution to start
    await waitFor(() => {
      expect(screen.getByText(/executing|processing/i)).toBeInTheDocument()
    })

    // Find and click cancel button
    const cancelButton = screen.getByRole('button', { name: /cancel|stop/i })
    await user.click(cancelButton)

    // Should show canceled state
    await waitFor(() => {
      expect(screen.getByText(/canceled|stopped/i)).toBeInTheDocument()
    })
  })

  it('should handle execution errors gracefully', async () => {
    const user = userEvent.setup()

    // Mock a plugin that will fail
    const failingPlugin: PluginInstance = {
      ...mockPlugin,
      metadata: {
        ...mockPlugin.metadata,
        id: 'failing-plugin',
      },
      state: 'Error',
      error: 'Simulated execution failure',
    }

    render(<PluginExecutor plugins={[failingPlugin]} files={mockFiles} />)

    const executeButton = screen.getByRole('button', { name: /execute|run/i })
    await user.click(executeButton)

    // Should show error message
    await waitFor(() => {
      expect(screen.getByText(/error|failed/i)).toBeInTheDocument()
    })
  })
})

//=============================================================================
// Plugin Results Tests
//=============================================================================

describe('Plugin Results E2E', () => {
  it('should display aggregated results', () => {
    render(<PluginResults result={mockAggregateResult} />)

    // Should show summary statistics
    expect(screen.getByText(/total plugins:\s*1/i)).toBeInTheDocument()
    expect(screen.getByText(/total files:\s*2/i)).toBeInTheDocument()
    expect(screen.getByText(/processed:\s*2/i)).toBeInTheDocument()
    expect(screen.getByText(/errors:\s*0/i)).toBeInTheDocument()
  })

  it('should group results by plugin', () => {
    render(<PluginResults result={mockAggregateResult} />)

    // Should show plugin name
    expect(screen.getByText('Test Plugin')).toBeInTheDocument()

    // Should show plugin stats
    expect(screen.getByText(/2 files processed/i)).toBeInTheDocument()
  })

  it('should group results by file', () => {
    const resultWithFiles: PluginResultType = {
      ...mockAggregateResult,
      byFile: {
        '/test/file1.txt': {
          'test-plugin': {
            path: '/test/file1.txt',
            status: 'Success',
            data: { lines: 42 },
          },
        },
      },
    }

    render(<PluginResults result={resultWithFiles} />)

    // Should show file name
    expect(screen.getByText('file1.txt')).toBeInTheDocument()
  })

  it('should support exporting results', async () => {
    const user = userEvent.setup()
    render(<PluginResults result={mockAggregateResult} />)

    // Find export button
    const exportButton = screen.getByRole('button', { name: /export/i })
    expect(exportButton).toBeInTheDocument()

    // Mock URL.createObjectURL
    const createObjectURLMock = vi.fn(() => 'blob:url')
    global.URL.createObjectURL = createObjectURLMock

    // Click export
    await user.click(exportButton)

    // Should show export options
    expect(screen.getByText(/json|csv/i)).toBeInTheDocument()
  })

  it('should display empty state when no results', () => {
    const emptyResult: PluginResultType = {
      pluginId: 'test',
      pluginName: 'Test',
      status: 'Success',
      summary: {
        totalPlugins: 0,
        totalFiles: 0,
        totalProcessed: 0,
        totalErrors: 0,
        duration: 0,
      },
      byPlugin: {},
      byFile: {},
    }

    render(<PluginResults result={emptyResult} />)

    // Should show empty state message
    expect(screen.getByText(/no results|run a plugin/i)).toBeInTheDocument()
  })
})
