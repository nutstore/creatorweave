/**
 * VfsBridgeFs — Bridges just-bash's IFileSystem interface to creatorweave's VfsBackend.
 *
 * Uses a **hybrid** approach:
 * - System directories (/bin, /usr/bin, /home, /tmp, /dev, /proc) live in an
 *   in-memory Map (needed by just-bash's initFilesystem for command stubs,
 *   /dev/null, /proc/self/status, etc.).
 * - Everything under /workspace/<rootName>/... is delegated to the VfsBackend,
 *   which connects to the real OPFS + Native File System Access API stack.
 *
 * Path routing:
 *   /workspace/<rootName>/path/to/file → "<rootName>/path/to/file" → VfsBackend
 *   /workspace                          → "" (lists root directories)
 *   /bin, /home...                      → in-memory system map
 *
 * Data flow:
 *   just-bash command → IFileSystem method
 *     ├─ /workspace/<rootName>/... → VfsBackend → OPFS / Native FS
 *     └─ /bin, /home...            → in-memory system map
 */

import type { VfsBackend, VfsDirEntry } from './vfs-backend'

// ---------------------------------------------------------------------------
// Types from just-bash's IFileSystem interface (inlined to avoid import cost)
// ---------------------------------------------------------------------------

export interface FsStat {
  isFile: boolean
  isDirectory: boolean
  isSymbolicLink: boolean
  mode: number
  size: number
  mtime: Date
}

export interface DirentEntry {
  name: string
  isFile: boolean
  isDirectory: boolean
  isSymbolicLink: boolean
}

// ---------------------------------------------------------------------------
// Internal system filesystem entries
// ---------------------------------------------------------------------------

interface SysFile {
  type: 'file'
  content: Uint8Array
  mode: number
  mtime: Date
}

interface SysDir {
  type: 'directory'
  mode: number
  mtime: Date
}

type SysEntry = SysFile | SysDir

/** Absolute path prefix inside just-bash's virtual FS where we mount the workspace. */
const WORKSPACE_MOUNT = '/workspace'

/** Mount point for assets (user-uploaded / agent-generated files). */
const ASSETS_MOUNT = '/assets'

/** Mount point for agent namespace files (vfs://agents/<agentId>/...). */
const AGENTS_MOUNT = '/agents'

/** System paths that should be served from the in-memory map, never forwarded to VFS. */
const SYSTEM_PREFIXES = ['/bin', '/usr', '/home', '/tmp', '/dev', '/proc', '/etc']

const DEFAULT_FILE_MODE = 0o644
const DEFAULT_DIR_MODE = 0o755

/**
 * IFileSystem implementation that delegates workspace I/O to a VfsBackend,
 * while keeping system directories in memory.
 */
export class VfsBridgeFs {
  readonly isVfsBridge = true

  /** In-memory system filesystem (just-bash needs /bin stubs, /dev/null, etc.) */
  private sysFs = new Map<string, SysEntry>()

  /** Cached recursive path listing for getAllPaths() (populated lazily) */
  private _cachedAllPaths: string[] | null = null

  /** When true, all workspace write/delete operations throw a permission error. */
  readonly readOnly: boolean

  constructor(
    private readonly backend: VfsBackend,
    private readonly rootNames: string[] = [],
    private readonly assetsBackend?: VfsBackend,
    private readonly agentBackend?: VfsBackend,
    options?: { readOnly?: boolean },
  ) {
    this.readOnly = options?.readOnly ?? false

    // Bootstrap essential system directories that just-bash expects
    this.ensureSysDir('/')
    this.ensureSysDir('/bin')
    this.ensureSysDir('/usr')
    this.ensureSysDir('/usr/bin')
    this.ensureSysDir('/home')
    this.ensureSysDir('/home/user')
    this.ensureSysDir('/tmp')
    this.ensureSysDir('/dev')
    this.ensureSysDir('/proc')
    this.ensureSysDir('/proc/self')
    this.ensureSysDir('/proc/self/fd')
    this.ensureSysDir('/etc')
    this.ensureSysDir(WORKSPACE_MOUNT)
    if (assetsBackend) this.ensureSysDir(ASSETS_MOUNT)
    if (agentBackend) this.ensureSysDir(AGENTS_MOUNT)

    // /dev/null — black hole (writeFileSync from initFilesystem will overwrite, that's fine)
    this.sysFs.set('/dev/null', {
      type: 'file',
      content: new Uint8Array(0),
      mode: 0o666,
      mtime: new Date(),
    })
  }

