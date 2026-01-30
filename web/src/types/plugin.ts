/**
 * Plugin type definitions for Phase 2 Dynamic Plugin System
 */

/**
 * Plugin states in the lifecycle
 */
export type PluginState = 'Unloaded' | 'Loading' | 'Loaded' | 'Active' | 'Error' | 'Disabled'

/**
 * Plugin metadata from bfosa_plugin_info
 */
export interface PluginMetadata {
  id: string
  name: string
  version: string
  api_version: string
  description: string
  author: string
  capabilities: PluginCapabilities
  resource_limits: ResourceLimits
}

/**
 * Plugin capabilities and requirements
 */
export interface PluginCapabilities {
  metadata_only: boolean
  requires_content: boolean
  supports_streaming: boolean
  max_file_size: number
  file_extensions: string[]
}

/**
 * Resource limits to prevent plugin abuse
 */
export interface ResourceLimits {
  max_memory: number
  max_execution_time: number
  worker_count: number
}

/**
 * File input passed to plugin
 */
export interface FileInput {
  name: string
  path: string
  size: number
  mimeType?: string
  lastModified: number
  content?: Uint8Array
  metadata?: Record<string, unknown>
}

/**
 * File output returned from plugin
 */
export interface FileOutput {
  path: string
  status: ProcessingStatus
  data: unknown
  error?: string
}

/**
 * Processing status for a file
 */
export type ProcessingStatus = 'Success' | 'Skipped' | 'Error'

/**
 * Final aggregated plugin result
 */
export interface PluginResult {
  summary: string
  filesProcessed: number
  filesSkipped: number
  filesWithErrors: number
  metrics: unknown
  warnings: string[]
}

/**
 * Plugin instance in memory
 */
export interface PluginInstance {
  metadata: PluginMetadata
  state: PluginState
  wasmModule?: WebAssembly.Module
  wasmInstance?: WebAssembly.Instance
  worker?: Worker
  loadedAt?: number
  error?: string
}

/**
 * Worker message types
 */
export type PluginWorkerMessageType =
  | 'LOAD'
  | 'EXECUTE'
  | 'FINALIZE'
  | 'CLEANUP'
  | 'STREAM_INIT'
  | 'STREAM_CHUNK'
  | 'STREAM_FINALIZE'
  | 'GET_TOOL_SCHEMA'
  | 'EXECUTE_TOOL'

/**
 * Worker response types
 */
export type PluginWorkerResponseType = 'LOADED' | 'RESULT' | 'ERROR' | 'PROGRESS'

/**
 * Message sent to plugin worker
 */
export interface PluginWorkerMessage {
  type: PluginWorkerMessageType
  payload?: unknown
}

/**
 * Response from plugin worker
 */
export interface PluginWorkerResponse {
  type: PluginWorkerResponseType
  payload?: unknown
  error?: string
}

/**
 * Plugin validation result
 */
export interface PluginValidationResult {
  isValid: boolean
  errors: string[]
}

/**
 * Plugin storage data (IndexedDB)
 */
export interface StoredPlugin {
  id: string
  name: string
  wasmBytes: ArrayBuffer
  metadata: PluginMetadata
  enabled: boolean
  installedAt: number
  lastUsedAt?: number
}

/**
 * Execution context for a file
 */
export interface ExecutionContext {
  pluginId: string
  fileId: string
  startTime: number
  timeout: number
  memoryLimit: number
}

/**
 * Execution result for a single file
 */
export interface ExecutionResult {
  pluginId: string
  fileId: string
  success: boolean
  output?: FileOutput
  error?: string
  duration: number
}

/**
 * File entry for plugin processing
 */
export interface FileEntry {
  name: string
  path: string
  size: number
  type: 'file' | 'directory'
  mimeType?: string
  lastModified: number
  extension?: string
  content?: Uint8Array // File content as bytes (loaded when plugin requires it)
}

/**
 * Plugin for execution
 */
export interface Plugin {
  id: string
  metadata: PluginMetadata
}

/**
 * Execution progress update
 */
export interface ExecutionProgress {
  pluginId: string
  currentFile: string
  processed: number
  total: number
  percentage: number
}

/**
 * Aggregated file result across plugins
 */
export interface AggregatedFileResult {
  path: string
  name: string
  size: number
  pluginResults: Map<string, FileOutput>
}

/**
 * Aggregation summary
 */
export interface AggregationSummary {
  totalPlugins: number
  totalFiles: number
  totalProcessed: number
  totalSkipped: number
  totalErrors: number
  pluginsWithErrors: string[]
  duration: number
}

/**
 * Complete aggregated analysis result
 */
export interface AggregateResult {
  summary: AggregationSummary
  byFile: Map<string, AggregatedFileResult>
  byPlugin: Map<string, PluginResult>
}

/**
 * Stream processing progress
 */
export interface StreamProgress {
  pluginId: string
  file: string
  bytesProcessed: number
  totalBytes: number
  percentage: number
  currentChunk: number
  totalChunks: number
}

/**
 * File result for UI display
 */
export interface FileResult {
  path: string
  name: string
  size: number
  output?: FileOutput
  success: boolean
}

/**
 * HTML render result from plugin
 */
export interface PluginHTMLResult {
  render_type: 'html'
  content: string
  height?: number
  title?: string
}

/**
 * Extended plugin result with metadata for display
 */
export interface PluginResultWithMetadata extends PluginResult {
  pluginId?: string
  pluginName?: string
  pluginVersion?: string
}

//=============================================================================
// Tool ABI Types (Phase 4)
//=============================================================================

/**
 * Tool schema property (JSON Schema subset)
 */
export interface WasmToolSchemaProperty {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object'
  description?: string
  enum?: string[]
  items?: WasmToolSchemaProperty
  default?: unknown
}

/**
 * Tool parameter schema
 */
export interface WasmToolParameterSchema {
  type: 'object'
  properties: Record<string, WasmToolSchemaProperty>
  required?: string[]
}

/**
 * Tool schema returned by get_tool_schema()
 */
export interface WasmToolSchema {
  name: string
  description: string
  parameters: WasmToolParameterSchema
}

/**
 * Tool input passed to execute_tool()
 */
export interface WasmToolInput {
  args: Record<string, unknown>
  working_dir?: string
}

/**
 * Tool output returned by execute_tool()
 */
export interface WasmToolOutput {
  success: boolean
  result: string
  error?: string
}
