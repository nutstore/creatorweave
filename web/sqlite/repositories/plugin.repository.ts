/**
 * Plugin Repository
 *
 * SQLite-based storage for WASM plugin metadata
 */

import { getSQLiteDB, parseJSON, toJSON } from '../sqlite-database'
import type { PluginMetadata, PluginCapabilities, ResourceLimits } from '../../types/plugin'

// Database row type (snake_case for SQLite)
interface PluginRow {
  id: string
  name: string
  version: string
  api_version: string
  description: string | null
  author: string | null
  capabilities_json: string // JSON object
  resource_limits_json: string // JSON object
  state: string
  wasm_bytes: Uint8Array | null
  loaded_at: number
  created_at: number
}

export interface StoredPlugin {
  id: string
  name: string
  version: string
  apiVersion: string
  description: string
  author: string
  capabilities: PluginCapabilities
  resourceLimits: ResourceLimits
  state: 'Loaded' | 'Unloaded' | 'Error'
  wasmBytes?: ArrayBuffer
  loadedAt: number
  createdAt: number
}

//=============================================================================
// Plugin Repository
//=============================================================================

export type { PluginMetadata, ResourceLimits, PluginCapabilities } from '../../types/plugin'

export class PluginRepository {
  /**
   * Get all plugins
   */
  async findAll(): Promise<StoredPlugin[]> {
    const db = getSQLiteDB()
    const rows = await db.queryAll<PluginRow>('SELECT * FROM plugins ORDER BY name')
    return await Promise.all(rows.map((row) => this.rowToPlugin(row)))
  }

  /**
   * Find plugin by ID
   */
  async findById(id: string): Promise<StoredPlugin | null> {
    const db = getSQLiteDB()
    const row = await db.queryFirst<PluginRow>('SELECT * FROM plugins WHERE id = ?', [id])
    return row ? await this.rowToPlugin(row) : null
  }

  /**
   * Find plugin by name
   */
  async findByName(name: string): Promise<StoredPlugin | null> {
    const db = getSQLiteDB()
    const row = await db.queryFirst<PluginRow>('SELECT * FROM plugins WHERE name = ?', [name])
    return row ? await this.rowToPlugin(row) : null
  }

  /**
   * Get all plugin metadata (lightweight)
   */
  async findAllMetadata(): Promise<PluginMetadata[]> {
    const db = getSQLiteDB()
    const rows = await db.queryAll<PluginRow>(
      'SELECT id, name, version, api_version, description, author, capabilities_json, resource_limits_json FROM plugins ORDER BY name'
    )
    return rows.map((row) => this.rowToMetadata(row))
  }

  /**
   * Save or update a plugin
   */
  async save(plugin: StoredPlugin): Promise<void> {
    const db = getSQLiteDB()
    await db.execute(
      `INSERT INTO plugins (id, name, version, api_version, description, author, capabilities_json,
                          resource_limits_json, state, wasm_bytes, loaded_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         version = excluded.version,
         api_version = excluded.api_version,
         description = excluded.description,
         author = excluded.author,
         capabilities_json = excluded.capabilities_json,
         resource_limits_json = excluded.resource_limits_json,
         state = excluded.state,
         wasm_bytes = excluded.wasm_bytes,
         loaded_at = excluded.loaded_at`,
      [
        plugin.id,
        plugin.name,
        plugin.version,
        plugin.apiVersion,
        plugin.description,
        plugin.author,
        toJSON(plugin.capabilities),
        toJSON(plugin.resourceLimits),
        plugin.state,
        plugin.wasmBytes ? new Uint8Array(plugin.wasmBytes) : null,
        plugin.loadedAt,
        plugin.createdAt,
      ]
    )
  }

  /**
   * Update plugin state
   */
  async updateState(id: string, state: 'Loaded' | 'Unloaded' | 'Error'): Promise<void> {
    const db = getSQLiteDB()
    await db.execute('UPDATE plugins SET state = ? WHERE id = ?', [state, id])
  }

  /**
   * Delete plugin
   */
  async delete(id: string): Promise<void> {
    const db = getSQLiteDB()
    await db.execute('DELETE FROM plugins WHERE id = ?', [id])
  }

  /**
   * Delete all plugins
   */
  async deleteAll(): Promise<void> {
    const db = getSQLiteDB()
    await db.execute('DELETE FROM plugins')
  }

  /**
   * Get plugin count
   */
  async count(): Promise<number> {
    const db = getSQLiteDB()
    const row = await db.queryFirst<{ count: number }>('SELECT COUNT(*) as count FROM plugins')
    return row?.count || 0
  }

  /**
   * Convert database row to domain object
   */
  private async rowToPlugin(row: PluginRow): Promise<StoredPlugin> {
    const capabilities: PluginCapabilities = parseJSON<PluginCapabilities>(row.capabilities_json, {
      metadata_only: false,
      requires_content: false,
      supports_streaming: false,
      max_file_size: 0,
      file_extensions: [],
    })

    const resourceLimits: ResourceLimits = parseJSON<ResourceLimits>(row.resource_limits_json, {
      max_memory: 16 * 1024 * 1024,
      max_execution_time: 5000,
      worker_count: 1,
    })

    return {
      id: row.id,
      name: row.name,
      version: row.version,
      apiVersion: row.api_version,
      description: row.description || '',
      author: row.author || '',
      capabilities,
      resourceLimits,
      state: row.state as 'Loaded' | 'Unloaded' | 'Error',
      wasmBytes: row.wasm_bytes
        ? new Uint8Array(row.wasm_bytes).buffer.slice(
            row.wasm_bytes.byteOffset,
            row.wasm_bytes.byteOffset + row.wasm_bytes.byteLength
          )
        : undefined,
      loadedAt: row.loaded_at,
      createdAt: row.created_at,
    }
  }

  /**
   * Convert database row to metadata
   */
  private rowToMetadata(row: PluginRow): PluginMetadata {
    const capabilities: PluginCapabilities = parseJSON<PluginCapabilities>(row.capabilities_json, {
      metadata_only: false,
      requires_content: false,
      supports_streaming: false,
      max_file_size: 0,
      file_extensions: [],
    })

    const resourceLimits: ResourceLimits = parseJSON<ResourceLimits>(row.resource_limits_json, {
      max_memory: 16 * 1024 * 1024,
      max_execution_time: 5000,
      worker_count: 1,
    })

    return {
      id: row.id,
      name: row.name,
      version: row.version,
      api_version: row.api_version,
      description: row.description || '',
      author: row.author || '',
      capabilities,
      resource_limits: resourceLimits,
    }
  }
}

//=============================================================================
// Singleton Instance
//=============================================================================

let pluginRepoInstance: PluginRepository | null = null

export function getPluginRepository(): PluginRepository {
  if (!pluginRepoInstance) {
    pluginRepoInstance = new PluginRepository()
  }
  return pluginRepoInstance
}