  // ==========================================================================
  // Core read / write
  // ==========================================================================

  async readFile(path: string, _options?: { encoding?: string } | string): Promise<string> {
    // System file?
    const sysEntry = this.getSysFile(path)
    if (sysEntry) {
      if (sysEntry.type !== 'file') throw new Error(`EISDIR: '${path}'`)
      return new TextDecoder().decode(sysEntry.content)
    }

    // Assets file
    if (this.isAssetsPath(path)) {
      if (!this.assetsBackend) throw new Error(`ENOENT: '${path}'`)
      const relPath = this.toAssetsRelative(path)
      const result = await this.assetsBackend.readFile(relPath)
      if (typeof result.content === 'string') return result.content
      if (result.content instanceof ArrayBuffer) return new TextDecoder().decode(result.content)
      return await (result.content as Blob).text()
    }

    // Agent namespace file
    if (this.isAgentsPath(path)) {
      if (!this.agentBackend) throw new Error(`ENOENT: '${path}'`)
      const relPath = this.toAgentsRelative(path)
      const result = await this.agentBackend.readFile(relPath)
      if (typeof result.content === 'string') return result.content
      if (result.content instanceof ArrayBuffer) return new TextDecoder().decode(result.content)
      return await (result.content as Blob).text()
    }

    // Workspace file
    const relPath = this.toRelative(path)
    const result = await this.backend.readFile(relPath)
    if (typeof result.content === 'string') return result.content
    if (result.content instanceof ArrayBuffer) return new TextDecoder().decode(result.content)
    return await (result.content as Blob).text()
  }

  async readFileBuffer(path: string): Promise<Uint8Array> {
    const sysEntry = this.getSysFile(path)
    if (sysEntry) {
      if (sysEntry.type !== 'file') throw new Error(`EISDIR: '${path}'`)
      return sysEntry.content
    }

    // Assets file
    if (this.isAssetsPath(path)) {
      if (!this.assetsBackend) throw new Error(`ENOENT: '${path}'`)
      const relPath = this.toAssetsRelative(path)
      const result = await this.assetsBackend.readFile(relPath, { encoding: 'binary' })
      if (result.content instanceof Uint8Array) return result.content
      if (result.content instanceof ArrayBuffer) return new Uint8Array(result.content)
      if (typeof result.content === 'string') return new TextEncoder().encode(result.content)
      const buf = await (result.content as Blob).arrayBuffer()
      return new Uint8Array(buf)
    }

    // Agent namespace file
    if (this.isAgentsPath(path)) {
      if (!this.agentBackend) throw new Error(`ENOENT: '${path}'`)
      const relPath = this.toAgentsRelative(path)
      const result = await this.agentBackend.readFile(relPath, { encoding: 'binary' })
      if (result.content instanceof Uint8Array) return result.content
      if (result.content instanceof ArrayBuffer) return new Uint8Array(result.content)
      if (typeof result.content === 'string') return new TextEncoder().encode(result.content)
      const buf2 = await (result.content as Blob).arrayBuffer()
      return new Uint8Array(buf2)
    }

    const relPath = this.toRelative(path)
    const result = await this.backend.readFile(relPath, { encoding: 'binary' })
    if (result.content instanceof Uint8Array) return result.content
    if (result.content instanceof ArrayBuffer) return new Uint8Array(result.content)
    if (typeof result.content === 'string') return new TextEncoder().encode(result.content)
    const buf = await (result.content as Blob).arrayBuffer()
    return new Uint8Array(buf)
  }

  /** Convert VfsReadResult.content (string | ArrayBuffer | Blob) to writable form (string | Uint8Array) */
  private async toWritableContent(content: string | ArrayBuffer | Blob): Promise<string | Uint8Array> {
    if (content instanceof ArrayBuffer) return new Uint8Array(content)
    if (content instanceof Blob) return new Uint8Array(await content.arrayBuffer())
    return content
  }

