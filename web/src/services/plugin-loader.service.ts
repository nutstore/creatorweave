/**
 * Plugin Loader Service
 *
 * Handles loading WASM plugins from ArrayBuffer or URL,
 * managing plugin instances and their lifecycle.
 */

import type {
  FileInput,
  FileOutput,
  PluginInstance,
  PluginMetadata,
  PluginResult,
  PluginWorkerMessage,
  PluginWorkerResponse,
  PluginValidationResult,
} from '../types/plugin'

//=============================================================================
// Plugin Loader Class
//=============================================================================

export class PluginLoaderService {
  private plugins: Map<string, PluginInstance> = new Map()
  private workers: Map<string, Worker> = new Map()

  /**
   * Load a plugin from WASM bytes
   * @param wasmBytes - Raw WASM file content
   * @returns Plugin instance with metadata
   */
  async loadPlugin(wasmBytes: ArrayBuffer): Promise<PluginInstance> {
    console.log('[PluginLoader] Loading plugin from WASM bytes, size:', wasmBytes.byteLength)

    // Validate WASM format first
    const validation = this.validateWasmFormat(wasmBytes)
    if (!validation.isValid) {
      throw new Error(`Invalid WASM: ${validation.errors.join(', ')}`)
    }
    console.log('[PluginLoader] WASM format validated')

    // Create worker for this plugin
    // Add cache-busting timestamp to force reload
    const workerUrl = new URL('../workers/plugin.worker.ts', import.meta.url)
    workerUrl.searchParams.set('t', Date.now().toString())
    const worker = new Worker(workerUrl, { type: 'module' })
    console.log('[PluginLoader] Worker created:', workerUrl.toString())

    // Create plugin instance record
    const instance: PluginInstance = {
      metadata: {
        id: '', // Will be filled by worker
        name: '',
        version: '',
        api_version: '',
        description: '',
        author: '',
        capabilities: {
          metadata_only: false,
          requires_content: false,
          supports_streaming: false,
          max_file_size: 0,
          file_extensions: [],
        },
        resource_limits: {
          max_memory: 16 * 1024 * 1024,
          max_execution_time: 5000,
          worker_count: 1,
        },
      },
      state: 'Loading',
      worker,
      loadedAt: Date.now(),
    }

    // Set up worker message handler
    const loadPromise = new Promise<PluginMetadata>((resolve, reject) => {
      const handler = (event: MessageEvent) => {
        const response = event.data as PluginWorkerResponse
        console.log('[PluginLoader] Worker message:', response.type)

        switch (response.type) {
          case 'LOADED':
            const receivedMetadata = (response.payload as { metadata: PluginMetadata }).metadata
            console.log('[PluginLoader] Received metadata:', {
              id: receivedMetadata.id,
              name: receivedMetadata.name,
              hasResourceLimits: !!receivedMetadata.resource_limits,
              hasCapabilities: !!receivedMetadata.capabilities,
            })
            // Ensure resource_limits exists with defaults
            if (!receivedMetadata.resource_limits) {
              console.warn('[PluginLoader] Missing resource_limits, adding defaults')
              receivedMetadata.resource_limits = {
                max_memory: 16 * 1024 * 1024,
                max_execution_time: 5000,
                worker_count: 1,
              }
            }
            // Ensure capabilities exists with defaults
            if (!receivedMetadata.capabilities) {
              console.warn('[PluginLoader] Missing capabilities, adding defaults')
              receivedMetadata.capabilities = {
                metadata_only: false,
                requires_content: false,
                supports_streaming: false,
                max_file_size: 0,
                file_extensions: [],
              }
            }
            instance.metadata = receivedMetadata
            instance.state = 'Loaded'
            // @ts-ignore - internal tracking
            ;(instance as any).wasmModule = response.payload?.wasmModule
            console.log('[PluginLoader] Plugin loaded successfully:', receivedMetadata.id)
            resolve(instance.metadata)
            worker.removeEventListener('message', handler)
            break

          case 'ERROR':
            instance.state = 'Error'
            instance.error = response.error
            console.error('[PluginLoader] Worker error:', response.error)
            reject(new Error(response.error || 'Failed to load plugin'))
            worker.removeEventListener('message', handler)
            break

          case 'PROGRESS':
            // Handle progress updates
            console.log('[PluginLoader] Progress:', response.payload)
            break
        }
      }

      worker.addEventListener('message', handler)

      // Send load command
      console.log('[PluginLoader] Sending LOAD command with WASM bytes')
      worker.postMessage({
        type: 'LOAD',
        payload: { wasmBytes },
      } as PluginWorkerMessage)

      // Set timeout for loading
      setTimeout(() => {
        if (instance.state === 'Loading') {
          console.error('[PluginLoader] Load timeout')
          worker.removeEventListener('message', handler)
          reject(new Error('Plugin load timeout (10s)'))
        }
      }, 10000)
    })

    try {
      const metadata = await loadPromise
      this.plugins.set(metadata.id, instance)
      this.workers.set(metadata.id, worker)

      // Auto-register as Agent tool
      this.registerAsAgentTool(metadata)

      return instance
    } catch (error) {
      console.error('[PluginLoader] Load failed:', error)
      worker.terminate()
      throw error
    }
  }

