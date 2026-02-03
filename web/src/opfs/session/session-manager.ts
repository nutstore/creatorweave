/**
 * Session Manager
 *
 * Top-level manager for multiple session workspaces.
 * Manages session lifecycle, retrieval, and cleanup.
 */

import { generateId } from '../utils/opfs-utils'
import { SessionWorkspace } from './session-workspace'

const SESSIONS_ROOT = 'sessions'
const INDEX_FILE = 'sessions.json'

/**
 * Internal session metadata for manager (simplified)
 */
interface InternalSessionMetadata {
  sessionId: string
  rootDirectory: string
  name: string
  createdAt: number
  lastAccessedAt: number
}

/**
 * Session Manager
 *
 * Responsibilities:
 * - Manage multiple session workspaces
 * - Create, retrieve, and delete sessions
 * - Persist session index to OPFS
 * - Provide session lifecycle management
 */
export class SessionManager {
  private opfsRoot?: FileSystemDirectoryHandle
  public sessionsRoot?: FileSystemDirectoryHandle
  private sessions: Map<string, SessionWorkspace> = new Map()
  private index: InternalSessionMetadata[] = []
  private initialized = false

  /**
   * Initialize session manager
   */
  async initialize(): Promise<void> {
    if (this.initialized) return

    // Get OPFS root
    this.opfsRoot = (await navigator.storage.getDirectory()) as FileSystemDirectoryHandle

    // Get or create sessions root directory
    this.sessionsRoot = await this.opfsRoot.getDirectoryHandle(SESSIONS_ROOT, { create: true })

    // Load session index
    await this.loadIndex()

    this.initialized = true
  }

  /**
   * Load session index from OPFS
   */
  private async loadIndex(): Promise<void> {
    if (!this.sessionsRoot) return

    try {
      const indexFile = await this.sessionsRoot.getFileHandle(INDEX_FILE)
      const file = await indexFile.getFile()
      const text = await file.text()
      const data = JSON.parse(text) as InternalSessionMetadata[]

      this.index = data
    } catch {
      // Index file doesn't exist yet
      this.index = []
    }
  }

  /**
   * Save session index to OPFS
   */
  private async saveIndex(): Promise<void> {
    if (!this.sessionsRoot) return

    const indexFile = await this.sessionsRoot.getFileHandle(INDEX_FILE, { create: true })
    const writable = await indexFile.createWritable()

    await writable.write(JSON.stringify(this.index, null, 2))
    await writable.close()
  }

  /**
   * Create a new session workspace
   * @param rootDirectory Root directory path for the session
   * @param sessionId Optional session ID (auto-generated if not provided)
   * @param name Optional session name
   * @returns Session workspace
   */
  async createSession(
    rootDirectory: string,
    sessionId?: string,
    name?: string
  ): Promise<SessionWorkspace> {
    if (!this.initialized) await this.initialize()

    const id = sessionId || generateId('session')
    const sessionDir = await this.sessionsRoot!.getDirectoryHandle(id, { create: true })

    // Create session workspace
    const workspace = new SessionWorkspace(id, sessionDir, rootDirectory)
    await workspace.initialize()

    // Add to in-memory sessions
    this.sessions.set(id, workspace)

    // Add to index
    const metadata: InternalSessionMetadata = {
      sessionId: id,
      rootDirectory,
      name: name || rootDirectory.split('/').pop() || id,
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
    }

    this.index.push(metadata)
    await this.saveIndex()

    return workspace
  }

  /**
   * Get session workspace by ID
   * @param sessionId Session ID
   * @returns Session workspace or undefined
   */
  async getSession(sessionId: string): Promise<SessionWorkspace | undefined> {
    if (!this.initialized) await this.initialize()

    // Check in-memory cache first
    if (this.sessions.has(sessionId)) {
      return this.sessions.get(sessionId)!
    }

    // Try to load from OPFS
    try {
      const sessionDir = await this.sessionsRoot!.getDirectoryHandle(sessionId)

      // Find metadata in index
      const metadata = this.index.find((s) => s.sessionId === sessionId)
      if (!metadata) {
        return undefined
      }

      // Create workspace
      const workspace = new SessionWorkspace(sessionId, sessionDir, metadata.rootDirectory)
      await workspace.initialize()

      // Cache in memory
      this.sessions.set(sessionId, workspace)

      // Update last accessed in index
      metadata.lastAccessedAt = Date.now()
      await this.saveIndex()

      return workspace
    } catch {
      // Session doesn't exist
      return undefined
    }
  }