  async writeFile(path: string, content: string | Uint8Array, _options?: { encoding?: string } | string): Promise<void> {
    // /dev/null, /dev/zero — silently consume writes
    if (path === '/dev/null' || path === '/dev/zero') return

    // System path — write to in-memory map
    if (this.isSystemPath(path)) {
      const normalized = this.normalizeAbsolutePath(path)
      this.ensureSysDir(this.dirname(normalized))
      this.sysFs.set(normalized, {
        type: 'file',
        content: typeof content === 'string' ? new TextEncoder().encode(content) : content,
        mode: DEFAULT_FILE_MODE,
        mtime: new Date(),
      })
      return
    }


    // Assets file
    if (this.isAssetsPath(path)) {
      if (!this.assetsBackend) throw new Error(`ENOENT: '${path}'`)
      const relPath = this.toAssetsRelative(path)
      await this.assetsBackend.writeFile(relPath, content)
      this._cachedAllPaths = null
      return
    }

    // Agent namespace file
    if (this.isAgentsPath(path)) {
      if (!this.agentBackend) throw new Error(`ENOENT: '${path}'`)
      const relPath = this.toAgentsRelative(path)
      await this.agentBackend.writeFile(relPath, content)
      this._cachedAllPaths = null
      return
    }

    // Workspace path — check read-only guard
    if (this.readOnly) {
      throw new Error(`bash: ${path}: write blocked (read-only mode)`)
    }

    const relPath = this.toRelative(path)
    await this.backend.writeFile(relPath, content)
    this._cachedAllPaths = null // invalidate cache
  }

  async appendFile(path: string, content: string | Uint8Array, _options?: { encoding?: string } | string): Promise<void> {
    if (path === '/dev/null' || path === '/dev/zero') return

    if (this.isSystemPath(path)) {
      const normalized = this.normalizeAbsolutePath(path)
      const existing = this.sysFs.get(normalized)
      const existingContent = existing && existing.type === 'file' ? existing.content : new Uint8Array(0)
      const toAppend = typeof content === 'string' ? new TextEncoder().encode(content) : content
      const combined = new Uint8Array(existingContent.length + toAppend.length)
      combined.set(existingContent)
      combined.set(toAppend, existingContent.length)
      this.sysFs.set(normalized, {
        type: 'file',
        content: combined,
        mode: DEFAULT_FILE_MODE,
        mtime: new Date(),
      })
      return
    }


    // Assets file
    if (this.isAssetsPath(path)) {
      if (!this.assetsBackend) throw new Error(`ENOENT: '${path}'`)
      const relPath = this.toAssetsRelative(path)
      let existing = ''
      try {
        const result = await this.assetsBackend.readFile(relPath)
        if (typeof result.content === 'string') existing = result.content
        else if (result.content instanceof ArrayBuffer) existing = new TextDecoder().decode(result.content)
      } catch {
        // File doesn't exist yet
      }
      const toAppend = typeof content === 'string' ? content : new TextDecoder().decode(content)
      await this.assetsBackend.writeFile(relPath, existing + toAppend)
      return
    }

    // Agent namespace file
    if (this.isAgentsPath(path)) {
      if (!this.agentBackend) throw new Error(`ENOENT: '${path}'`)
      const relPath = this.toAgentsRelative(path)
      let agExisting = ''
      try {
        const result = await this.agentBackend.readFile(relPath)
        if (typeof result.content === 'string') agExisting = result.content
        else if (result.content instanceof ArrayBuffer) agExisting = new TextDecoder().decode(result.content)
      } catch {}
      const agToAppend = typeof content === 'string' ? content : new TextDecoder().decode(content)
      await this.agentBackend.writeFile(relPath, agExisting + agToAppend)
      return
    }

    // Workspace path — check read-only guard
    if (this.readOnly) {
      throw new Error(`bash: ${path}: append blocked (read-only mode)`)
    }

    const relPath = this.toRelative(path)
    let existing = ''
    try {
      const result = await this.backend.readFile(relPath)
      if (typeof result.content === 'string') existing = result.content
      else if (result.content instanceof ArrayBuffer) existing = new TextDecoder().decode(result.content)
    } catch {
      // File doesn't exist yet
    }
    const toAppend = typeof content === 'string' ? content : new TextDecoder().decode(content)
    await this.backend.writeFile(relPath, existing + toAppend)
  }

  // ==========================================================================
  // File management
  // ==========================================================================