  /**
   * Load a plugin from a URL
   * @param url - URL to fetch WASM file from
   * @returns Plugin instance
   */
  async loadPluginFromUrl(url: string): Promise<PluginInstance> {
    // Extract pluginId from URL (e.g., "/wasm/line_counter_bg.wasm" -> "line-counter")
    const urlParts = url.split('/')
    const filename = urlParts[urlParts.length - 1]
    // Convert underscores to dashes for plugin ID
    const wasmId = filename.replace('_bg.wasm', '').replace('.wasm', '')
    const pluginId = wasmId.replace(/_/g, '-')

    return this.loadPluginWithId(pluginId)
  }

  /**
   * Load a plugin with a specific ID
   * @param pluginId - Plugin ID for loading JS bindings
   * @returns Plugin instance
   */
  async loadPluginWithId(pluginId: string): Promise<PluginInstance> {
    console.log('[PluginLoader] Loading plugin with ID:', pluginId)

    // Create worker for this plugin
    // Add cache-busting timestamp to force reload
    const workerUrl = new URL('../workers/plugin.worker.ts', import.meta.url)
    workerUrl.searchParams.set('t', Date.now().toString())
    const worker = new Worker(workerUrl, { type: 'module' })
    console.log('[PluginLoader] Worker created for plugin:', pluginId)

    // Create plugin instance record
    const instance: PluginInstance = {
      metadata: {
        id: '', // Will be filled by worker
        name: '',
        version: '',
        api_version: '',
        description: '',
        author: '',
        capabilities: {
          metadata_only: false,
          requires_content: false,
          supports_streaming: false,
          max_file_size: 0,
          file_extensions: [],
        },
        resource_limits: {
          max_memory: 16 * 1024 * 1024,
          max_execution_time: 5000,
          worker_count: 1,
        },
      },
      state: 'Loading',
      worker,
      loadedAt: Date.now(),
    }

    // Set up worker message handler
    const loadPromise = new Promise<PluginMetadata>((resolve, reject) => {
      const handler = (event: MessageEvent) => {
        const response = event.data as PluginWorkerResponse

        switch (response.type) {
          case 'LOADED':
            const receivedMetadata = (response.payload as { metadata: PluginMetadata }).metadata
            // Ensure resource_limits exists with defaults
            if (!receivedMetadata.resource_limits) {
              receivedMetadata.resource_limits = {
                max_memory: 16 * 1024 * 1024,
                max_execution_time: 5000,
                worker_count: 1,
              }
            }
            // Ensure capabilities exists with defaults
            if (!receivedMetadata.capabilities) {
              receivedMetadata.capabilities = {
                metadata_only: false,
                requires_content: false,
                supports_streaming: false,
                max_file_size: 0,
                file_extensions: [],
              }
            }
            instance.metadata = receivedMetadata
            instance.state = 'Loaded'
            // @ts-ignore - internal tracking
            ;(instance as any).wasmModule = response.payload?.wasmModule
            resolve(instance.metadata)
            worker.removeEventListener('message', handler)
            break

          case 'ERROR':
            instance.state = 'Error'
            instance.error = response.error
            reject(new Error(response.error || 'Failed to load plugin'))
            worker.removeEventListener('message', handler)
            break

          case 'PROGRESS':
            // Handle progress updates
            console.log('[PluginLoader] Progress:', response.payload)
            break
        }
      }

      worker.addEventListener('message', handler)

      // Send load command with pluginId (worker will load WASM from URL)
      worker.postMessage({
        type: 'LOAD',
        payload: { pluginId },
      } as PluginWorkerMessage)

      // Set timeout for loading
      setTimeout(() => {
        if (instance.state === 'Loading') {
          worker.removeEventListener('message', handler)
          reject(new Error('Plugin load timeout (10s)'))
        }
      }, 10000)
    })

    try {
      const metadata = await loadPromise
      this.plugins.set(metadata.id, instance)
      this.workers.set(metadata.id, worker)
      return instance
    } catch (error) {
      worker.terminate()
      throw error
    }
  }

