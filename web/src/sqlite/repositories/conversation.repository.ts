/**
 * Conversation Repository
 *
 * SQLite-based storage for conversations (metadata only).
 * Messages are stored in the independent `messages` table via MessageRepository.
 */

import { getSQLiteDB, type ConversationRow, parseJSON, toJSON } from '../sqlite-database'
import type { ContextWindowUsage } from '@/agent/message-types'

export interface StoredConversation {
  id: string
  title: string
  titleMode?: 'auto' | 'manual'
  messages: unknown[] // Message[] — populated by MessageRepository, not this table
  lastContextWindowUsage?: ContextWindowUsage | null
  createdAt: number
  updatedAt: number
}

/** Lightweight conversation metadata without messages */
export interface ConversationMeta {
  id: string
  title: string
  titleMode?: 'auto' | 'manual'
  lastContextWindowUsage?: ContextWindowUsage | null
  compressedContextSummary?: string | null
  compressedContextCutoffTimestamp?: number | null
  createdAt: number
  updatedAt: number
}

/** Base columns that always exist in the conversations table */
type BaseMetaColumns = Pick<
  ConversationRow,
  'id' | 'title' | 'title_mode' | 'context_usage_json' | 'created_at' | 'updated_at'
>

/** Extended columns including compression baseline (added by migration v8) */
type ExtendedMetaColumns = Pick<
  ConversationRow,
  'id' | 'title' | 'title_mode' | 'context_usage_json' |
  'compressed_context_summary' | 'compressed_context_cutoff_ts' |
  'created_at' | 'updated_at'
>

const BASE_SELECT = `SELECT id, title, title_mode, context_usage_json, created_at, updated_at FROM conversations`
const EXTENDED_SELECT = `SELECT id, title, title_mode, context_usage_json, compressed_context_summary, compressed_context_cutoff_ts, created_at, updated_at FROM conversations`

//=============================================================================
// Conversation Repository
//=============================================================================

export class ConversationRepository {
  private _hasCompressionColumns: boolean | null = null

  /**
   * Check whether the compression baseline columns exist in the conversations
   * table.  Cached after first check.
   */
  private async hasCompressionColumns(): Promise<boolean> {
    if (this._hasCompressionColumns !== null) return this._hasCompressionColumns
    try {
      const db = getSQLiteDB()
      await db.queryFirst(
        'SELECT compressed_context_summary, compressed_context_cutoff_ts FROM conversations LIMIT 0'
      )
      this._hasCompressionColumns = true
    } catch {
      this._hasCompressionColumns = false
    }
    return this._hasCompressionColumns
  }

  /**
   * Execute a SELECT query, using extended columns if available, falling back
   * to base columns if the migration hasn't been applied yet.
   */
  private async queryMetaAll(orderBy: string): Promise<ConversationMeta[]> {
    const db = getSQLiteDB()
    const useExtended = await this.hasCompressionColumns()
    if (useExtended) {
      const rows = await db.queryAll<ExtendedMetaColumns>(
        `${EXTENDED_SELECT} ${orderBy}`
      )
      return rows.map((row) => this.extendedRowToMeta(row))
    }
    const rows = await db.queryAll<BaseMetaColumns>(`${BASE_SELECT} ${orderBy}`)
    return rows.map((row) => this.baseRowToMeta(row))
  }

  private async queryMetaFirst(where: string, params: unknown[]): Promise<ConversationMeta | null> {
    const db = getSQLiteDB()
    const useExtended = await this.hasCompressionColumns()
    if (useExtended) {
      const row = await db.queryFirst<ExtendedMetaColumns>(
        `${EXTENDED_SELECT} ${where}`, params
      )
      return row ? this.extendedRowToMeta(row) : null
    }
    const row = await db.queryFirst<BaseMetaColumns>(
      `${BASE_SELECT} ${where}`, params
    )
    return row ? this.baseRowToMeta(row) : null
  }

  /**
   * Get all conversations metadata (without messages) ordered by updated_at desc.
   */
  async findAll(): Promise<ConversationMeta[]> {
    return this.queryMetaAll('ORDER BY updated_at DESC')
  }

  /**
   * Alias for findAll() — returns conversation metadata.
   */
  async findAllMeta(): Promise<ConversationMeta[]> {
    return this.findAll()
  }

  /**
   * Find conversation metadata by ID (without messages).
   */
  async findById(id: string): Promise<ConversationMeta | null> {
    return this.queryMetaFirst('WHERE id = ?', [id])
  }