  async exists(path: string): Promise<boolean> {
    const normalized = this.normalizeAbsolutePath(path)

    // Check system map (files and directories we've explicitly created)
    if (this.sysFs.has(normalized)) return true


    // Assets file
    if (this.isAssetsPath(normalized)) {
      if (!this.assetsBackend) return false
      const relPath = this.toAssetsRelative(normalized)
      if (this.assetsBackend.exists) {
        try { return await this.assetsBackend.exists(relPath) } catch { return false }
      }
      try { await this.assetsBackend.listDir(relPath); return true } catch {}
      try { await this.assetsBackend.readFile(relPath); return true } catch { return false }
    }

    // Agent namespace
    if (this.isAgentsPath(normalized)) {
      if (!this.agentBackend) return false
      const relPath = this.toAgentsRelative(normalized)
      if (this.agentBackend.exists) {
        try { return await this.agentBackend.exists(relPath) } catch { return false }
      }
      try { await this.agentBackend.listDir(relPath); return true } catch {}
      try { await this.agentBackend.readFile(relPath); return true } catch { return false }
    }

    // Workspace file or directory
    const relPath = this.toRelative(normalized)
    if (!relPath) {
      // Empty path = workspace root
      return true
    }

    // Try backend.exists first (cheapest)
    if (this.backend.exists) {
      try {
        return await this.backend.exists(relPath)
      } catch {
        return false
      }
    }

    // Fallback: try listDir (cheaper than readFile) then readFile
    try {
      await this.backend.listDir(relPath)
      return true
    } catch {
      try {
        await this.backend.readFile(relPath)
        return true
      } catch {
        return false
      }
    }
  }

  async stat(path: string): Promise<FsStat> {
    const normalized = this.normalizeAbsolutePath(path)

    // System entry
    const sysEntry = this.sysFs.get(normalized)
    if (sysEntry) {
      if (sysEntry.type === 'file') {
        return {
          isFile: true,
          isDirectory: false,
          isSymbolicLink: false,
          mode: sysEntry.mode,
          size: sysEntry.content.length,
          mtime: sysEntry.mtime,
        }
      }
      return {
        isFile: false,
        isDirectory: true,
        isSymbolicLink: false,
        mode: sysEntry.mode,
        size: 0,
        mtime: sysEntry.mtime,
      }
    }


    // Assets
    if (this.isAssetsPath(normalized)) {
      if (!this.assetsBackend) throw new Error(`ENOENT: no such file or directory, stat '${path}'`)
      const relPath = this.toAssetsRelative(normalized)
      try {
        const result = await this.assetsBackend.readFile(relPath)
        return { isFile: true, isDirectory: false, isSymbolicLink: false, mode: DEFAULT_FILE_MODE, size: result.size, mtime: result.mtime ? new Date(result.mtime) : new Date() }
      } catch {}
      try {
        const entries = await this.assetsBackend.listDir(relPath)
        if (entries.length > 0) return { isFile: false, isDirectory: true, isSymbolicLink: false, mode: DEFAULT_DIR_MODE, size: 0, mtime: new Date() }
      } catch {}
      throw new Error(`ENOENT: no such file or directory, stat '${path}'`)
    }

    // Agent namespace
    if (this.isAgentsPath(normalized)) {
      if (!this.agentBackend) throw new Error(`ENOENT: no such file or directory, stat '${path}'`)
      const relPath = this.toAgentsRelative(normalized)
      try {
        const result = await this.agentBackend.readFile(relPath)
        return { isFile: true, isDirectory: false, isSymbolicLink: false, mode: DEFAULT_FILE_MODE, size: result.size, mtime: result.mtime ? new Date(result.mtime) : new Date() }
      } catch {}
      try {
        const entries = await this.agentBackend.listDir(relPath)
        if (entries.length > 0) return { isFile: false, isDirectory: true, isSymbolicLink: false, mode: DEFAULT_DIR_MODE, size: 0, mtime: new Date() }
      } catch {}
      throw new Error(`ENOENT: no such file or directory, stat '${path}'`)
    }

    // Workspace
    const relPath = this.toRelative(normalized)
    if (!relPath) {
      // Workspace root directory
      return { isFile: false, isDirectory: true, isSymbolicLink: false, mode: DEFAULT_DIR_MODE, size: 0, mtime: new Date() }
    }

    // Try as file first
    try {
      const result = await this.backend.readFile(relPath)
      return {
        isFile: true,
        isDirectory: false,
        isSymbolicLink: false,
        mode: DEFAULT_FILE_MODE,
        size: result.size,
        mtime: result.mtime ? new Date(result.mtime) : new Date(),
      }
    } catch {
      // Not a file
    }

    // Try as directory — but listDir may return [] for non-existent paths
    // (the backend's listDir can silently return empty for unknown paths).
    // To distinguish "empty directory" from "path doesn't exist", we verify
    // that the path appears as a child entry in its parent directory.
    try {
      const entries = await this.backend.listDir(relPath)
      // listDir succeeded — if it returned entries, or if the backend properly
      // threw ENOTDIR for file-as-dir, the path IS a directory.
      // But an empty result could mean "non-existent path" — cross-check.
      if (entries.length > 0) {
        return { isFile: false, isDirectory: true, isSymbolicLink: false, mode: DEFAULT_DIR_MODE, size: 0, mtime: new Date() }
      }
      // Empty listing — verify by checking parent dir contains this name
      const parentPath = this.dirname(relPath)
      const name = relPath.split('/').pop()!
      try {
        const parentEntries = parentPath
          ? await this.backend.listDir(parentPath)
          : await this.backend.listDir('')
        const found = parentEntries.some(e => e.name === name && e.kind === 'directory')
        if (found) {
          return { isFile: false, isDirectory: true, isSymbolicLink: false, mode: DEFAULT_DIR_MODE, size: 0, mtime: new Date() }
        }
      } catch {
        // Parent dir check failed — fall through to ENOENT
      }
      throw new Error(`ENOENT: no such file or directory, stat '${path}'`)
    } catch (e) {
      if (e instanceof Error && e.message.startsWith('ENOENT')) throw e
      throw new Error(`ENOENT: no such file or directory, stat '${path}'`)
    }
  }

