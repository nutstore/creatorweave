// @ts-nocheck - Worker file with dynamic imports cannot be fully typed
/**
 * Pyodide Worker - Runs Python code in a separate thread using Pyodide
 *
 * Features:
 * - Lazy loads Pyodide from local bundle on first use
 * - Mounts native directories using mountNativeFS
 * - Automatic package loading via loadPackagesFromImports
 * - Captures stdout/stderr for print output
 * - Handles matplotlib image output
 * - Supports file input/output from /mnt
 */

//=============================================================================
// Constants
//=============================================================================

/** Default execution timeout in milliseconds */
const DEFAULT_TIMEOUT = 30000

//=============================================================================
// Type Definitions
//=============================================================================

/**
 * @typedef {Object} FileRef
 * @property {string} name
 * @property {ArrayBuffer} content
 */

/**
 * @typedef {Object} ImageOutput
 * @property {string} filename
 * @property {string} data - base64
 */

/**
 * @typedef {Object} ExecuteResult
 * @property {boolean} success
 * @property {unknown} [result]
 * @property {string} [stdout]
 * @property {string} [stderr]
 * @property {ImageOutput[]} [images]
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

/** @type {FileSystemDirectoryHandle | null} Currently mounted directory handle (to detect workspace switches) */
let mountedDirHandle = null

/** @type {any} NativeFS handle for /mnt_assets syncing */
let nativefsAssets = null

/** @type {FileSystemDirectoryHandle | null} Currently mounted assets directory handle */
let mountedAssetsDirHandle = null

/** @type {Promise<void>} Serialize mount/unmount operations to avoid /mnt races */
let fsOpQueue = Promise.resolve()

// Stdout/stderr capture
/** @type {string[]} */
let stdoutBuffer = []
/** @type {string[]} */
let stderrBuffer = []

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

    // Build local index URL (respects Vite BASE_URL for sub-path deployments)
    const baseUrl = import.meta.env.BASE_URL || '/'
    const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
    const localIndexURL = new URL(`assets/pyodide/`, self.location.origin + normalizedBaseUrl).toString()
    console.log('[Pyodide Worker] Initializing with local indexURL:', localIndexURL)
    const instance = await loadPyodide({ indexURL: localIndexURL })

    // Set up stdout/stderr capture
    instance.setStdout({
      batched: (text) => {
        stdoutBuffer.push(text)
      }
    })
    instance.setStderr({
      batched: (text) => {
        stderrBuffer.push(text)
      }
    })

    return instance
  })()

  return pyodideReadyPromise
}

/**
 * Convert ArrayBuffer to base64 efficiently (without spread operator)
 * @param {ArrayBuffer} buffer
 * @returns {string}
 */
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const len = bytes.byteLength
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

/**
 * Send response message to main thread
 * @param {string} id
 * @param {boolean} success
 * @param {object} result
 */
function sendResponse(id, success, result) {
  self.postMessage({ id, success, result })
}

/**
 * Send error response to main thread
 * @param {string} id
 * @param {string} errorMessage
 */
function sendError(id, errorMessage) {
  console.error('[Pyodide Worker] Operation failed:', errorMessage)
  sendResponse(id, false, { success: false, error: errorMessage })
}

/**
 * Run filesystem mount-point mutations sequentially to avoid race conditions.
 * @template T
 * @param {() => Promise<T>} operation
 * @returns {Promise<T>}
 */
async function runExclusiveFSOperation(operation) {
  let release
  const next = new Promise((resolve) => {
    release = resolve
  })
  const previous = fsOpQueue
  fsOpQueue = next
  await previous
  try {
    return await operation()
  } finally {
    release()
  }
}

/**
 * Cleanup nativefs references (no sync - caller handles sync if needed)
 */
async function cleanupNativeFS() {
  if (!nativefs) return
  nativefs = null
  mountedDirHandle = null
}

/**
 * Cleanup nativefsAssets references
 */
