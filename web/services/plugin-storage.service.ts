/**
 * Plugin Storage Service
 *
 * Handles SQLite persistence for loaded WASM plugins
 */

import type { PluginInstance, PluginMetadata } from '../types/plugin'
import { getPluginRepository } from '@/sqlite'
import type { StoredPlugin } from '@/sqlite'

//=============================================================================
// Plugin Storage Service
//=============================================================================

class PluginStorageService {
  private initialized = false

  /**
   * Initialize SQLite
   */
  async initialize(): Promise<void> {
    if (this.initialized) return
    // SQLite is initialized via App.tsx
    this.initialized = true
  }

  /**
   * Save a plugin to SQLite (serializable data only, no Worker)
   */
  async savePlugin(plugin: PluginInstance): Promise<void> {
    await this.initialize()
    const repo = getPluginRepository()

    // Only save serializable data - Worker cannot be cloned
    await repo.save({
      id: plugin.metadata.id,
      name: plugin.metadata.name,
      version: plugin.metadata.version,
      apiVersion: plugin.metadata.api_version,
      description: plugin.metadata.description,
      author: plugin.metadata.author,
      capabilities: plugin.metadata.capabilities,
      resourceLimits: plugin.metadata.resource_limits,
      state: plugin.state as 'Loaded' | 'Unloaded' | 'Error',
      loadedAt: plugin.loadedAt || Date.now(),
      createdAt: plugin.loadedAt || Date.now(),
    })
  }

  /**
   * Load all plugins from SQLite
   */
  async loadPlugins(): Promise<PluginInstance[]> {
    await this.initialize()
    const repo = getPluginRepository()
    const plugins = await repo.findAll()
    console.log('[PluginStorage] Loaded', plugins.length, 'plugins from SQLite')

    // Ensure each plugin has complete metadata with defaults
    return plugins.map((plugin: StoredPlugin) => {
      const metadata: PluginMetadata = {
        id: plugin.id,
        name: plugin.name,
        version: plugin.version,
        api_version: plugin.apiVersion,
        description: plugin.description,
        author: plugin.author,
        capabilities: plugin.capabilities,
        resource_limits: plugin.resourceLimits,
      }

      console.log('[PluginStorage] Plugin loaded:', metadata.id, 'state:', plugin.state)
      // Worker is not serializable and must be recreated when needed
      return {
        metadata,
        state: plugin.state as PluginInstance['state'],
        loadedAt: plugin.loadedAt,
        worker: undefined, // Will be created when needed
      }
    })
  }

  /**
   * Get a specific plugin by ID
   */
  async getPlugin(id: string): Promise<PluginInstance | undefined> {
    await this.initialize()
    const repo = getPluginRepository()
    const plugin = await repo.findById(id)

    if (!plugin) return undefined

    const metadata: PluginMetadata = {
      id: plugin.id,
      name: plugin.name,
      version: plugin.version,
      api_version: plugin.apiVersion,
      description: plugin.description,
      author: plugin.author,
      capabilities: plugin.capabilities,
      resource_limits: plugin.resourceLimits,
    }

    return {
      metadata,
      state: plugin.state as PluginInstance['state'],
      loadedAt: plugin.loadedAt,
      worker: undefined,
    }
  }

  /**
   * Delete a plugin from SQLite
   */
  async deletePlugin(id: string): Promise<void> {
    await this.initialize()
    const repo = getPluginRepository()
    await repo.delete(id)
  }

  /**
   * Clear all plugins
   */
  async clearAll(): Promise<void> {
    await this.initialize()
    const repo = getPluginRepository()
    await repo.deleteAll()
  }

  /**
   * Store plugin WASM bytes
   */
  async savePluginBytes(id: string, bytes: ArrayBuffer): Promise<void> {
    await this.initialize()
    const repo = getPluginRepository()
    const existing = await repo.findById(id)

    if (existing) {
      existing.wasmBytes = bytes
      await repo.save(existing)
    }
  }

  /**
   * Get plugin WASM bytes
   */
  async getPluginBytes(id: string): Promise<ArrayBuffer | undefined> {
    await this.initialize()
    const repo = getPluginRepository()
    const plugin = await repo.findById(id)
    return plugin?.wasmBytes
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    this.initialized = false
  }
}

//=============================================================================
// Singleton Instance
//=============================================================================

let storageInstance: PluginStorageService | null = null

export function getPluginStorage(): PluginStorageService {
  if (!storageInstance) {
    storageInstance = new PluginStorageService()
  }
  return storageInstance
}

/**
 * Convert plugin metadata to stored instance format
 */
export function metadataToInstance(
  metadata: PluginMetadata
  // wasmBytes: ArrayBuffer - would be compiled to WASM module
): PluginInstance {
  return {
    metadata,
    state: 'Loaded',
    wasmModule: undefined, // Would be compiled from bytes
    loadedAt: Date.now(),
  }
}