  /**
   * Get or create session by root directory
   * @param rootDirectory Root directory path
   * @returns Session workspace
   */
  async getOrCreateSession(rootDirectory: string): Promise<SessionWorkspace> {
    if (!this.initialized) await this.initialize()

    // Find existing session by root directory
    const existing = this.index.find((s) => s.rootDirectory === rootDirectory)
    if (existing) {
      const workspace = await this.getSession(existing.sessionId)
      if (workspace) {
        return workspace
      }
    }

    // Create new session
    return await this.createSession(rootDirectory)
  }

  /**
   * Get all session metadata
   * @returns Array of session metadata
   */
  getAllSessions(): InternalSessionMetadata[] {
    return [...this.index]
  }

  /**
   * Get session count
   */
  get sessionCount(): number {
    return this.index.length
  }

  /**
   * Delete session workspace
   * @param sessionId Session ID
   */
  async deleteSession(sessionId: string): Promise<void> {
    if (!this.initialized) await this.initialize()

    // Remove from in-memory cache
    this.sessions.delete(sessionId)

    // Remove from index
    this.index = this.index.filter((s) => s.sessionId !== sessionId)
    await this.saveIndex()

    // Delete from OPFS
    try {
      await this.sessionsRoot!.removeEntry(sessionId, { recursive: true })
    } catch (err) {
      console.warn(`Failed to delete session directory: ${sessionId}`, err)
    }
  }

  /**
   * Clean up old sessions
   * @param olderThanDays Age threshold in days
   * @returns Number of sessions cleaned up
   */
  async cleanupOldSessions(olderThanDays: number = 30): Promise<number> {
    if (!this.initialized) await this.initialize()

    const now = Date.now()
    const threshold = now - olderThanDays * 24 * 60 * 60 * 1000
    let cleaned = 0

    for (const metadata of this.index) {
      if (metadata.lastAccessedAt < threshold) {
        await this.deleteSession(metadata.sessionId)
        cleaned++
      }
    }

    return cleaned
  }

  /**
   * Get session by root directory
   * @param rootDirectory Root directory path
   * @returns Session metadata or undefined
   */
  getSessionByRoot(rootDirectory: string): InternalSessionMetadata | undefined {
    return this.index.find((s) => s.rootDirectory === rootDirectory)
  }

  /**
   * Check if session exists
   * @param sessionId Session ID
   */
  hasSession(sessionId: string): boolean {
    return this.index.some((s) => s.sessionId === sessionId)
  }

  /**
   * Update session root directory
   * @param sessionId Session ID
   * @param rootDirectory New root directory
   */
  async updateSessionRoot(sessionId: string, rootDirectory: string): Promise<void> {
    const metadata = this.index.find((s) => s.sessionId === sessionId)
    if (metadata) {
      metadata.rootDirectory = rootDirectory
      await this.saveIndex()

      // Update workspace if loaded
      const workspace = this.sessions.get(sessionId)
      if (workspace) {
        await workspace.updateRootDirectory(rootDirectory)
      }
    }
  }

  /**
   * Update session name
   * @param sessionId Session ID
   * @param name New session name
   */
  async updateSessionName(sessionId: string, name: string): Promise<void> {
    const metadata = this.index.find((s) => s.sessionId === sessionId)
    if (metadata) {
      metadata.name = name
      await this.saveIndex()
    }
  }

  /**
   * Clear all in-memory session caches (keeps OPFS data)
   */
  clearMemoryCache(): void {
    this.sessions.clear()
  }

  /**
   * Get statistics for all sessions
   */
  async getAllStats(): Promise<
    Array<{ sessionId: string; stats: Awaited<ReturnType<SessionWorkspace['getStats']>> }>
  > {
    const results: Array<{
      sessionId: string
      stats: Awaited<ReturnType<SessionWorkspace['getStats']>>
    }> = []

    for (const metadata of this.index) {
      const workspace = await this.getSession(metadata.sessionId)
      if (workspace) {
        const stats = await workspace.getStats()
        results.push({ sessionId: metadata.sessionId, stats })
      }
    }

    return results
  }
}
