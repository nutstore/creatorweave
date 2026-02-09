// @ts-nocheck - Worker file with dynamic imports cannot be fully typed
/**
 * Pyodide Worker - Runs Python code in a separate thread using Pyodide
 *
 * Features:
 * - Lazy loads Pyodide from local bundle on first use
 * - Creates /mnt directory for file operations
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
 * @typedef {Object} ExecuteRequest
 * @property {string} id
 * @property {'execute'} type
 * @property {string} code
 * @property {FileRef[]} [files]
 * @property {number} [timeout]
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

    // Use CDN in development, local files in production
    const isDev = import.meta.env?.DEV ?? false
    const indexURL = isDev ? 'https://cdn.jsdelivr.net/pyodide/v0.29.3/full/' : '/assets/pyodide'

    return loadPyodide({
      indexURL,
    })
  })()

  return pyodideReadyPromise
}

self.onmessage = async (/** @type {MessageEvent<ExecuteRequest>} */ e) => {
  const { id, type, code, files = [], timeout = 30000 } = e.data

  if (type !== 'execute') {
    sendResponse(id, {
      success: false,
      result: {
        success: false,
        executionTime: 0,
        error: `Unknown message type: ${type}`,
      },
    })
    return
  }

  const startTime = performance.now()

  try {
    // Initialize Pyodide on first use
    if (!pyodide) {
      pyodide = await initPyodide()
    }

    // Ensure /mnt directory exists
    if (!pyodide.FS.analyzePath('/mnt').exists) {
      pyodide.FS.mkdir('/mnt')
    }

    // Auto-load packages based on imports in the code
    await pyodide.loadPackagesFromImports(code)

    // Inject files into /mnt
    await injectFiles(files, pyodide)

    // Execute code with timeout
    const result = await executeWithTimeout(pyodide, code, timeout)

    const executionTime = performance.now() - startTime

    // Collect output files
    const outputFiles = await collectOutputFiles(pyodide)

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
        outputFiles: outputFiles.length > 0 ? outputFiles : undefined,
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
 * Collect output files from /mnt directory
 * @param {any} pyodide
 * @returns {Promise<FileOutput[]>}
 */
async function collectOutputFiles(pyodide) {
  try {
    const fileNames = pyodide.FS.readdir('/mnt').filter(
      (/** @type {string} */ name) => name !== '.' && name !== '..'
    )

    /** @type {FileOutput[]} */
    const outputFiles = []

    for (const fileName of fileNames) {
      try {
        const filePath = `/mnt/${fileName}`
        const data = pyodide.FS.readFile(filePath)
        outputFiles.push({
          name: fileName,
          content: data.buffer,
        })
      } catch (error) {
        console.warn(`[Pyodide Worker] Failed to read output file ${fileName}:`, error)
      }
    }

    return outputFiles
  } catch (error) {
    console.warn('[Pyodide Worker] Failed to collect output files:', error)
    return []
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
  const wrapperCode = `
import sys
import io

# Capture output
sys.stdout = io.StringIO()
sys.stderr = io.StringIO()

try:
${code
  .split('\n')
  .map((line) => '    ' + line)
  .join('\n')}
except Exception as e:
    import traceback
    sys.__stdout__.write(traceback.format_exc())
    raise

# Get captured output
stdout_value = sys.stdout.getvalue()
stderr_value = sys.stderr.getvalue()

# Restore stdout/stderr
sys.stdout = sys.__stdout__
sys.stderr = sys.__stderr__

stdout_value
`

  // Create timeout promise
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`Execution timeout after ${timeout}ms`)), timeout)
  })

  // Execute code
  const executePromise = pyodide.runPythonAsync(wrapperCode)

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