  /**
   * Unload a plugin and clean up resources
   * @param pluginId - ID of plugin to unload
   */
  async unloadPlugin(pluginId: string): Promise<void> {
    const instance = this.plugins.get(pluginId)
    if (!instance) {
      throw new Error(`Plugin not found: ${pluginId}`)
    }

    // Send cleanup message to worker
    if (instance.worker) {
      instance.worker.postMessage({
        type: 'CLEANUP',
      } as PluginWorkerMessage)

      // Wait a bit for cleanup, then terminate worker
      await new Promise((resolve) => setTimeout(resolve, 100))
      instance.worker.terminate()
      this.workers.delete(pluginId)
    }

    // Auto-unregister from Agent tool registry
    this.unregisterAgentTool(pluginId)

    this.plugins.delete(pluginId)
  }

  /**
   * Get a loaded plugin by ID
   * @param pluginId - Plugin ID
   * @returns Plugin instance or undefined
   */
  getPlugin(pluginId: string): PluginInstance | undefined {
    return this.plugins.get(pluginId)
  }

  /**
   * Get all loaded plugins
   * @returns Map of plugin ID to instance
   */
  getAllPlugins(): Map<string, PluginInstance> {
    return new Map(this.plugins)
  }

  /**
   * Execute plugin on a file
   * @param pluginId - Plugin ID
   * @param fileInput - File to process
   * @returns Processing result
   */
  async executePlugin(pluginId: string, fileInput: FileInput): Promise<FileOutput> {
    console.log('[PluginLoader] Executing plugin:', pluginId, 'for file:', fileInput.path)

    const instance = this.plugins.get(pluginId)
    if (!instance) {
      throw new Error(`Plugin not found: ${pluginId}`)
    }

    if (!instance.worker || instance.state !== 'Loaded') {
      throw new Error(`Plugin not ready: ${pluginId} (state: ${instance.state})`)
    }

    return new Promise<FileOutput>((resolve, reject) => {
      const handler = (event: MessageEvent) => {
        const response = event.data as PluginWorkerResponse
        console.log('[PluginLoader] Execution response:', response.type)

        switch (response.type) {
          case 'RESULT':
            const result = response.payload as { output: FileOutput }
            console.log(
              '[PluginLoader] Execution result:',
              result.output.path,
              result.output.status
            )
            resolve(result.output)
            instance.worker!.removeEventListener('message', handler)
            break

          case 'ERROR':
            console.error('[PluginLoader] Execution error:', response.error)
            reject(new Error(response.error || 'Execution failed'))
            instance.worker!.removeEventListener('message', handler)
            break

          case 'PROGRESS':
            console.log(`[Plugin ${pluginId}] Progress:`, response.payload)
            break
        }
      }

      instance.worker!.addEventListener('message', handler)

      console.log('[PluginLoader] Sending EXECUTE command')
      instance.worker!.postMessage({
        type: 'EXECUTE',
        payload: { fileInput },
      } as PluginWorkerMessage)

      // Timeout based on plugin's max_execution_time
      const timeout = instance.metadata?.resource_limits?.max_execution_time ?? 30000
      console.log('[PluginLoader] Timeout set to:', timeout, 'ms')
      setTimeout(() => {
        console.error('[PluginLoader] Execution timeout after', timeout, 'ms')
        instance.worker!.removeEventListener('message', handler)
        reject(new Error(`Execution timeout (${timeout}ms)`))
      }, timeout)
    })
  }

