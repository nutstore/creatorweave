// @ts-nocheck - Worker file with dynamic imports cannot be fully typed
/**
 * Pyodide Worker - Runs Python code in a separate thread using Pyodide
 *
 * Features:
 * - Lazy loads Pyodide from local bundle on first use
 * - Creates /mnt directory for file operations
 * - Lazy mounts native directories (no full traversal on mount)
 * - Incremental sync (only sync modified files)
 * - Automatic package loading via loadPackagesFromImports
 * - Captures stdout/stderr for print output
 * - Handles matplotlib image output
 * - Supports file input/output from /mnt
 */

//=============================================================================
// Type Definitions
//=============================================================================

/**
 * @typedef {Object} FileRef
 * @property {string} name
 * @property {ArrayBuffer} content
 */

/**
 * @typedef {Object} FileOutput
 * @property {string} name
 * @property {ArrayBuffer} content
 */

/**
 * @typedef {Object} ImageOutput
 * @property {string} filename
 * @property {string} data - base64
 */

/**
 * @typedef {Object} MountRequest
 * @property {string} id
 * @property {'mount'} type
 * @property {FileSystemDirectoryHandle} dirHandle
 */

/**
 * @typedef {Object} SyncRequest
 * @property {string} id
 * @property {'sync'} type
 */

/**
 * @typedef {Object} ExecuteResult
 * @property {boolean} success
 * @property {unknown} [result]
 * @property {string} [stdout]
 * @property {string} [stderr]
 * @property {ImageOutput[]} [images]
 * @property {FileOutput[]} [outputFiles]
 * @property {number} executionTime
 * @property {string} [error]
 */

//=============================================================================
// Worker State
//=============================================================================

/** @type {any} */
let pyodide = null

/** @type {Promise<any>} */
let pyodideReadyPromise = null

/** @type {any} NativeFS handle for syncing changes back */
let nativefs = null

/** @type {LazyPyodideFS | null} Lazy filesystem instance */
let lazyFS = null

// Stdout/stderr capture
/** @type {string[]} */
let stdoutBuffer = []
/** @type {string[]} */
let stderrBuffer = []

//=============================================================================
// Lazy Loading Filesystem Implementation
//=============================================================================

/**
 * Lazy file entry with metadata
 * @typedef {Object} LazyFileEntry
 * @property {Uint8Array} data - File content
 * @property {Date} mtime - Last modified time
 * @property {boolean} dirty - Whether file has been modified
 */

/**
 * Lazy loading filesystem - loads files on-demand instead of full traversal
 */
class LazyPyodideFS {
  constructor(pyodide) {
    /** @type {any} */
    this.pyodide = pyodide
    /** @type {FileSystemDirectoryHandle | null} */
    this.dirHandle = null
    /** @type {Map<string, LazyFileEntry>} */
    this.fileCache = new Map()
    /** @type {Set<string>} */
    this.dirtyPaths = new Set()
    /** @type {Map<string, string[]>} */
    this.dirCache = new Map()
    /** @type {string} */
    this.mountpoint = '/mnt'
  }

  /**
   * Mount directory (lazy - no file traversal)
   * @param {FileSystemDirectoryHandle} dirHandle
   */
  async mount(dirHandle) {
    this.dirHandle = dirHandle
    this.fileCache.clear()
    this.dirtyPaths.clear()
    this.dirCache.clear()

    // Clean up existing mount
    if (this.pyodide.FS.analyzePath(this.mountpoint).exists) {
      try {
        this.pyodide.FS.rmdir(this.mountpoint)
      } catch {
        // Ignore if directory has contents
      }
    }

    // Create mountpoint directory
    this.pyodide.FS.mkdir(this.mountpoint)

    console.log(`[LazyFS] Mounted ${dirHandle.name} (lazy mode, no file traversal)`)
  }

  /**
   * Check if a path exists in the mounted directory
   * @param {string} relPath
   * @returns {Promise<boolean>}
   */
  async exists(relPath) {
    try {
      await this.getFileHandle(relPath)
      return true
    } catch {
      return false
    }
  }