  async lstat(path: string): Promise<FsStat> {
    return this.stat(path)
  }

  async mkdir(path: string, options?: { recursive?: boolean }): Promise<void> {
    const normalized = this.normalizeAbsolutePath(path)

    // System directory — create in memory
    if (this.isSystemPath(normalized)) {
      if (options?.recursive) {
        this.ensureSysDir(normalized)
      } else {
        if (this.sysFs.has(normalized)) {
          const entry = this.sysFs.get(normalized)!
          if (entry.type === 'file') throw new Error(`EEXIST: file already exists, mkdir '${path}'`)
          // Directory already exists — that's fine with -p, error without
          if (!options?.recursive) return // just-bash mkdir -p is common, don't throw
        }
        this.ensureSysDir(normalized)
      }
      return
    }

    // Workspace directory — VfsBackend auto-creates on writeFile, so mkdir is a no-op.
    // Just don't throw.
  }

  async readdir(path: string): Promise<string[]> {
    const entries = await this.readdirWithFileTypes(path)
    return entries.map(e => e.name)
  }

  async readdirWithFileTypes(path: string): Promise<DirentEntry[]> {
    const normalized = this.normalizeAbsolutePath(path)

    // System directory — list from in-memory map
    if (this.isSystemPath(normalized) || normalized === '/') {
      return this.readdirSys(normalized)
    }


    // Assets directory
    if (this.isAssetsPath(normalized)) {
      if (!this.assetsBackend) throw new Error(`ENOTDIR: not a directory, scandir '${path}'`)
      const relPath = this.toAssetsRelative(normalized)
      // List actual asset files (empty relPath = root of assets)
      try {
        const entries: VfsDirEntry[] = await this.assetsBackend.listDir(relPath)
        return entries.map(e => ({ name: e.name, isFile: e.kind === 'file', isDirectory: e.kind === 'directory', isSymbolicLink: false }))
      } catch { throw new Error(`ENOTDIR: not a directory, scandir '${path}'`) }
    }

    // Agent namespace directory
    if (this.isAgentsPath(normalized)) {
      if (!this.agentBackend) throw new Error(`ENOTDIR: not a directory, scandir '${path}'`)
      const relPath = this.toAgentsRelative(normalized)
      try {
        const entries: VfsDirEntry[] = await this.agentBackend.listDir(relPath)
        return entries.map(e => ({ name: e.name, isFile: e.kind === 'file', isDirectory: e.kind === 'directory', isSymbolicLink: false }))
      } catch { throw new Error(`ENOTDIR: not a directory, scandir '${path}'`) }
    }

    const relPath = this.toRelative(normalized)

    // /workspace or /workspace/ — list root directories
    if (!relPath && this.rootNames.length > 0) {
      return this.rootNames.map(name => ({
        name,
        isFile: false,
        isDirectory: true,
        isSymbolicLink: false,
      }))
    }

    // Workspace subdirectory — delegate to backend
    try {
      const entries: VfsDirEntry[] = await this.backend.listDir(relPath)
      return entries.map(e => ({
        name: e.name,
        isFile: e.kind === 'file',
        isDirectory: e.kind === 'directory',
        isSymbolicLink: false,
      }))
    } catch {
      throw new Error(`ENOTDIR: not a directory, scandir '${path}'`)
    }
  }

