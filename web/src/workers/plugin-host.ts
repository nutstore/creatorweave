/**
 * Plugin Host - Host imports available to WASM plugins
 *
 * These functions are provided to WASM plugins as imports,
 * allowing them to interact with the host in a controlled manner.
 */

//=============================================================================
// Memory Management
//=============================================================================

/**
 * Allocate memory in WASM linear memory
 * Called by plugin via bfosa_allocate
 */
export function bfosa_allocate(_size: number): number {
  // This would be implemented by the actual WebAssembly.Memory
  // For now, return a placeholder
  // In production, this would be a proper allocator
  return 0
}

/**
 * Get current timestamp in milliseconds (Unix epoch)
 */
export function bfosa_get_timestamp(): number {
  return Date.now()
}

//=============================================================================
// Logging
//=============================================================================

/**
 * Log a message from the plugin
 * @param ptr - Pointer to message string in WASM memory
 * @param len - Length of the message
 */
export function bfosa_log(ptr: number, len: number): void {
  // This would read from WASM memory
  // For now, we can't access WASM memory from outside the worker
  // The worker implementation handles this differently
  console.log(`[Plugin] ${ptr}:${len}`)
}

//=============================================================================
// Version
//=============================================================================

/**
 * Get the BFOSA Plugin API version
 * Returns version as number (e.g., 20000 for "2.0.0")
 */
export function bfosa_get_version(): number {
  // Version 2.0.0 -> 20000
  return 2 * 10000
}

//=============================================================================
// Progress Reporting
//=============================================================================

/**
 * Report processing progress
 * @param current - Current progress (e.g., files processed)
 * @param total - Total target (e.g., total files)
 */
export function bfosa_report_progress(current: number, total: number): void {
  // Send progress message back to main thread
  postMessage({
    type: 'PROGRESS',
    payload: { current, total },
  })
}

//=============================================================================
// Streaming Support
//=============================================================================

/**
 * Stream chunk storage for active streaming operations
 */
let streamChunks: string[] = []
let streamActive = false

/**
 * Receive a chunk of streaming data
 * @param chunkPtr - Pointer to chunk data in WASM memory
 * @param chunkLen - Length of the chunk data
 */
export function bfosa_stream_chunk(chunkPtr: number, chunkLen: number): void {
  // This would read from WASM memory
  // For now, store the reference
  streamChunks.push(`chunk:${chunkPtr}:${chunkLen}`)
}

/**
 * Complete streaming and get all chunks
 * @returns Array of chunk data
 */
export function bfosa_stream_complete(): string[] {
  const chunks = [...streamChunks]
  streamChunks = []
  streamActive = false
  return chunks
}

/**
 * Start a new streaming session
 */
export function bfosa_stream_start(): void {
  streamChunks = []
  streamActive = true
}

/**
 * Check if streaming is active
 * @returns true if streaming
 */
export function bfosa_is_streaming(): boolean {
  return streamActive
}

//=============================================================================
// Host Import Object
//=============================================================================

/**
 * Collection of all host imports provided to WASM plugins
 * This is passed to WebAssembly.instantiate as the import object
 */
export const pluginHostImports = {
  bfosa_allocate,
  bfosa_get_timestamp,
  bfosa_log,
  bfosa_get_version,
  bfosa_report_progress,
  bfosa_stream_chunk,
  bfosa_stream_complete,
  bfosa_stream_start,
  bfosa_is_streaming,
}

//=============================================================================
// Helper Functions
//=============================================================================

/**
 * Create a new WebAssembly.Memory with specified size
 */
export function createWASMMemory(initialPages: number, maximumPages?: number): WebAssembly.Memory {
  return new WebAssembly.Memory({
    initial: initialPages,
    maximum: maximumPages ?? initialPages,
  })
}

/**
 * Create import object for WASM instantiation
 * Combines all host functions with memory reference
 */
export function createImportObject(memory: WebAssembly.Memory) {
  return {
    env: {
      memory,
      ...pluginHostImports,
    },
  }
}