  /**
   * Read file content (lazy load)
   * @param {string} relPath - Relative path from mountpoint
   * @returns {Promise<Uint8Array>}
   */
  async readFile(relPath) {
    // Check cache first
    const cached = this.fileCache.get(relPath)
    if (cached) {
      return cached.data
    }

    // Cache miss - load from browser directory
    const handle = await this.getFileHandle(relPath)
    const file = await handle.getFile()
    const data = new Uint8Array(await file.arrayBuffer())

    // Cache the file
    this.fileCache.set(relPath, {
      data,
      mtime: new Date(file.lastModified),
      dirty: false,
    })

    return data
  }

  /**
   * Write file (marks as dirty for sync)
   * @param {string} relPath - Relative path from mountpoint
   * @param {Uint8Array} data
   */
  async writeFile(relPath, data) {
    const absPath = this.mountpoint + '/' + relPath

    // Write to MEMFS
    this.pyodide.FS.writeFile(absPath, data)

    // Update cache and mark dirty
    this.fileCache.set(relPath, {
      data,
      mtime: new Date(),
      dirty: true,
    })
    this.dirtyPaths.add(relPath)
  }

  /**
   * Sync only modified files back to browser directory
   * @returns {Promise<number>} Number of files synced
   */
  async sync() {
    if (!this.dirHandle) {
      throw new Error('No directory mounted')
    }

    if (this.dirtyPaths.size === 0) {
      console.log('[LazyFS] No files to sync')
      return 0
    }

    let synced = 0
    for (const relPath of this.dirtyPaths) {
      const entry = this.fileCache.get(relPath)
      if (!entry) continue

      try {
        // Create parent directories if needed
        await this.ensureParentDirs(relPath)

        // Get or create file handle
        const handle = await this.dirHandle.getFileHandle(relPath, { create: true })
        const writable = await handle.createWritable()
        await writable.write(entry.data)
        await writable.close()

        // Update mtime in cache
        entry.mtime = new Date()
        entry.dirty = false
        this.dirtyPaths.delete(relPath)

        synced++
        console.log(`[LazyFS] Synced: ${relPath}`)
      } catch (error) {
        console.error(`[LazyFS] Failed to sync ${relPath}:`, error)
      }
    }

    console.log(`[LazyFS] Synced ${synced} file(s)`)
    return synced
  }

  /**
   * List directory contents (lazy load)
   * @param {string} relPath - Relative path from mountpoint
   * @returns {Promise<string[]>}
   */
  async readdir(relPath) {
    // Check cache first
    const cached = this.dirCache.get(relPath)
    if (cached) {
      return cached
    }

    // Not in cache - load from browser directory
    const handle = await this.getDirectoryHandle(relPath)
    const entries: string[] = []

    for await (const entry of handle.values()) {
      entries.push(entry.name)
    }

    // Cache the result
    this.dirCache.set(relPath, entries)
    return entries
  }

  /**
   * Get file handle from relative path
   * @param {string} relPath
   * @returns {Promise<FileSystemFileHandle>}
   */
  async getFileHandle(relPath) {
    if (!this.dirHandle) {
      throw new Error('No directory mounted')
    }

    const parts = relPath.split('/').filter(Boolean)
    let handle = this.dirHandle

    for (const part of parts) {
      try {
        if (handle.kind === 'directory') {
          handle = await handle.getFileHandle(part)
        } else {
          throw new Error(`'${part}' is not a directory`)
        }
      } catch {
        throw new Error(`File not found: ${relPath}`)
      }
    }

    if (handle.kind !== 'file') {
      throw new Error(`'${relPath}' is a directory, not a file`)
    }

    return handle
  }

  /**
   * Get directory handle from relative path
   * @param {string} relPath
   * @returns {Promise<FileSystemDirectoryHandle>}
   */
  async getDirectoryHandle(relPath) {
    if (!this.dirHandle) {
      throw new Error('No directory mounted')
    }

    if (relPath === '.' || relPath === '') {
      return this.dirHandle
    }

    const parts = relPath.split('/').filter(Boolean)
    let handle = this.dirHandle

    for (const part of parts) {
      try {
        if (handle.kind === 'directory') {
          handle = await handle.getDirectoryHandle(part)
        } else {
          throw new Error(`'${part}' is not a directory`)
        }
      } catch {
        throw new Error(`Directory not found: ${relPath}`)
      }
    }

    return handle
  }