  async rm(path: string, options?: { recursive?: boolean; force?: boolean }): Promise<void> {
    const normalized = this.normalizeAbsolutePath(path)

    // System file
    if (this.sysFs.has(normalized)) {
      this.sysFs.delete(normalized)
      return
    }


    // Assets file
    if (this.isAssetsPath(normalized)) {
      if (!this.assetsBackend) return
      const relPath = this.toAssetsRelative(normalized)
      if (!relPath) return
      if (options?.recursive && this.assetsBackend.deleteDir) {
        try { await this.assetsBackend.deleteDir(relPath); this._cachedAllPaths = null; return } catch {}
      }
      try { await this.assetsBackend.deleteFile(relPath); this._cachedAllPaths = null } catch {
        if (!options?.force) throw new Error(`ENOENT: no such file or directory, rm '${path}'`)
      }
      return
    }

    // Agent namespace file
    if (this.isAgentsPath(normalized)) {
      if (!this.agentBackend) return
      const relPath = this.toAgentsRelative(normalized)
      if (!relPath) return
      if (options?.recursive && this.agentBackend.deleteDir) {
        try { await this.agentBackend.deleteDir(relPath); this._cachedAllPaths = null; return } catch {}
      }
      try { await this.agentBackend.deleteFile(relPath); this._cachedAllPaths = null } catch {
        if (!options?.force) throw new Error(`ENOENT: no such file or directory, rm '${path}'`)
      }
      return
    }

    // Workspace file
    const relPath = this.toRelative(normalized)
    if (!relPath) return // Can't rm workspace root

    // Workspace path — check read-only guard
    if (this.readOnly) {
      throw new Error(`bash: ${path}: delete blocked (read-only mode)`)
    }

    if (options?.recursive && this.backend.deleteDir) {
      try {
        await this.backend.deleteDir(relPath)
        this._cachedAllPaths = null
        return
      } catch {
        // Might be a file, fall through
      }
    }

    try {
      await this.backend.deleteFile(relPath)
      this._cachedAllPaths = null
    } catch {
      if (!options?.force) throw new Error(`ENOENT: no such file or directory, rm '${path}'`)
    }
  }

  async cp(src: string, dest: string, options?: { recursive?: boolean }): Promise<void> {
    const srcNorm = this.normalizeAbsolutePath(src)
    const destNorm = this.normalizeAbsolutePath(dest)

    // Check if source is a system entry
    const sysEntry = this.sysFs.get(srcNorm)
    if (sysEntry) {
      if (sysEntry.type === 'file') {
        // Copy system file to destination
        await this.writeFile(dest, sysEntry.content)
        return
      }
      if (sysEntry.type === 'directory' && options?.recursive) {
        // Copy system directory entries
        await this.cpSysDir(srcNorm, destNorm)
        return
      }
      throw new Error(`cp: cannot stat '${src}'`)
    }


    // Assets source
    if (this.isAssetsPath(srcNorm)) {
      if (!this.assetsBackend) throw new Error(`cp: cannot stat '${src}'`)
      const srcRel = this.toAssetsRelative(srcNorm)
      try {
        const result = await this.assetsBackend.readFile(srcRel)
        await this.writeFile(dest, await this.toWritableContent(result.content))
        return
      } catch { throw new Error(`cp: cannot stat '${src}': No such file or directory`) }
    }

    // Agent namespace source
    if (this.isAgentsPath(srcNorm)) {
      if (!this.agentBackend) throw new Error(`cp: cannot stat '${src}'`)
      const srcRel = this.toAgentsRelative(srcNorm)
      try {
        const result = await this.agentBackend.readFile(srcRel)
        await this.writeFile(dest, await this.toWritableContent(result.content))
        return
      } catch { throw new Error(`cp: cannot stat '${src}': No such file or directory`) }
    }

    // Workspace source
    const srcRel = this.toRelative(srcNorm)
    if (!srcRel) throw new Error(`cp: cannot copy workspace root`)

    // Try as file first
    try {
      const result = await this.backend.readFile(srcRel)
      const destRel = this.toRelative(destNorm)
      await this.backend.writeFile(destRel, result.content)
      return
    } catch {
      // Not a file — try as directory if -r
    }

    // Try as directory
    if (options?.recursive) {
      try {
        await this.cpVfsDir(srcRel, destNorm)
        return
      } catch {
        throw new Error(`cp: cannot stat '${src}': No such file or directory`)
      }
    }

    throw new Error(`cp: cannot stat '${src}': No such file or directory`)
  }

