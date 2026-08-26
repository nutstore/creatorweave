/**
 * Mock Plugin Data
 *
 * Test data for plugin system development and demonstration
 */

import type { PluginInstance } from '../types/plugin'

export const MOCK_PLUGINS: PluginInstance[] = [
  {
    metadata: {
      id: 'line-counter',
      name: 'Line Counter',
      version: '0.1.0',
      api_version: '2.0.0',
      description: 'Count lines, characters, and blank lines in text files',
      author: 'Core Team',
      capabilities: {
        metadata_only: false,
        requires_content: true,
        supports_streaming: true,
        max_file_size: 50 * 1024 * 1024,
        file_extensions: [
          '.txt',
          '.md',
          '.js',
          '.ts',
          '.jsx',
          '.tsx',
          '.rs',
          '.go',
          '.py',
          '.java',
          '.c',
          '.cpp',
          '.h',
          '.hpp',
        ],
      },
      resource_limits: {
        max_memory: 8 * 1024 * 1024,
        max_execution_time: 30000,
        worker_count: 1,
      },
    },
    state: 'Loaded',
    loadedAt: Date.now() - 10000,
  },
  {
    metadata: {
      id: 'md5-calculator',
      name: 'MD5 Calculator',
      version: '0.1.0',
      api_version: '2.0.0',
      description: 'Calculate MD5 hash of files',
      author: 'Core Team',
      capabilities: {
        metadata_only: false,
        requires_content: true,
        supports_streaming: false,
        max_file_size: 100 * 1024 * 1024,
        file_extensions: ['*'],
      },
      resource_limits: {
        max_memory: 16 * 1024 * 1024,
        max_execution_time: 30000,
        worker_count: 1,
      },
    },
    state: 'Loaded',
    loadedAt: Date.now() - 20000,
  },
]