  /**
   * Ensure parent directories exist for a file path
   * @param {string} relPath
   */
  async ensureParentDirs(relPath) {
    const parts = relPath.split('/').filter(Boolean)
    if (parts.length <= 1) return

    const parentParts = parts.slice(0, -1)
    let handle = this.dirHandle!

    for (const part of parentParts) {
      try {
        handle = await handle.getDirectoryHandle(part)
      } catch {
        handle = await handle.getDirectoryHandle(part)
        handle = await handle.getDirectoryHandle(part)
      }
    }
  }

  /**
   * Check if there are pending changes to sync
   * @returns {boolean}
   */
  hasPendingChanges() {
    return this.dirtyPaths.size > 0
  }

  /**
   * Get count of pending files to sync
   * @returns {number}
   */
  getPendingCount() {
    return this.dirtyPaths.size
  }

  /**
   * Unmount and cleanup
   */
  unmount() {
    this.dirHandle = null
    this.fileCache.clear()
    this.dirtyPaths.clear()
    this.dirCache.clear()
    console.log('[LazyFS] Unmounted')
  }
}

//=============================================================================
// Message Handler
//=============================================================================

/**
 * Initialize Pyodide dynamically (works with classic workers)
 */
async function initPyodide() {
  if (pyodideReadyPromise) return pyodideReadyPromise

  pyodideReadyPromise = (async () => {
    // Dynamic import for classic worker compatibility
    const { loadPyodide } = await import('pyodide')

    // Use CDN in development, local files in production
    const isDev = import.meta.env?.DEV ?? false
    const indexURL = isDev ? 'https://cdn.jsdelivr.net/pyodide/v0.29.3/full/' : '/assets/pyodide'

    return loadPyodide({
      indexURL,
    })
  })()

  return pyodideReadyPromise
}

self.onmessage = async (/** @type {MessageEvent<any>} */ e) => {
  const { id, type } = e.data

  // Handle 'mount' type - mount a directory to /mnt
  if (type === 'mount') {
    await handleMount(id, e.data.dirHandle)
    return
  }

  // Handle 'sync' type - sync changes back to native filesystem
  if (type === 'sync') {
    await handleSync(id)
    return
  }

  // Handle 'unmount' type - cleanup filesystem
  if (type === 'unmount') {
    await handleUnmount(id)
    return
  }

  // Handle 'execute' type - run Python code
  const { code, files = [], timeout = 30000, mountDir, syncFs } = e.data

  const startTime = performance.now()

  try {
    // Initialize Pyodide on first use
    if (!pyodide) {
      pyodide = await initPyodide()
    }

    // Handle mountDir if provided (mountNativeFS)
    if (mountDir) {
      await handleMountInternal(mountDir)
    } else {
      // Ensure /mnt directory exists for regular file injection
      if (!pyodide.FS.analyzePath('/mnt').exists) {
        pyodide.FS.mkdir('/mnt')
      }

      // Inject files into /mnt
      await injectFiles(files, pyodide)
    }

    // Load matplotlib first (it's imported in the wrapper code)
    await pyodide.loadPackage('matplotlib')

    // Auto-load packages based on imports in the user code
    await pyodide.loadPackagesFromImports(code)

    // Execute code with timeout
    const result = await executeWithTimeout(pyodide, code, timeout)

    const executionTime = performance.now() - startTime

    // Sync changes back to native filesystem if requested
    if (syncFs) {
      if (lazyFS && lazyFS.hasPendingChanges()) {
        const synced = await lazyFS.sync()
        console.log(`[Pyodide Worker] Synced ${synced} file(s) to native filesystem`)
      } else if (nativefs) {
        // Legacy nativefs sync
        await nativefs.syncfs()
        console.log('[Pyodide Worker] Synced changes back to native filesystem')
      }
    }

    // Collect matplotlib images
    const images = await collectMatplotlibImages(pyodide)

    // Get captured output
    const stdout = stdoutBuffer.join('\n')
    const stderr = stderrBuffer.join('\n')

    // Clear buffers
    stdoutBuffer = []
    stderrBuffer = []

    sendResponse(id, {
      success: true,
      result: {
        success: true,
        result,
        stdout: stdout || undefined,
        stderr: stderr || undefined,
        images: images.length > 0 ? images : undefined,
        executionTime,
      },
    })
  } catch (error) {
    const executionTime = performance.now() - startTime
    const errorMessage = error instanceof Error ? error.message : String(error)

    sendResponse(id, {
      success: true,
      result: {
        success: false,
        executionTime,
        error: errorMessage,
      },
    })
  }
}