  /**
   * Insert or update conversation metadata (no messages).
   * Messages are managed by MessageRepository.
   */
  async save(conversation: StoredConversation): Promise<void> {
    const db = getSQLiteDB()
    await db.execute(
      `INSERT INTO conversations (id, title, title_mode, context_usage_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         title = excluded.title,
         title_mode = excluded.title_mode,
         context_usage_json = excluded.context_usage_json,
         updated_at = excluded.updated_at`,
      [
        conversation.id,
        conversation.title,
        conversation.titleMode || 'manual',
        toJSON(conversation.lastContextWindowUsage || null),
        conversation.createdAt,
        conversation.updatedAt,
      ]
    )
  }

  /**
   * Delete a conversation by ID.
   * Messages are cascade-deleted via FOREIGN KEY ON DELETE CASCADE.
   */
  async delete(id: string): Promise<void> {
    const db = getSQLiteDB()
    await db.execute('DELETE FROM conversations WHERE id = ?', [id])
  }

  /**
   * Delete all conversations
   */
  async deleteAll(): Promise<void> {
    const db = getSQLiteDB()
    await db.execute('DELETE FROM conversations')
  }

  /**
   * Count conversations
   */
  async count(): Promise<number> {
    const db = getSQLiteDB()
    const row = await db.queryFirst<{ count: number }>(
      'SELECT COUNT(*) as count FROM conversations'
    )
    return row?.count || 0
  }

  /**
   * Get most recently updated conversation metadata
   */
  async findMostRecent(): Promise<ConversationMeta | null> {
    return this.queryMetaFirst('ORDER BY updated_at DESC LIMIT 1', [])
  }

  /**
   * Update conversation title
   */
  async updateTitle(id: string, title: string): Promise<void> {
    const db = getSQLiteDB()
    await db.execute('UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?', [title, Date.now(), id])
  }

  /**
   * Touch conversation's updated_at timestamp without changing other fields.
   */
  async touch(id: string): Promise<void> {
    const db = getSQLiteDB()
    await db.execute('UPDATE conversations SET updated_at = ? WHERE id = ?', [Date.now(), id])
  }

  /**
   * Save only the metadata fields (no messages).
   * Used by persistConversationMeta().
   *
   * Gracefully handles the case where compression columns don't exist yet
   * (migration v8 not applied) by falling back to the base SQL.
   */
  async saveMeta(meta: {
    id: string
    title: string
    titleMode?: 'auto' | 'manual'
    contextUsage?: ContextWindowUsage | null
    compressedContextSummary?: string | null
    compressedContextCutoffTimestamp?: number | null
    createdAt: number
    updatedAt: number
  }): Promise<void> {
    const db = getSQLiteDB()
    const useExtended = await this.hasCompressionColumns()

    if (useExtended) {
      await db.execute(
        `INSERT INTO conversations (id, title, title_mode, context_usage_json, compressed_context_summary, compressed_context_cutoff_ts, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           title = excluded.title,
           title_mode = excluded.title_mode,
           context_usage_json = excluded.context_usage_json,
           compressed_context_summary = excluded.compressed_context_summary,
           compressed_context_cutoff_ts = excluded.compressed_context_cutoff_ts,
           updated_at = excluded.updated_at`,
        [
          meta.id,
          meta.title,
          meta.titleMode || 'manual',
          toJSON(meta.contextUsage || null),
          meta.compressedContextSummary || null,
          meta.compressedContextCutoffTimestamp ?? null,
          meta.createdAt,
          meta.updatedAt,
        ]
      )
    } else {
      await db.execute(
        `INSERT INTO conversations (id, title, title_mode, context_usage_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           title = excluded.title,
           title_mode = excluded.title_mode,
           context_usage_json = excluded.context_usage_json,
           updated_at = excluded.updated_at`,
        [
          meta.id,
          meta.title,
          meta.titleMode || 'manual',
          toJSON(meta.contextUsage || null),
          meta.createdAt,
          meta.updatedAt,
        ]
      )
    }
  }

  private baseRowToMeta(row: BaseMetaColumns): ConversationMeta {
    return {
      id: row.id,
      title: row.title,
      titleMode: row.title_mode === 'auto' ? 'auto' : 'manual',
      lastContextWindowUsage: parseJSON(row.context_usage_json || '', null),
      compressedContextSummary: null,
      compressedContextCutoffTimestamp: null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  private extendedRowToMeta(row: ExtendedMetaColumns): ConversationMeta {
    return {
      id: row.id,
      title: row.title,
      titleMode: row.title_mode === 'auto' ? 'auto' : 'manual',
      lastContextWindowUsage: parseJSON(row.context_usage_json || '', null),
      compressedContextSummary: row.compressed_context_summary || null,
      compressedContextCutoffTimestamp: row.compressed_context_cutoff_ts ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }
}

//=============================================================================
// Singleton Instance
//=============================================================================

let conversationRepoInstance: ConversationRepository | null = null

export function getConversationRepository(): ConversationRepository {
  if (!conversationRepoInstance) {
    conversationRepoInstance = new ConversationRepository()
  }
  return conversationRepoInstance
}