async function cleanupAssetsFS() {
  if (!nativefsAssets) return
  nativefsAssets = null
  mountedAssetsDirHandle = null
}

/**
 * Unmount and remove /mnt directory completely
 */
async function unmountAndRemoveMnt() {
  if (!pyodide) return

  // Cleanup nativefs first
  await cleanupNativeFS()

  // Unmount /mnt first (idempotent: ignore "not mounted" failures)
  try {
    pyodide.FS.unmount('/mnt')
    console.log('[Pyodide Worker] Unmounted /mnt')
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.warn('[Pyodide Worker] Unmount skipped/failed:', msg)
  }

  // Remove /mnt and all child entries if it exists
  try {
    const mntPath = pyodide.FS.analyzePath('/mnt')
    if (mntPath.exists) {
      rmrf('/mnt')
      console.log('[Pyodide Worker] Removed /mnt directory')
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.warn('[Pyodide Worker] Directory removal failed:', msg)
  }
}

/**
 * Recursively remove all entries under a path, then remove the directory itself.
 * @param {string} path
 */
function rmrf(path) {
  try {
    const stat = pyodide.FS.stat(path)
    if (!pyodide.FS.isDir(stat.mode)) {
      try { pyodide.FS.unlink(path) } catch {}
      return
    }
  } catch {
    return
  }

  try {
    const entries = pyodide.FS.readdir(path).filter((e) => e !== '.' && e !== '..')
    for (const entry of entries) {
      rmrf(`${path}/${entry}`)
    }
  } catch {}

  try { pyodide.FS.rmdir(path) } catch {}
}

/**
 * Unmount and remove /mnt_assets directory completely (internal, no mutex).
 * Caller must hold runExclusiveFSOperation if needed.
 */
async function unmountAndRemoveMntAssetsRaw() {
  if (!pyodide) return

  await cleanupAssetsFS()

  try {
    pyodide.FS.unmount('/mnt_assets')
    console.log('[Pyodide Worker] Unmounted /mnt_assets')
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.warn('[Pyodide Worker] /mnt_assets unmount skipped/failed:', msg)
  }

  try {
    const mntAssetsPath = pyodide.FS.analyzePath('/mnt_assets')
    if (mntAssetsPath.exists) {
      rmrf('/mnt_assets')
      console.log('[Pyodide Worker] Removed /mnt_assets directory')
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.warn('[Pyodide Worker] /mnt_assets directory removal failed:', msg)
  }
}

/**
 * Mount assets directory handle to /mnt_assets using mountNativeFS.
 * Remounts only when the handle changes; uses syncfs(true) for same-handle refresh.
 * @param {FileSystemDirectoryHandle} dirHandle - Assets directory to mount
 */
async function ensureAssetsMounted(dirHandle) {
  return runExclusiveFSOperation(async () => {
    if (!pyodide) {
      throw new Error('Pyodide not initialized. Call initPyodide() first.')
    }

    // Check if the same handle is already mounted
    const sameHandle = mountedAssetsDirHandle && mountedAssetsDirHandle.isSameEntry
      ? await mountedAssetsDirHandle.isSameEntry(dirHandle)
      : false

    if (nativefsAssets && sameHandle) {
      try {
        await new Promise((resolve, reject) => {
          pyodide.FS.syncfs(true, (err) => {
            if (err) reject(err)
            else resolve(undefined)
          })
        })
        console.log('[Pyodide Worker] /mnt_assets refreshed via syncfs')
        return
      } catch {
        console.warn('[Pyodide Worker] /mnt_assets syncfs failed, falling back to remount')
      }
    }

    console.log('[Pyodide Worker] Mounting assets directory:', dirHandle.name)

    // Clean up stale mount
    await unmountAndRemoveMntAssetsRaw()

    // Create /mnt_assets mount point
    if (!pyodide.FS.analyzePath('/mnt_assets').exists) {
      pyodide.FS.mkdir('/mnt_assets')
    }

    try {
      nativefsAssets = await pyodide.mountNativeFS('/mnt_assets', dirHandle)
      mountedAssetsDirHandle = dirHandle
      console.log(`[Pyodide Worker] Assets directory "${dirHandle.name}" mounted at /mnt_assets`)
    } catch (mountError) {
      const mountMsg = mountError instanceof Error ? mountError.message : String(mountError)
      if (mountMsg.includes('already a file system mount point')) {
        console.warn('[Pyodide Worker] Detected stale /mnt_assets mount point, retrying')
        await unmountAndRemoveMntAssetsRaw()
        if (!pyodide.FS.analyzePath('/mnt_assets').exists) {
          pyodide.FS.mkdir('/mnt_assets')
        }
        nativefsAssets = await pyodide.mountNativeFS('/mnt_assets', dirHandle)
        mountedAssetsDirHandle = dirHandle
        console.log(`[Pyodide Worker] Assets directory "${dirHandle.name}" mounted at /mnt_assets (retry)`)
      } else {
        console.error('[Pyodide Worker] /mnt_assets mount failed:', mountMsg)
        throw mountError
      }
    }
  })
}

/**
 * Populate /mnt from OPFS using FS.syncfs(true).
 * This refreshes the PROXYFS cache to reflect external OPFS changes
 * (e.g. files written by agent tools on the main thread)
 * without the overhead of a full unmount + remount cycle.
 */
async function syncFromOPFS() {
  return runExclusiveFSOperation(async () => {
    if (!pyodide || !nativefs) return
    try {
      await new Promise((resolve, reject) => {
        pyodide.FS.syncfs(true, (err) => {
          if (err) reject(err)
          else resolve(undefined)
        })
      })
      console.log('[Pyodide Worker] syncfs(true) populated from OPFS')
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      console.warn('[Pyodide Worker] syncfs(true) failed:', msg)
      throw error
    }
  })
}

/**
 * Mount directory handle to /mnt using mountNativeFS.
 * Only mounts on first call; subsequent calls use syncfs(true) to refresh.
 * @param {FileSystemDirectoryHandle} dirHandle - Directory to mount
 */
async function ensureMounted(dirHandle) {
  return runExclusiveFSOperation(async () => {
    // Validate pyodide is initialized
    if (!pyodide) {
      throw new Error('Pyodide not initialized. Call initPyodide() first.')
    }

    // Check if the same directory handle is already mounted
    const sameHandle = mountedDirHandle && mountedDirHandle.isSameEntry
      ? await mountedDirHandle.isSameEntry(dirHandle)
      : false

    // If already mounted with the same handle, just sync from OPFS to refresh cache
    if (nativefs && sameHandle) {
      try {
        await syncFromOPFS()
        return
      } catch {
        // syncfs failed, fall through to full remount
        console.warn('[Pyodide Worker] syncfs failed, falling back to remount')
      }
    }

    if (nativefs && !sameHandle) {
      console.log('[Pyodide Worker] Different workspace detected, switching mount')
    }

    console.log('[Pyodide Worker] Mounting directory:', dirHandle.name)

    // Clean up any stale mount
    await unmountAndRemoveMnt()

    // Create /mnt directory for mount point
    if (!pyodide.FS.analyzePath('/mnt').exists) {
      pyodide.FS.mkdir('/mnt')
    }

    // Mount using mountNativeFS
    try {
      nativefs = await pyodide.mountNativeFS('/mnt', dirHandle)
      mountedDirHandle = dirHandle
      console.log(`[Pyodide Worker] Directory "${dirHandle.name}" mounted at /mnt`)
    } catch (mountError) {
      const mountMsg = mountError instanceof Error ? mountError.message : String(mountError)
      if (mountMsg.includes('already a file system mount point')) {
        console.warn('[Pyodide Worker] Detected stale mount point, retrying mount once')
        await unmountAndRemoveMnt()
        if (!pyodide.FS.analyzePath('/mnt').exists) {
          pyodide.FS.mkdir('/mnt')
        }
        nativefs = await pyodide.mountNativeFS('/mnt', dirHandle)
        mountedDirHandle = dirHandle
        console.log(`[Pyodide Worker] Directory "${dirHandle.name}" mounted at /mnt (retry)`)
        return
      }
      console.error('[Pyodide Worker] Mount failed:', mountMsg)
      throw mountError
    }
  })
}

/**
 * Unmount directory and remove /mnt
 * Called when user releases the folder
 */
async function unmountDir() {
  return runExclusiveFSOperation(async () => {
    console.log('[Pyodide Worker] Unmounting directory and removing /mnt')
    await unmountAndRemoveMnt()
  })
}

/**
 * Capture and clear stdout/stderr buffers
 * @returns {{ stdout?: string, stderr?: string }}
 */
function captureOutput() {
  const stdout = stdoutBuffer.join('\n')
  const stderr = stderrBuffer.join('\n')
  stdoutBuffer = []
  stderrBuffer = []
  return {
    stdout: stdout || undefined,
    stderr: stderr || undefined,
  }
}

self.onmessage = (/** @type {MessageEvent<any>} */ e) => {
  // Queue all messages for serial execution to prevent concurrent access
  // to shared pyodide instance and /mnt filesystem
  const previous = messageQueue
  messageQueue = previous.then(() => handleMessage(e.data))
}

/**
 * Serial message queue - ensures only one message is processed at a time.
 * This prevents concurrent pyodide.runPythonAsync calls which would corrupt
 * shared state (global Python scope, /mnt filesystem, stdout/stderr buffers).
 */
let messageQueue = Promise.resolve()

/**
 * Handle a single message (called serially via messageQueue)
 */
async function handleMessage(/** @type {any} */ data) {
  const { id, type } = data

  // Handle 'mount' type - mount a directory to /mnt
  if (type === 'mount') {
    try {
      if (!pyodide) {
        pyodide = await initPyodide()
      }
      await ensureMounted(data.dirHandle)
      sendResponse(id, true, { success: true })
    } catch (error) {
      sendError(id, error instanceof Error ? error.message : String(error))
    }
    return
  }

  // Handle 'sync' type - sync changes back to native filesystem
  if (type === 'sync') {
    try {
      if (nativefs) {
        await nativefs.syncfs()
        console.log('[Pyodide Worker] Filesystem synced successfully')
        sendResponse(id, true, { success: true })
      } else {
        sendError(id, 'No mounted filesystem to sync')
      }
    } catch (error) {
      sendError(id, error instanceof Error ? error.message : String(error))
    }
    return
  }

  // Handle 'unmount' type - cleanup filesystem and remove /mnt
  if (type === 'unmount') {
    try {
      await unmountDir()
      await runExclusiveFSOperation(() => unmountAndRemoveMntAssetsRaw())
      console.log('[Pyodide Worker] Filesystem unmounted and /mnt, /mnt_assets removed')
      sendResponse(id, true, { success: true })
    } catch (error) {
      sendError(id, error instanceof Error ? error.message : String(error))
    }
    return
  }

  // Handle 'execute' type - run Python code
  const { code, files = [], timeout = DEFAULT_TIMEOUT, mountDir, assetsDir, syncFs = true } = data

  const startTime = performance.now()
  /** @type {number | undefined} */
  let timeoutId = undefined

  try {
    // Initialize Pyodide on first use
    if (!pyodide) {
      pyodide = await initPyodide()
    }

    // Handle mountDir if provided (mountNativeFS)
    if (mountDir) {
      await ensureMounted(mountDir)
    } else {
      // Ensure /mnt directory exists for regular file injection
      if (!pyodide.FS.analyzePath('/mnt').exists) {
        pyodide.FS.mkdir('/mnt')
      }

      // Inject files into /mnt
      if (files.length > 0) {
        for (const file of files) {
          const filePath = `/mnt/${file.name}`
          const data = new Uint8Array(file.content)
          pyodide.FS.writeFile(filePath, data)
        }
      }
    }

    // Handle assetsDir if provided — mount at /mnt_assets
    if (assetsDir) {
      await ensureAssetsMounted(assetsDir)
    }

    // Auto-load packages based on imports in the user code (includes matplotlib if needed)
    try {
      // Pre-load matplotlib only when code imports it (it's a large package)
      if (code.includes('matplotlib') || code.includes('pyplot')) {
        await pyodide.loadPackage('matplotlib')
      }
      await pyodide.loadPackagesFromImports(code)
    } catch (pkgError) {
      const pkgErrorMsg = pkgError instanceof Error ? pkgError.message : String(pkgError)
      // Extract package names from import statements for the hint
      const importMatches = code.match(/(?:^|\n)\s*(?:import|from)\s+([a-zA-Z_][a-zA-Z0-9_]*)/g)
      const packages = (importMatches || [])
        .map(m => m.replace(/.*?(?:import|from)\s+/, '').trim())
        .filter(p => !['os', 'sys', 'io', 'json', 'math', 're', 'pathlib', 'datetime', 'collections', 'itertools', 'functools', 'typing', 'dataclasses', 'abc', 'copy', 'base64', 'hashlib', 'hmac', 'struct', 'textwrap', 'string', 'random', 'statistics', 'fractions', 'decimal', 'csv', 'enum', 'logging', 'contextlib', 'unittest', 'time', 'traceback', 'inspect', 'importlib', 'warnings', 'tempfile', 'shutil', 'glob', 'fnmatch', 'operator', 'heapq', 'bisect', 'array', 'queue', 'threading', 'multiprocessing', 'socket', 'http', 'urllib', 'email', 'html', 'xml', 'configparser', 'argparse', 'subprocess', 'signal'].includes(p))

      const hint = packages.length > 0
        ? `\n\nTip: Try installing the missing package(s) with micropip before importing:\nimport micropip\nawait micropip.install('${packages.join("', '")}')\nThen retry the import.`
        : `\n\nTip: Try installing the missing package with micropip:\nimport micropip\nawait micropip.install('package_name')`

      throw new Error(pkgErrorMsg + hint)
    }

    // Execute code with timeout (properly cleanup timeout)
    const executePromise = pyodide.runPythonAsync(code)
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error(`Execution timeout after ${timeout}ms`)), timeout)
    })
    const result = await Promise.race([executePromise, timeoutPromise])

    const executionTime = performance.now() - startTime

    // Check if result is an error
    if (result && typeof result === 'object' && 'error' in result) {
      throw new Error(`${result.error}\n\n${result.traceback}`)
    }

    // Sync changes back to native filesystem if requested
    if (syncFs && nativefs) {
      await nativefs.syncfs()
      console.log('[Pyodide Worker] Synced changes back to native filesystem')
    }

    // Sync assets changes back if assets were mounted
    if (syncFs && nativefsAssets) {
      await nativefsAssets.syncfs()
      console.log('[Pyodide Worker] Synced assets changes back to native filesystem')
    }

    // Collect matplotlib images
    const images = await collectMatplotlibImages(pyodide)

    // Get captured output and clear buffers
    const output = captureOutput()

    sendResponse(id, true, {
      success: true,
      result,
      images: images.length > 0 ? images : undefined,
      executionTime,
      ...output,
    })
  } catch (error) {
    const executionTime = performance.now() - startTime
    const errorMessage = error instanceof Error ? error.message : String(error)

    // Capture output before clearing (for error context)
    const output = captureOutput()

    sendResponse(id, true, {
      success: false,
      executionTime,
      error: errorMessage,
      ...output,
    })
  } finally {
    // Always cleanup timeout
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId)
    }
  }
}

//=============================================================================
// Image Collection
//=============================================================================

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
          const base64 = arrayBufferToBase64(data)
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
