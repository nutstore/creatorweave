/**
 * Plugin Storage Service - SQLite Version
 *
 * Handles SQLite persistence for loaded WASM plugins
 */

import type { PluginInstance, PluginMetadata } from '../types/plugin'
import { getPluginRepository, initSQLiteDB } from '@/sqlite'

let initPromise: Promise<void> | null = null

/** Initialize SQLite for plugins (with promise caching to prevent race conditions) */
async function ensureInitialized(): Promise<void> {
  if (initPromise) {
    return initPromise
  }
  initPromise = (async () => {
    try {
      await initSQLiteDB()
    } catch (error) {
      // Clear promise on error to allow retry
      initPromise = null
      throw error
    }
  })()
  return initPromise
}

//=============================================================================
// Plugin Storage Service (SQLite)
//=============================================================================

class PluginStorageServiceSQLite {
  /**
   * Initialize SQLite
   */
  async initialize(): Promise<void> {
    await ensureInitialized()
  }

  /**
   * Save a plugin to SQLite (serializable data only, no Worker)
   */
  async savePlugin(plugin: PluginInstance): Promise<void> {
    await ensureInitialized()
    const repo = getPluginRepository()

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
    await ensureInitialized()
    const repo = getPluginRepository()
    const plugins = await repo.findAll()
    console.log('[PluginStorage] Loaded', plugins.length, 'plugins from SQLite')

    return plugins.map((plugin) => {
      // Ensure metadata has all required fields with defaults
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
        state: plugin.state as 'Loaded' | 'Unloaded' | 'Error',
        loadedAt: plugin.loadedAt,
        worker: undefined, // Will be created when needed
      }
    })
  }

  /**
   * Get a specific plugin by ID
   */
  async getPlugin(id: string): Promise<PluginInstance | undefined> {
    await ensureInitialized()
    const repo = getPluginRepository()
    const plugin = await repo.findById(id)

    if (!plugin) return undefined

    return {
      metadata: {
        id: plugin.id,
        name: plugin.name,
        version: plugin.version,
        api_version: plugin.apiVersion,
        description: plugin.description,
        author: plugin.author,
        capabilities: plugin.capabilities,
        resource_limits: plugin.resourceLimits,
      },
      state: plugin.state as 'Loaded' | 'Unloaded' | 'Error',
      loadedAt: plugin.loadedAt,
      worker: undefined,
    }
  }

  /**
   * Delete a plugin from SQLite
   */
  async deletePlugin(id: string): Promise<void> {
    await ensureInitialized()
    const repo = getPluginRepository()
    await repo.delete(id)
  }

  /**
   * Clear all plugins
   */
  async clearAll(): Promise<void> {
    await ensureInitialized()
    const repo = getPluginRepository()
    await repo.deleteAll()
  }

  /**
   * Store plugin WASM bytes
   */
  async savePluginBytes(id: string, bytes: ArrayBuffer): Promise<void> {
    await ensureInitialized()
    const repo = getPluginRepository()
    const plugin = await repo.findById(id)
    if (plugin) {
      await repo.save({
        ...plugin,
        wasmBytes: bytes,
      })
    }
  }

  /**
   * Get plugin WASM bytes
   */
  async getPluginBytes(id: string): Promise<ArrayBuffer | undefined> {
    await ensureInitialized()
    const repo = getPluginRepository()
    const plugin = await repo.findById(id)
    return plugin?.wasmBytes
  }

  /**
   * Update plugin state
   */
  async updatePluginState(id: string, state: 'Loaded' | 'Unloaded' | 'Error'): Promise<void> {
    await ensureInitialized()
    const repo = getPluginRepository()
    await repo.updateState(id, state)
  }

  /**
   * Close (no-op for SQLite, handled by database manager)
   */
  async close(): Promise<void> {
    // SQLite connection managed centrally
  }
}

//=============================================================================
// Singleton Instance
//=============================================================================

let storageInstance: PluginStorageServiceSQLite | null = null

export function getPluginStorageSQLite(): PluginStorageServiceSQLite {
  if (!storageInstance) {
    storageInstance = new PluginStorageServiceSQLite()
  }
  return storageInstance
}

/**
 * Convert plugin metadata to stored instance format
 */
export function metadataToInstance(metadata: PluginMetadata): PluginInstance {
  return {
    metadata,
    state: 'Loaded',
    loadedAt: Date.now(),
  }
}
