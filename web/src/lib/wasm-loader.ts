/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * FileAnalyzer instance type
 * Matches the generated TypeScript types from wasm-bindgen
 */
export interface FileAnalyzerInstance {
  add_file: (size: bigint) => void
  add_files: (sizes: BigUint64Array) => void
  get_total: () => bigint
  get_count: () => bigint
  get_average: () => number
  reset: () => void
  free: () => void
  [Symbol.dispose]?: () => void
}

/**
 * Promise that resolves when WASM module is loaded
 */
let wasmLoadPromise: Promise<void> | null = null

/**
 * Cached analyzer instance
 */
let cachedAnalyzer: FileAnalyzerInstance | null = null

/**
 * Wait for the WASM module to be loaded
 * The wasm-loader.js script loads it from /wasm/ and exposes it globally
 */
function waitForWasmModule(): Promise<any> {
  if (wasmLoadPromise) {
    return wasmLoadPromise
  }

  wasmLoadPromise = new Promise((resolve, reject) => {
    // Check if already loaded
    if ((window as any).BrowserFsAnalyzerWasm) {
      resolve((window as any).BrowserFsAnalyzerWasm)
      return
    }

    // Wait for the wasm-ready event
    window.addEventListener(
      'wasm-ready',
      () => {
        console.log('[WASM] Module loaded successfully')
        resolve((window as any).BrowserFsAnalyzerWasm)
      },
      { once: true }
    )

    // Also listen for errors
    window.addEventListener(
      'wasm-error',
      (e: any) => {
        console.error('[WASM] Load failed:', e.detail)
        reject(new Error(`WASM load failed: ${e.detail?.message || 'Unknown error'}`))
      },
      { once: true }
    )

    // Timeout after 10 seconds
    setTimeout(() => {
      if (!(window as any).BrowserFsAnalyzerWasm) {
        reject(new Error('WASM module load timeout'))
      }
    }, 10000)
  })

  return wasmLoadPromise
}

/**
 * Load and initialize the WASM FileAnalyzer
 * @returns Promise<FileAnalyzerInstance>
 * @throws Error if WASM module fails to load
 */
export async function loadAnalyzer(): Promise<FileAnalyzerInstance> {
  // Return cached instance if available
  if (cachedAnalyzer) {
    return cachedAnalyzer
  }

  try {
    console.log('[WASM] Loading module...')

    // Wait for WASM module to be loaded
    const mod = await waitForWasmModule()

    console.log('[WASM] Module loaded, initializing...')

    // Initialize WASM module
    // The WASM JS file uses import.meta.url to locate the .wasm file
    // By default it will look for browser_fs_analyzer_wasm_bg.wasm relative to the JS file
    await mod.default()

    console.log('[WASM] Initialized, creating FileAnalyzer...')

    // Create the analyzer instance
    const analyzer = new mod.FileAnalyzer()

    // Cache the instance
    cachedAnalyzer = analyzer

    console.log('[WASM] FileAnalyzer ready!')

    return analyzer
  } catch (error) {
    console.error('[WASM] Load error:', error)
    throw new Error(
      `Failed to load WASM module: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
  }
}

/**
 * Reset the cached analyzer instance
 * Mainly used for testing and state reset
 */
export function resetCachedAnalyzer(): void {
  if (cachedAnalyzer) {
    try {
      cachedAnalyzer.free()
    } catch {
      // Ignore cleanup errors
    }
    cachedAnalyzer = null
  }
}

/**
 * Check if WASM is supported in the current browser
 * @returns true if WebAssembly is supported
 */
export function isWasmSupported(): boolean {
  return typeof WebAssembly === 'object' && typeof WebAssembly.instantiate === 'function'
}