  private async cpSysDir(srcNorm: string, destNorm: string): Promise<void> {
    const prefix = srcNorm === '/' ? '/' : `${srcNorm}/`
    for (const [p, entry] of this.sysFs.entries()) {
      if (!p.startsWith(prefix) || p === srcNorm) continue
      const relFromSrc = p.slice(prefix.length)
      const destPath = `${destNorm}/${relFromSrc}`
      if (entry.type === 'file') {
        await this.writeFile(destPath, entry.content)
      } else if (entry.type === 'directory') {
        this.ensureSysDir(this.normalizeAbsolutePath(destPath))
      }
    }
  }

  private async cpVfsDir(srcRel: string, destNorm: string): Promise<void> {
    const entries = await this.backend.listDir(srcRel)
    for (const entry of entries) {
      const childSrc = srcRel ? `${srcRel}/${entry.name}` : entry.name
      const childDest = `${destNorm}/${entry.name}`
      if (entry.kind === 'file') {
        const result = await this.backend.readFile(childSrc)
        const destRel = this.toRelative(this.normalizeAbsolutePath(childDest))
        await this.backend.writeFile(destRel, result.content)
      } else if (entry.kind === 'directory') {
        await this.cpVfsDir(childSrc, childDest)
      }
    }
  }

  async mv(src: string, dest: string): Promise<void> {
    // Non-atomic: cp-then-rm. If rm fails after successful cp, both copies remain.
    // This is acceptable because VFS backends don't support atomic rename across
    // mount points (e.g. /workspace/rootA → /workspace/rootB).
    await this.cp(src, dest, { recursive: true })
    await this.rm(src, { recursive: true, force: true })
  }

  // ==========================================================================
  // Path resolution
  // ==========================================================================

  resolvePath(base: string, path: string): string {
    if (path.startsWith('/')) return this.normalizeAbsolutePath(path)
    const combined = base === '/' ? `/${path}` : `${base}/${path}`
    return this.normalizeAbsolutePath(combined)
  }

  /**
   * Get all paths in the filesystem (for glob matching in `find`, etc.)
   *
   * Returns system paths from the in-memory map. Workspace paths are NOT
   * included because this method is synchronous and we can't do async
   * recursive listDir. Commands that need find/glob on workspace files
   * will use readdir-based traversal instead.
   */
  getAllPaths(): string[] {
    if (this._cachedAllPaths) return this._cachedAllPaths

    // System paths from in-memory map
    this._cachedAllPaths = Array.from(this.sysFs.keys())
    return this._cachedAllPaths
  }

  // ==========================================================================
  // Unsupported features
  // ==========================================================================

  async chmod(_path: string, _mode: number): Promise<void> {}
  async symlink(_target: string, _linkPath: string): Promise<void> { throw new Error('EOPNOTSUPP: symlinks not supported') }
  async link(_existingPath: string, _newPath: string): Promise<void> { throw new Error('EOPNOTSUPP: hard links not supported') }
  async readlink(_path: string): Promise<string> { throw new Error('EINVAL: not a symlink') }

  async realpath(path: string): Promise<string> {
    return this.normalizeAbsolutePath(path)
  }

  async utimes(_path: string, _atime: Date, _mtime: Date): Promise<void> {}

  // ==========================================================================
  // Sync write support (needed by just-bash for /bin command stubs)
  // ==========================================================================

  /**
   * Synchronous write — just-bash's registerCommand and initFilesystem use this
   * to create stub files in /bin/ and device files in /dev/.
   * We store them in the in-memory system map.
   */
  writeFileSync(path: string, content: string | Uint8Array): void {
    const normalized = this.normalizeAbsolutePath(path)
    this.ensureSysDir(this.dirname(normalized))
    this.sysFs.set(normalized, {
      type: 'file',
      content: typeof content === 'string' ? new TextEncoder().encode(content) : content,
      mode: DEFAULT_FILE_MODE,
      mtime: new Date(),
    })
  }

  /**
   * Synchronous mkdir — just-bash's initFilesystem and constructor use this.
   */
  mkdirSync(path: string, _options?: { recursive?: boolean }): void {
    const normalized = this.normalizeAbsolutePath(path)
    this.ensureSysDir(normalized)
  }

  // ==========================================================================
  // Internal helpers
  // ==========================================================================


  /** Check if a path is under the /agents mount point. */
  private isAgentsPath(path: string): boolean {
    const normalized = path.startsWith('/') ? path : this.normalizeAbsolutePath(path)
    return normalized === AGENTS_MOUNT || normalized.startsWith(AGENTS_MOUNT + '/')
  }