  /**
   * Finalize plugin results
   * @param pluginId - Plugin ID
   * @param outputs - All file outputs
   * @returns Aggregated result
   */
  async finalizePlugin(pluginId: string, outputs: FileOutput[]): Promise<PluginResult> {
    console.log('[PluginLoader] Finalizing plugin:', pluginId, 'with', outputs.length, 'outputs')

    const instance = this.plugins.get(pluginId)
    if (!instance) {
      throw new Error(`Plugin not found: ${pluginId}`)
    }

    return new Promise<PluginResult>((resolve, reject) => {
      const handler = (event: MessageEvent) => {
        const response = event.data as PluginWorkerResponse

        switch (response.type) {
          case 'RESULT':
            const result = response.payload as { result: PluginResult }
            console.log('[PluginLoader] Finalization result:', result.result)
            resolve(result.result)
            instance.worker!.removeEventListener('message', handler)
            break

          case 'ERROR':
            console.error('[PluginLoader] Finalization error:', response.error)
            reject(new Error(response.error || 'Finalization failed'))
            instance.worker!.removeEventListener('message', handler)
            break
        }
      }

      instance.worker!.addEventListener('message', handler)

      console.log('[PluginLoader] Sending FINALIZE command')
      instance.worker!.postMessage({
        type: 'FINALIZE',
        payload: { outputs },
      } as PluginWorkerMessage)

      setTimeout(() => {
        console.error('[PluginLoader] Finalization timeout')
        instance.worker!.removeEventListener('message', handler)
        reject(new Error('Finalization timeout'))
      }, 5000)
    })
  }

  /**
   * Validate WASM format (basic check)
   * @param wasmBytes - Raw WASM bytes
   * @returns Validation result
   */
  private validateWasmFormat(wasmBytes: ArrayBuffer): PluginValidationResult {
    const errors: string[] = []
    const bytes = new Uint8Array(wasmBytes)

    // Check WASM magic number: 00 61 73 6D 01 00 00 00
    const magic = [0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]
    if (bytes.length < 8 || !magic.every((byte, i) => bytes[i] === byte)) {
      errors.push('Invalid WASM format (bad magic number)')
    }

    return {
      isValid: errors.length === 0,
      errors,
    }
  }

  /**
   * Check if a plugin is loaded
   * @param pluginId - Plugin ID
   * @returns true if loaded
   */
  isLoaded(pluginId: string): boolean {
    return this.plugins.has(pluginId)
  }

  /**
   * Get number of loaded plugins
   * @returns Count of loaded plugins
   */
  getLoadedCount(): number {
    return this.plugins.size
  }

  /**
   * Cleanup all plugins
   */
  async cleanupAll(): Promise<void> {
    const promises: Promise<void>[] = []

    for (const [pluginId] of this.plugins) {
      promises.push(this.unloadPlugin(pluginId))
    }

    await Promise.allSettled(promises)
  }

  //===========================================================================
  // Agent Tool Registry Integration
  //===========================================================================

  /** Register a loaded plugin as an Agent tool */
  private registerAsAgentTool(metadata: PluginMetadata): void {
    try {
      // Dynamic import to avoid circular dependency
      import('@/agent/tool-registry').then(({ getToolRegistry }) => {
        const registry = getToolRegistry()
        registry.registerPlugin(metadata)
        console.log(`[PluginLoader] Registered plugin as Agent tool: wasm_plugin_${metadata.id}`)
      })
    } catch {
      // Tool registry may not be initialized yet
    }
  }

  /** Unregister a plugin from the Agent tool registry */
  private unregisterAgentTool(pluginId: string): void {
    try {
      import('@/agent/tool-registry').then(({ getToolRegistry }) => {
        const registry = getToolRegistry()
        registry.unregisterPlugin(pluginId)
        console.log(`[PluginLoader] Unregistered Agent tool: wasm_plugin_${pluginId}`)
      })
    } catch {
      // Tool registry may not be available
    }
  }
}

//=============================================================================
// Singleton Instance
//=============================================================================

let loaderInstance: PluginLoaderService | null = null

export function getPluginLoader(): PluginLoaderService {
  if (!loaderInstance) {
    loaderInstance = new PluginLoaderService()
  }
  return loaderInstance
}
