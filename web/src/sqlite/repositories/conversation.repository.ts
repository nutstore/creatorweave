/**
 * Conversation Repository
 *
 * SQLite-based storage for conversations (chat history)
 */

import { getSQLiteDB, type ConversationRow, parseJSON, toJSON } from '../sqlite-database'

export interface StoredConversation {
  id: string
  title: string
  messages: unknown[] // Message[]
  createdAt: number
  updatedAt: number
}

//=============================================================================
// Conversation Repository
//=============================================================================

export class ConversationRepository {
  /**
   * Get all conversations ordered by updated_at desc
   */
  async findAll(): Promise<StoredConversation[]> {
    const db = getSQLiteDB()
    const rows = await db.queryAll<ConversationRow>(
      'SELECT id, title, messages_json, created_at, updated_at FROM conversations ORDER BY updated_at DESC'
    )
    return rows.map((row) => this.rowToConversation(row))
  }

  /**
   * Find conversation by ID
   */
  async findById(id: string): Promise<StoredConversation | null> {
    const db = getSQLiteDB()
    const row = await db.queryFirst<ConversationRow>(
      'SELECT id, title, messages_json, created_at, updated_at FROM conversations WHERE id = ?',
      [id]
    )
    return row ? this.rowToConversation(row) : null
  }

  /**
   * Insert or update a conversation
   */
  async save(conversation: StoredConversation): Promise<void> {
    const db = getSQLiteDB()
    await db.execute(
      `INSERT INTO conversations (id, title, messages_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         title = excluded.title,
         messages_json = excluded.messages_json,
         updated_at = excluded.updated_at`,
      [
        conversation.id,
        conversation.title,
        toJSON(conversation.messages),
        conversation.createdAt,
        conversation.updatedAt,
      ]
    )
  }

  /**
   * Delete a conversation by ID
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
   * Get most recently updated conversation
   */
  async findMostRecent(): Promise<StoredConversation | null> {
    const db = getSQLiteDB()
    const row = await db.queryFirst<ConversationRow>(
      'SELECT id, title, messages_json, created_at, updated_at FROM conversations ORDER BY updated_at DESC LIMIT 1'
    )
    return row ? this.rowToConversation(row) : null
  }

  /**
   * Update conversation title
   */
  async updateTitle(id: string, title: string): Promise<void> {
    const db = getSQLiteDB()
    await db.execute('UPDATE conversations SET title = ? WHERE id = ?', [title, id])
  }

  /**
   * Update conversation messages
   */
  async updateMessages(id: string, messages: unknown[]): Promise<void> {
    const db = getSQLiteDB()
    await db.execute('UPDATE conversations SET messages_json = ?, updated_at = ? WHERE id = ?', [
      toJSON(messages),
      Date.now(),
      id,
    ])
  }

  /**
   * Convert database row to domain object
   */
  private rowToConversation(row: ConversationRow): StoredConversation {
    return {
      id: row.id,
      title: row.title,
      messages: parseJSON(row.messages_json, []),
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