//=============================================================================
// Native Directory Mounting (mountNativeFS)
//=============================================================================

/**
 * Handle mount request from main thread
 * @param {string} id - Request ID for response
 * @param {FileSystemDirectoryHandle} dirHandle - Directory handle to mount
 */
async function handleMount(id, dirHandle) {
  try {
    await handleMountInternal(dirHandle)
    self.postMessage({
      id,
      success: true,
      result: { success: true },
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error('[Pyodide Worker] Mount failed:', errorMessage)
    self.postMessage({
      id,
      success: false,
      result: { success: false, error: errorMessage },
    })
  }
}

/**
 * Internal mount implementation - uses lazy loading
 * @param {FileSystemDirectoryHandle} dirHandle
 */
async function handleMountInternal(dirHandle) {
  // Initialize Pyodide if needed
  if (!pyodide) {
    pyodide = await initPyodide()
  }

  // Check if File System Access API is available
  if (typeof window.showDirectoryPicker !== 'function') {
    throw new Error('File System Access API is not supported')
  }

  // Initialize lazy filesystem
  if (!lazyFS) {
    lazyFS = new LazyPyodideFS(pyodide)
  }

  // Mount with lazy loading (no file traversal)
  await lazyFS.mount(dirHandle)

  // Clear nativefs since we're using lazyFS now
  nativefs = null

  console.log(`[Pyodide Worker] Directory mounted successfully (lazy mode)`)
}

/**
 * Handle sync request from main thread - sync only modified files
 * @param {string} id - Request ID for response
 */
async function handleSync(id) {
  try {
    // Try lazyFS first, fallback to nativefs
    if (lazyFS && lazyFS.hasPendingChanges()) {
      const synced = await lazyFS.sync()
      console.log(`[Pyodide Worker] Synced ${synced} file(s) to native filesystem`)
      self.postMessage({
        id,
        success: true,
        result: { success: true, synced },
      })
    } else if (nativefs) {
      // Legacy nativefs sync
      await nativefs.syncfs()
      console.log('[Pyodide Worker] Filesystem synced successfully')
      self.postMessage({
        id,
        success: true,
        result: { success: true },
      })
    } else {
      self.postMessage({
        id,
        success: false,
        result: { success: false, error: 'No mounted filesystem to sync' },
      })
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error('[Pyodide Worker] Sync failed:', errorMessage)
    self.postMessage({
      id,
      success: false,
      result: { success: false, error: errorMessage },
    })
  }
}

/**
 * Handle unmount request - cleanup lazy filesystem
 * @param {string} id - Request ID for response
 */
async function handleUnmount(id) {
  try {
    if (lazyFS) {
      lazyFS.unmount()
      lazyFS = null
    }
    nativefs = null
    console.log('[Pyodide Worker] Filesystem unmounted')
    self.postMessage({
      id,
      success: true,
      result: { success: true },
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error('[Pyodide Worker] Unmount failed:', errorMessage)
    self.postMessage({
      id,
      success: false,
      result: { success: false, error: errorMessage },
    })
  }
}

//=============================================================================
// File Operations
//=============================================================================

/**
 * Inject files into Pyodide /mnt directory
 * @param {FileRef[]} files
 * @param {any} pyodide
 * @returns {Promise<void>}
 */
async function injectFiles(files, pyodide) {
  if (files.length === 0) return

  console.log(
    '[Pyodide Worker] Injecting files:',
    files.map((f) => f.name)
  )

  for (const file of files) {
    try {
      const filePath = `/mnt/${file.name}`
      const data = new Uint8Array(file.content)
      pyodide.FS.writeFile(filePath, data)
      console.log(`[Pyodide Worker] Injected file: ${file.name} (${data.length} bytes)`)
    } catch (error) {
      console.error(`[Pyodide Worker] Failed to inject file ${file.name}:`, error)
      throw error
    }
  }
}

/**
 * Collect matplotlib images from /mnt and in-memory figures
 * @param {any} pyodide
 * @returns {Promise<ImageOutput[]>}
 */
async function collectMatplotlibImages(pyodide) {
  try {
    // Check /mnt for saved images
    const checkMntCode = `
import os
image_paths = []
if os.path.exists('/mnt'):
    for file in os.listdir('/mnt'):
        if file.endswith('.png') or file.endswith('.jpg') or file.endswith('.jpeg'):
            image_paths.append(f'/mnt/{file}')
image_paths
`

    /** @type {any} */
    const imagePaths = await pyodide.runPythonAsync(checkMntCode)

    /** @type {ImageOutput[]} */
    const images = []

    // Read saved image files from /mnt
    for (const imagePath of imagePaths) {
      if (String(imagePath).startsWith('/mnt/')) {
        const fileName = String(imagePath).split('/').pop()
        try {
          const data = pyodide.FS.readFile(imagePath)
          const base64 = btoa(String.fromCharCode(...new Uint8Array(data)))
          images.push({
            filename: fileName,
            data: base64,
          })
        } catch (error) {
          console.warn(`[Pyodide Worker] Failed to read image ${imagePath}:`, error)
        }
      }
    }

    // Try to collect in-memory matplotlib figures
    try {
      const figureCode = `
import io
import base64
import matplotlib.pyplot as plt

figure_data = []
if len(plt.get_fignums()) > 0:
    for i, fig_num in enumerate(plt.get_fignums()):
        fig = plt.figure(fig_num)
        buf = io.BytesIO()
        fig.savefig(buf, format='png', bbox_inches='tight')
        buf.seek(0)
        img_data = base64.b64encode(buf.read()).decode('utf-8')
        figure_data.append({'index': i, 'data': img_data})
    plt.close('all')
figure_data
`
      /** @type {any} */
      const figureData = await pyodide.runPythonAsync(figureCode)

      for (const fig of figureData) {
        images.push({
          filename: `figure_${fig.index}.png`,
          data: fig.data,
        })
      }
    } catch {
      // matplotlib not loaded or no figures
    }

    return images
  } catch (error) {
    console.warn('[Pyodide Worker] Failed to collect matplotlib images:', error)
    return []
  }
}

//=============================================================================
// Code Execution
//=============================================================================

/**
 * Execute Python code with timeout and stdout/stderr capture
 * @param {any} pyodide
 * @param {string} code
 * @param {number} timeout
 * @returns {Promise<unknown>}
 */
async function executeWithTimeout(pyodide, code, timeout) {
  // Create timeout promise
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`Execution timeout after ${timeout}ms`)), timeout)
  })

  // Execute code directly (stdout/stderr is captured by pyodide.runPythonAsync)
  const executePromise = pyodide.runPythonAsync(code)

  // Race between execution and timeout
  const result = await Promise.race([executePromise, timeoutPromise])

  // Check if result is an error
  if (result && typeof result === 'object' && 'error' in result) {
    throw new Error(`${result.error}\n\n${result.traceback}`)
  }

  return result
}

//=============================================================================
// Helper Functions
//=============================================================================

/**
 * Send response to main thread
 * @param {string} id
 * @param {Omit<{id: string}, 'id'>} response
 */
function sendResponse(id, response) {
  self.postMessage({
    id,
    ...response,
  })
}
