/**
 * File Format Registry — pluggable format handlers for read/write/edit tools.
 *
 * Each format registers a handler keyed by file extension.
 * Tools look up the handler for a given path and delegate to it.
 * New formats only need to implement the relevant handler interface
 * and call `registerFormatHandler()` — no tool changes required.
 *
 * UI handlers can also be registered via `registerFormatUI()` to declare
 * view modes and preview components for FilePreview / FileDiffViewer.
 *
 * Usage:
 *   import { registerFormatHandler, registerFormatUI } from './format-registry'
 *   import { nolHandler } from './formats/nol/handler'
 *   registerFormatHandler(nolHandler)
 */

// React types for UI handler interfaces (type-only, no runtime dependency)
import type { LazyExoticComponent } from 'react'
import type { VfsBackend } from './vfs-backend'

// ---------------------------------------------------------------------------
// Handler interfaces
// ---------------------------------------------------------------------------

/** Result returned by a format-specific read handler. */
export interface FormatReadResult {
  /** Human-readable text content for the LLM */
  content: string
  /** Kind label (e.g. 'nol', 'zip', 'docx') */
  kind: string
  /** Extra metadata to include in the tool response */
  metadata?: Record<string, unknown>
  /** Optional structured entries (e.g. ZIP file list) */
  entries?: Array<{ name: string; size: number; isText: boolean }>
}

/** Handler for reading a binary file format. */
export interface FormatReadHandler {
  /** File extension this handler supports (lowercase, no dot, e.g. 'nol') */
  extension: string
  /** Human-readable label */
  label: string
  /** Whether this handler needs the file to be read as binary (default: true) */
  binaryMode?: boolean
  /**
   * Short format hint explaining how to write/edit this format.
   * Included in tool responses (read/write/edit) so the LLM learns the format
   * on first encounter. Returned as a separate field, not mixed into content.
   */
  formatHint?: string
  /**
   * Read and render the file content as human-readable text.
   *
   * @param data - Raw file data (ArrayBuffer or Uint8Array)
   * @param path - Original file path (for context)
   * @returns Rendered text result
   */
  read(data: ArrayBuffer | Uint8Array, path: string): Promise<FormatReadResult>
}

/**
 * Combined format handler interface.
 * Handlers must implement read; write and edit are optional.
 */
export interface FormatHandler extends FormatReadHandler {
  /**
   * Optional: write structured content as a binary file.
   *
   * @param content - Text content from the LLM (may be JSON or structured text)
   * @param path - Target file path
   * @param context - Write context providing access to assets, etc.
   * @returns The binary data to write to disk
   */
  write?(content: string, path: string, context: FormatWriteContext): Promise<ArrayBuffer>
}

/**
 * Context provided to format write handlers.
 * Gives access to external resources (e.g. images in assets).
 */
export interface FormatWriteContext {
  /** Workspace ID for resolving assets */
  workspaceId?: string | null
  /**
   * Read a file from the assets directory.
   * Returns null if the file does not exist.
   */
  readAsset?(assetPath: string): Promise<Uint8Array | null>
  /**
   * Read a file from the workspace (OPFS or disk).
   * Returns null if the file does not exist.
   */
  readWorkspaceFile?(filePath: string): Promise<Uint8Array | null>
  /**
   * Read the original (pre-write) binary content of the file being written.
   * Returns null if the file does not exist yet (new file).
   * Format handlers use this to preserve embedded resources (e.g. images
   * inside a ZIP archive) when doing a read → edit → write round-trip.
   */
  readOriginalFile?(): Promise<Uint8Array | null>
}

// ---------------------------------------------------------------------------
// UI handler interfaces
// ---------------------------------------------------------------------------

/** A view mode that a format supports (e.g. 'preview', 'text'). */
export interface FormatViewMode {
  /** Mode ID: 'preview' for visual rendering, 'text' for Monaco editor */
  id: 'preview' | 'text' | string
  /** Button label shown in toolbar */
  label: string
  /** Whether this is the default mode */
  default?: boolean
}

/** Props passed to format preview components. */
export interface FormatPreviewProps {
  /** File binary data */
  blob: Blob
  /** File name */
  fileName: string
  /** File size in bytes */
  fileSize: number
}

/**
 * Format UI handler — registered by format directories to declare
 * how FilePreview / FileDiffViewer should render the format.
 *
 * If no UI handler is registered, the file is treated as plain text
 * or binary (based on FormatHandler.binaryMode).
 */