  /**
   * Convert an absolute /agents/... path to a relative path for AgentBackend.
   * /agents/SOUL.md → "SOUL.md"
   * /agents/memory/2024-01-01.md → "memory/2024-01-01.md"
   * /agents → ""
   */
  private toAgentsRelative(absPath: string): string {
    let rel = absPath
    if (rel.startsWith(AGENTS_MOUNT + '/')) {
      rel = rel.slice(AGENTS_MOUNT.length + 1)
    } else if (rel === AGENTS_MOUNT) {
      rel = ''
    }
    return rel.replace(/^\/+/, '')
  }

  /** Check if a path is under the /assets mount point. */
  private isAssetsPath(path: string): boolean {
    const normalized = path.startsWith('/') ? path : this.normalizeAbsolutePath(path)
    return normalized === ASSETS_MOUNT || normalized.startsWith(ASSETS_MOUNT + '/')
  }

  /**
   * Convert an absolute /assets/... path to a relative path for AssetsBackend.
   * /assets/foo/bar.txt → "foo/bar.txt"
   * /assets → ""
   */
  private toAssetsRelative(absPath: string): string {
    let rel = absPath
    if (rel.startsWith(ASSETS_MOUNT + '/')) {
      rel = rel.slice(ASSETS_MOUNT.length + 1)
    } else if (rel === ASSETS_MOUNT) {
      rel = ''
    }
    return rel.replace(/^\/+/, '')
  }

  private isSystemPath(path: string): boolean {
    const normalized = path.startsWith('/') ? path : this.normalizeAbsolutePath(path)
    if (normalized === '/') return true
    return SYSTEM_PREFIXES.some(p => normalized === p || normalized.startsWith(p + '/'))
  }

  /** Get a system file entry, or null if not in system map. */
  private getSysFile(path: string): SysEntry | null {
    const normalized = this.normalizeAbsolutePath(path)
    return this.sysFs.get(normalized) ?? null
  }

  /** Ensure a system directory exists in the in-memory map (with parents). */
  private ensureSysDir(path: string): void {
    if (!path || path === '/') {
      if (!this.sysFs.has('/')) {
        this.sysFs.set('/', { type: 'directory', mode: DEFAULT_DIR_MODE, mtime: new Date() })
      }
      return
    }
    const normalized = this.normalizeAbsolutePath(path)
    if (!this.sysFs.has(normalized)) {
      // Ensure parent first
      const parent = this.dirname(normalized)
      if (parent !== normalized) this.ensureSysDir(parent)
      this.sysFs.set(normalized, { type: 'directory', mode: DEFAULT_DIR_MODE, mtime: new Date() })
    }
  }

  /** Read system directory entries from the in-memory map. */
  private readdirSys(dirPath: string): DirentEntry[] {
    const prefix = dirPath === '/' ? '/' : `${dirPath}/`
    const entries = new Map<string, DirentEntry>()

    for (const [p, entry] of this.sysFs.entries()) {
      if (p === dirPath) continue
      if (!p.startsWith(prefix)) continue

      const rest = p.slice(prefix.length)
      const name = rest.split('/')[0]
      if (!name || rest.includes('/', name.length)) continue

      if (!entries.has(name)) {
        entries.set(name, {
          name,
          isFile: entry.type === 'file',
          isDirectory: entry.type === 'directory',
          isSymbolicLink: false,
        })
      }
    }

    return Array.from(entries.values()).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
  }

  /**
   * Convert an absolute just-bash path to a VFS-relative path.
   *
   * /workspace/<rootName>/path/to/file → "<rootName>/path/to/file"
   * /workspace/<rootName>              → "<rootName>"
   * /workspace                         → "" (root listing)
   *
   * The VFS backend's resolvePath expects a rootName prefix:
   * - "creatorweave/web/src/app.ts" → routes to "creatorweave" root
   * - "" → lists root directories
   */
  private toRelative(absPath: string): string {
    let rel = absPath

    if (rel.startsWith(WORKSPACE_MOUNT + '/')) {
      rel = rel.slice(WORKSPACE_MOUNT.length + 1)
    } else if (rel === WORKSPACE_MOUNT) {
      rel = ''
    }

    rel = rel.replace(/^\/+/, '')
    return rel
  }

  private normalizeAbsolutePath(path: string): string {
    const parts = path.split('/').filter(Boolean)
    const resolved: string[] = []
    for (const part of parts) {
      if (part === '..') resolved.pop()
      else if (part !== '.') resolved.push(part)
    }
    return '/' + resolved.join('/')
  }

  private dirname(path: string): string {
    const parts = path.split('/').filter(Boolean)
    if (parts.length <= 1) return '/'
    return '/' + parts.slice(0, -1).join('/')
  }
}
