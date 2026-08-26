/**
 * Python/Pyodide Type Definitions
 *
 * Core types for Python execution and file system bridging
 */

/**
 * File reference - represents a file from the user's filesystem
 * Can come from File System API handle or OPFS
 */
export interface FileRef {
  /** File path relative to project root */
  path: string
  /** File name */
  name: string
  /** File content (text or binary) */
  content: string | ArrayBuffer | Uint8Array
  /** Content type */
  contentType: 'text' | 'binary'
  /** File size in bytes */
  size: number
  /** Optional: source type */
  source?: 'filesystem' | 'opfs'
}

/**
 * Pyodide FS file metadata
 */
export interface PyodideFileMeta {
  /** File path in Pyodide FS */
  path: string
  /** File size in bytes */
  size: number
  /** Modification time */
  mtime: number
  /** File type */
  type: 'file' | 'directory'
}

/**
 * File bridge result
 */
export interface BridgeResult {
  /** Number of files successfully bridged */
  success: number
  /** Number of files that failed */
  failed: number
  /** Error messages if any */
  errors: Array<{ path: string; error: string }>
}

/**
 * Pyodide instance (minimal type)
 */
export interface PyodideInstance {
  /** Pyodide filesystem API */
  FS: {
    writeFile(path: string, data: string | Uint8Array): void
    readFile(path: string, encoding?: string): string | Uint8Array
    readdir(path: string): string[]
    stat(path: string): { mode: number; size: number; mtime: number }
    unlink(path: string): void
    mkdir(path: string): void
    rmdir(path: string): void
    exists(path: string): boolean
  }
  /** Python namespace */
  globals: {
    get(path: string): unknown
    set(path: string, value: unknown): void
  }
  /** Run Python code */
  runPython(code: string): unknown
}