export interface FormatUIHandler {
  /** File extension (lowercase, no dot — must match FormatHandler.extension) */
  extension: string

  /**
   * Supported view modes.
   * - 1 mode: no toggle shown, render that mode directly
   * - 2+ modes: toolbar toggle rendered automatically
   */
  viewModes: FormatViewMode[]

  /**
   * Preview component for 'preview' mode (React lazy component).
   * Only needed if viewModes includes a 'preview'-like mode.
   */
  PreviewComponent?: LazyExoticComponent<FormatPreviewProps>

  /**
   * Render binary data as text for 'text' mode (Monaco editor + comments).
   * If omitted, falls back to FormatHandler.read().
   */
  renderTextContent?(data: Uint8Array, path: string): Promise<string>
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const handlers = new Map<string, FormatHandler>()
const uiHandlers = new Map<string, FormatUIHandler>()

/**
 * Register a format handler. Call this at module init time.
 */
export function registerFormatHandler(handler: FormatHandler): void {
  const ext = handler.extension.toLowerCase()
  if (handlers.has(ext)) {
    console.warn(`[FormatRegistry] Overwriting existing handler for ".${ext}"`)
  }
  handlers.set(ext, handler)
}

/**
 * Register a format UI handler. Called from format directories
 * to declare view modes and preview components.
 */
export function registerFormatUI(handler: FormatUIHandler): void {
  const ext = handler.extension.toLowerCase()
  uiHandlers.set(ext, handler)
}

/**
 * Look up a format handler by file path.
 * Returns null if no handler is registered for the file's extension.
 */
export function getFormatHandler(path: string): FormatHandler | null {
  const ext = path.split('.').pop()?.toLowerCase()
  if (!ext) return null
  return handlers.get(ext) ?? null
}

/**
 * Look up a format UI handler by file path.
 * Returns null if no UI handler is registered.
 */
export function getFormatUIHandler(path: string): FormatUIHandler | null {
  const ext = path.split('.').pop()?.toLowerCase()
  if (!ext) return null
  return uiHandlers.get(ext) ?? null
}

/**
 * Build a FormatWriteContext for use with FormatHandler.write().
 *
 * Extracts the duplicated context construction from write.tool.ts and
 * file-edit.tool.ts into a single factory function.
 *
 * @param backend - The VFS backend to read the original file from
 * @param filePath - The file path on the backend
 * @param workspaceId - Optional workspace ID for resolving assets
 */
export async function buildFormatWriteContext(
  backend: VfsBackend,
  filePath: string,
  workspaceId?: string | null,
): Promise<FormatWriteContext> {
  const toUint8 = (content: ArrayBuffer | Uint8Array | string | Blob): Uint8Array | null => {
    if (content instanceof ArrayBuffer) return new Uint8Array(content)
    if (content instanceof Uint8Array) return content
    return null
  }

  return {
    workspaceId: workspaceId ?? undefined,
    readAsset: workspaceId
      ? async (assetPath: string): Promise<Uint8Array | null> => {
          try {
            const { AssetsBackend } = await import('./backends/assets-backend')
            const ab = new AssetsBackend(workspaceId)
            const result = await ab.readFile(assetPath, { encoding: 'binary' })
            const uint8 = toUint8(result.content)
            if (!uint8) {
              console.warn(`[buildFormatWriteContext] readAsset: unexpected content type for ${assetPath}:`, typeof result.content)
            }
            return uint8
          } catch (err) {
            console.warn(`[buildFormatWriteContext] readAsset failed for ${assetPath}:`, err)
            return null
          }
        }
      : undefined,
    readWorkspaceFile: async (fp: string): Promise<Uint8Array | null> => {
      try {
        const { resolveBackendAndPath } = await import('./backends/backend-resolver')
        const resolved = resolveBackendAndPath(fp, workspaceId)
        if (!resolved) return null
        const result = await resolved.backend.readFile(resolved.path, { encoding: 'binary' })
        return toUint8(result.content)
      } catch {
        return null
      }
    },
    readOriginalFile: async (): Promise<Uint8Array | null> => {
      try {
        const result = await backend.readFile(filePath, { encoding: 'binary' })
        return toUint8(result.content)
      } catch {
        return null
      }
    },
  }
}

/**
 * Check if a file path has a registered format handler.
 */
export function hasFormatHandler(path: string): boolean {
  return getFormatHandler(path) !== null
}

/**
 * Get all registered extensions (for diagnostics).
 */
export function getRegisteredExtensions(): string[] {
  return Array.from(handlers.keys())
}
