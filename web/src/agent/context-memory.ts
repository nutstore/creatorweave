/**
 * Context Memory System - Remember key information across conversation turns.
 *
 * Goals:
 * - Store and retrieve facts from conversations
 * - Learn user preferences
 * - Inject relevant memories into system prompts
 *
 * Architecture:
 * 1. FactExtractor - Extract key facts from messages
 * 2. MemoryStorage - Persistent storage in IndexedDB
 * 3. MemoryRetrieval - Retrieve relevant memories
 * 4. PreferenceLearner - Learn user preferences
 */

//=============================================================================
// Types
//=============================================================================

/** Memory entry types */
export type MemoryType =
  | 'fact'
  | 'preference'
  | 'file-reference'
  | 'code-pattern'
  | 'user-context'
  | 'project-detail'

/** Memory importance levels */
export type MemoryImportance = 'low' | 'medium' | 'high' | 'critical'

/** Stored memory entry */
export interface MemoryEntry {
  /** Unique ID */
  id: string
  /** Type of memory */
  type: MemoryType
  /** Content/key */
  key: string
  /** Value/detail */
  value: string
  /** Importance level */
  importance: MemoryImportance
  /** Associated file path (if applicable) */
  filePath?: string
  /** Timestamp created */
  createdAt: number
  /** Timestamp last accessed */
  lastAccessed: number
  /** Access count (for importance decay) */
  accessCount: number
  /** Associated session ID */
  sessionId?: string
  /** Tags for retrieval */
  tags: string[]
}

/** Extracted fact from a message */
export interface ExtractedFact {
  key: string
  value: string
  type: MemoryType
  importance: MemoryImportance
  filePath?: string
  tags: string[]
}

/** User preference */
export interface UserPreference {
  category: string
  key: string
  value: string
  confidence: number
}

/** Memory query result */
export interface MemoryQuery {
  /** Query text */
  query?: string
  /** Memory type filter */
  types?: MemoryType[]
  /** File path filter */
  filePath?: string
  /** Minimum importance */
  minImportance?: MemoryImportance
  /** Max results */
  maxResults?: number
}

/** Context for memory injection */
export interface MemoryContext {
  /** Current file being discussed */
  activeFile?: string
  /** Recent user messages */
  recentMessages: string[]
  /** Current project type */
  projectType?: string
  /** Session ID */
  sessionId?: string
}

//=============================================================================
// Fact Extractor
//=============================================================================

/**
 * Patterns for fact extraction from messages
 */
const EXTRACTION_PATTERNS = {
  // File references: "the file foo.ts", "in bar.ts"
  fileReference: [
    /(?:the |in |for )?file ['"`]?([a-zA-Z0-9_\-./]+\.[a-zA-Z0-9]+)['"`]?/gi,
    /(?:open|read|edit|check) ['"`]?([a-zA-Z0-9_\-./]+\.[a-zA-Z0-9]+)['"`]?/gi,
  ],

  // Code patterns: "function handleClick", "class User"
  codePattern: [
    /function\s+(\w+)/gi,
    /class\s+(\w+)/gi,
    /const\s+(\w+)\s*=\s*\(/gi, // Hooks, etc.
    /interface\s+(\w+)/gi,
    /type\s+(\w+)\s*=/gi,
  ],

  // User preferences: "I prefer", "I like", "I use"
  preference: [
    /i\s+(?:prefer|like|use|want)\s+(.+)/gi,
    /(?:use|prefer)\s+['"`]?(.+?)['"`]?\s+instead/gi,
  ],

  // Project details: "this is a React app", "using TypeScript"
  projectDetail: [
    /this\s+is\s+(?:a|an)\s+(\w+(?:\s+\w+)?)/gi,
    /using\s+(\w+)/gi,
    /built\s+(?:with|in)\s+(\w+)/gi,
  ],

  // User context: "I'm a developer", "I'm working on"
  userContext: [/i['']?m\s+(?:a|an|the)\s+(\w+(?:\s+\w+)?)/gi, /working\s+on\s+(.+)/gi],
}

export class FactExtractor {
  /**
   * Extract facts from a message
   */
  extract(message: string, _context: Partial<MemoryContext> = {}): ExtractedFact[] {
    const facts: ExtractedFact[] = []
    // Convert to lowercase for pattern matching (used in extractByPattern)
    // Void to avoid unused variable warning
    void message.toLowerCase()

    // Extract file references
    const fileRefs = this.extractByPattern(message, EXTRACTION_PATTERNS.fileReference)
    for (const ref of fileRefs) {
      facts.push({
        key: `file:${ref}`,
        value: ref,
        type: 'file-reference',
        importance: 'medium',
        filePath: ref,
        tags: ['file', 'reference'],
      })
    }

    // Extract code patterns
    const codePatterns = this.extractByPattern(message, EXTRACTION_PATTERNS.codePattern)
    for (const pattern of codePatterns) {
      facts.push({
        key: `code:${pattern}`,
        value: pattern,
        type: 'code-pattern',
        importance: 'low',
        tags: ['code', 'definition'],
      })
    }

    // Extract preferences
    const prefs = this.extractByPattern(message, EXTRACTION_PATTERNS.preference)
    for (const pref of prefs) {
      facts.push({
        key: `pref:${pref.slice(0, 30)}`,
        value: pref,
        type: 'preference',
        importance: 'high',
        tags: ['preference', 'user'],
      })
    }

    // Extract project details
    const projectDetails = this.extractByPattern(message, EXTRACTION_PATTERNS.projectDetail)
    for (const detail of projectDetails) {
      facts.push({
        key: `project:${detail}`,
        value: detail,
        type: 'project-detail',
        importance: 'medium',
        tags: ['project', 'context'],
      })
    }

    // Extract user context
    const userContexts = this.extractByPattern(message, EXTRACTION_PATTERNS.userContext)
    for (const ctx of userContexts) {
      facts.push({
        key: `user:${ctx}`,
        value: ctx,
        type: 'user-context',
        importance: 'high',
        tags: ['user', 'identity'],
      })
    }

    return this.deduplicateFacts(facts)
  }

  /**
   * Extract using regex patterns
   */
  private extractByPattern(message: string, patterns: RegExp[]): string[] {
    const results: string[] = []

    for (const pattern of patterns) {
      const matches = message.matchAll(pattern)
      for (const match of matches) {
        if (match[1]) {
          results.push(match[1].trim())
        }
      }
    }

    return results
  }

  /**
   * Deduplicate facts
   */
  private deduplicateFacts(facts: ExtractedFact[]): ExtractedFact[] {
    const seen = new Set<string>()
    return facts.filter((fact) => {
      const key = `${fact.type}:${fact.value}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }

  /**
   * Score importance of a fact
   */
  scoreImportance(fact: ExtractedFact, context: Partial<MemoryContext>): MemoryImportance {
    // User preferences are always important
    if (fact.type === 'preference') return 'high'

    // File references related to active file
    if (fact.type === 'file-reference' && fact.filePath === context.activeFile) {
      return 'high'
    }

    // Code patterns are low importance
    if (fact.type === 'code-pattern') return 'low'

    // Default
    return fact.importance
  }
}

//=============================================================================
// Memory Storage (IndexedDB)
//=============================================================================

const DB_NAME = 'context-memory'
const DB_VERSION = 1
const STORE_NAME = 'memories'

class MemoryStorage {
  private db: IDBDatabase | null = null
  private initPromise: Promise<void> | null = null

  /**
   * Initialize IndexedDB
   */
  async init(): Promise<void> {
    if (this.initPromise) return this.initPromise

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        this.db = request.result
        resolve()
      }

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result

        // Create memories store
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
          store.createIndex('type', 'type', { unique: false })
          store.createIndex('key', 'key', { unique: false })
          store.createIndex('sessionId', 'sessionId', { unique: false })
          store.createIndex('createdAt', 'createdAt', { unique: false })
          store.createIndex('importance', 'importance', { unique: false })
        }
      }
    })

    return this.initPromise
  }

  /**
   * Store a memory entry
   */
  async store(
    memory: Omit<MemoryEntry, 'id' | 'createdAt' | 'lastAccessed' | 'accessCount'>
  ): Promise<string> {
    await this.init()

    const entry: MemoryEntry = {
      ...memory,
      id: this.generateId(),
      createdAt: Date.now(),
      lastAccessed: Date.now(),
      accessCount: 0,
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.add(entry)

      request.onsuccess = () => resolve(entry.id)
      request.onerror = () => reject(request.error)
    })
  }

  /**
   * Retrieve a memory by ID
   */
  async retrieve(id: string): Promise<MemoryEntry | null> {
    await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.get(id)

      request.onsuccess = () => {
        if (request.result) {
          // Update access stats
          this.updateAccessStats(id)
          resolve(request.result)
        } else {
          resolve(null)
        }
      }
      request.onerror = () => reject(request.error)
    })
  }

  /**
   * Query memories
   */
  async query(query: MemoryQuery): Promise<MemoryEntry[]> {
    await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly')
      const store = transaction.objectStore(STORE_NAME)

      // Build query
      const results: MemoryEntry[] = []

      // If filtering by type, use index
      let index: IDBIndex | null = null
      if (query.types && query.types.length === 1) {
        index = store.index('type')
      }

      const range = IDBKeyRange.lowerBound(0)
      const request = (index || store).openCursor(range)

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result
        if (cursor) {
          const memory = cursor.value as MemoryEntry

          // Apply filters
          if (query.types && !query.types.includes(memory.type)) {
            cursor.continue()
            return
          }

          if (query.filePath && memory.filePath !== query.filePath) {
            cursor.continue()
            return
          }

          if (
            query.minImportance &&
            !this.isImportanceAtLeast(memory.importance, query.minImportance)
          ) {
            cursor.continue()
            return
          }

          results.push(memory)

          if (query.maxResults && results.length >= query.maxResults) {
            resolve(results)
          } else {
            cursor.continue()
          }
        } else {
          resolve(results)
        }
      }

      request.onerror = () => reject(request.error)
    })
  }

  /**
   * Search memories by content (fuzzy search)
   */
  async search(queryText: string, maxResults = 10): Promise<MemoryEntry[]> {
    await this.init()

    const query = queryText.toLowerCase()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.openCursor()

      const results: Array<{ memory: MemoryEntry; score: number }> = []

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result
        if (cursor) {
          const memory = cursor.value as MemoryEntry

          // Calculate relevance score
          let score = 0
          const key = memory.key.toLowerCase()
          const value = memory.value.toLowerCase()

          // Exact match in key
          if (key.includes(query)) score += 10

          // Partial match in key
          if (query.split(' ').some((word) => key.includes(word))) score += 5

          // Match in value
          if (value.includes(query)) score += 3

          // Match in tags
          if (memory.tags.some((tag) => tag.toLowerCase().includes(query))) score += 2

          // Decay by age (older memories less relevant)
          const age = Date.now() - memory.createdAt
          const ageFactor = Math.max(0, 1 - age / (30 * 24 * 60 * 60 * 1000)) // 30 days
          score *= ageFactor

          if (score > 0) {
            results.push({ memory, score })
          }

          cursor.continue()
        } else {
          // Sort by score and return top results
          results.sort((a, b) => b.score - a.score)
          resolve(results.slice(0, maxResults).map((r) => r.memory))
        }
      }

      request.onerror = () => reject(request.error)
    })
  }

  /**
   * Delete a memory
   */
  async delete(id: string): Promise<void> {
    await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.delete(id)

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  /**
   * Clear old memories (cleanup)
   */
  async cleanup(olderThanDays = 30): Promise<number> {
    await this.init()

    const cutoff = Date.now() - olderThanDays * 24 * 60 * 60 * 1000

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.openCursor()

      let deleted = 0

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result
        if (cursor) {
          const memory = cursor.value as MemoryEntry

          // Delete old memories with low importance
          if (
            memory.createdAt < cutoff &&
            (memory.importance === 'low' || memory.accessCount < 2)
          ) {
            cursor.delete()
            deleted++
          }

          cursor.continue()
        } else {
          resolve(deleted)
        }
      }

      request.onerror = () => reject(request.error)
    })
  }

  /**
   * Update access statistics
   */
  private updateAccessStats(id: string): void {
    if (!this.db) return

    const transaction = this.db.transaction([STORE_NAME], 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const getRequest = store.get(id)

    getRequest.onsuccess = () => {
      const memory = getRequest.result as MemoryEntry | undefined
      if (memory) {
        memory.lastAccessed = Date.now()
        memory.accessCount++
        store.put(memory)
      }
    }
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `mem_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
  }

  /**
   * Compare importance levels
   */
  private isImportanceAtLeast(level: MemoryImportance, min: MemoryImportance): boolean {
    const levels = { low: 1, medium: 2, high: 3, critical: 4 }
    return levels[level] >= levels[min]
  }
}

//=============================================================================
// Memory Retrieval
//=============================================================================

export class MemoryRetrieval {
  private storage: MemoryStorage

  constructor() {
    this.storage = new MemoryStorage()
  }

  /**
   * Get relevant memories for context
   */
  async getRelevantMemories(context: MemoryContext, maxResults = 5): Promise<MemoryEntry[]> {
    const memories: MemoryEntry[] = []

    // Get memories for active file
    if (context.activeFile) {
      const fileMemories = await this.storage.query({
        filePath: context.activeFile,
        minImportance: 'medium',
        maxResults: 2,
      })
      memories.push(...fileMemories)
    }

    // Get recent user preferences
    const prefs = await this.storage.query({
      types: ['preference'],
      minImportance: 'high',
      maxResults: 2,
    })
    memories.push(...prefs)

    // Get project details if project type specified
    if (context.projectType) {
      const projectMemories = await this.storage.query({
        types: ['project-detail'],
        maxResults: 1,
      })
      memories.push(...projectMemories)
    }

    // Search based on recent messages
    if (context.recentMessages.length > 0) {
      const searchQuery = context.recentMessages[context.recentMessages.length - 1]
      const searchResults = await this.storage.search(searchQuery, maxResults)
      memories.push(
        ...searchResults.filter((m) => !memories.some((existing) => existing.id === m.id))
      )
    }

    // Deduplicate and limit
    const unique = Array.from(new Map(memories.map((m) => [m.id, m])).values())
    return unique.slice(0, maxResults)
  }

  /**
   * Format memories for system prompt injection
   */
  formatForPrompt(memories: MemoryEntry[]): string {
    if (memories.length === 0) return ''

    let output = `\n## Context from Previous Conversations\n\n`

    // Group by type
    const grouped = this.groupByType(memories)

    // User preferences
    if (grouped.preference.length > 0) {
      output += `**User Preferences:**\n`
      for (const mem of grouped.preference) {
        output += `- ${mem.value}\n`
      }
      output += '\n'
    }

    // File references
    if (grouped['file-reference'].length > 0) {
      output += `**Previously Discussed Files:**\n`
      for (const mem of grouped['file-reference']) {
        output += `- \`${mem.value}\`\n`
      }
      output += '\n'
    }

    // Project details
    if (grouped['project-detail'].length > 0) {
      output += `**Project Details:**\n`
      for (const mem of grouped['project-detail']) {
        output += `- ${mem.value}\n`
      }
      output += '\n'
    }

    // User context
    if (grouped['user-context'].length > 0) {
      output += `**About the User:**\n`
      for (const mem of grouped['user-context']) {
        output += `- ${mem.value}\n`
      }
    }

    return output
  }

  /**
   * Group memories by type
   */
  private groupByType(memories: MemoryEntry[]): Record<string, MemoryEntry[]> {
    const grouped: Record<string, MemoryEntry[]> = {}

    for (const mem of memories) {
      if (!grouped[mem.type]) grouped[mem.type] = []
      grouped[mem.type].push(mem)
    }

    return grouped
  }
}

//=============================================================================
// Preference Learner
//=============================================================================

export class PreferenceLearner {
  private storage: MemoryStorage
  private extractor: FactExtractor

  constructor() {
    this.storage = new MemoryStorage()
    this.extractor = new FactExtractor()
  }

  /**
   * Learn from user message
   */
  async learn(message: string, context: Partial<MemoryContext> = {}): Promise<void> {
    const facts = this.extractor.extract(message, context)

    for (const fact of facts) {
      // Skip low-importance facts
      if (fact.importance === 'low') continue

      await this.storage.store({
        type: fact.type,
        key: fact.key,
        value: fact.value,
        importance: this.extractor.scoreImportance(fact, context),
        filePath: fact.filePath,
        sessionId: context.sessionId,
        tags: fact.tags,
      })
    }
  }

  /**
   * Get learned preferences
   */
  async getPreferences(): Promise<UserPreference[]> {
    const memories = await this.storage.query({
      types: ['preference'],
      minImportance: 'medium',
    })

    return memories.map((m) => ({
      category: m.tags[0] || 'general',
      key: m.key,
      value: m.value,
      confidence: this.calculateConfidence(m),
    }))
  }

  /**
   * Calculate confidence score for a preference
   */
  private calculateConfidence(memory: MemoryEntry): number {
    let score = 0.5 // Base confidence

    // Increase with access count
    score += Math.min(memory.accessCount * 0.1, 0.3)

    // Decrease with age
    const age = Date.now() - memory.createdAt
    const ageFactor = Math.max(0, 1 - age / (90 * 24 * 60 * 60 * 1000)) // 90 days
    score *= ageFactor

    return Math.min(score, 1)
  }
}

//=============================================================================
// Context Memory Manager (Main API)
//=============================================================================

export class ContextMemoryManager {
  private retrieval: MemoryRetrieval
  private learner: PreferenceLearner
  private storage: MemoryStorage

  constructor() {
    this.retrieval = new MemoryRetrieval()
    this.learner = new PreferenceLearner()
    this.storage = new MemoryStorage()
  }

  /**
   * Process a message and store extracted facts
   */
  async processMessage(message: string, context: Partial<MemoryContext> = {}): Promise<void> {
    await this.learner.learn(message, context)
  }

  /**
   * Get relevant memories for system prompt
   */
  async getMemoriesForPrompt(context: MemoryContext): Promise<string> {
    const memories = await this.retrieval.getRelevantMemories(context)
    return this.retrieval.formatForPrompt(memories)
  }

  /**
   * Search memories
   */
  async search(query: string, maxResults = 10): Promise<MemoryEntry[]> {
    return this.storage.search(query, maxResults)
  }

  /**
   * Cleanup old memories
   */
  async cleanup(olderThanDays = 30): Promise<number> {
    return this.storage.cleanup(olderThanDays)
  }

  /**
   * Clear all memories
   */
  async clearAll(): Promise<void> {
    await this.storage.init()
    // Note: This would delete all data - use with caution
    // Implementation depends on whether we want this capability
  }
}

//=============================================================================
// Singleton
//=============================================================================

let instance: ContextMemoryManager | null = null

export function getContextMemoryManager(): ContextMemoryManager {
  if (!instance) {
    instance = new ContextMemoryManager()
  }
  return instance
}

//=============================================================================
// Helper Functions
//=============================================================================

/**
 * Get memory block for system prompt injection
 */
export async function getMemoryBlockForPrompt(context: MemoryContext): Promise<string> {
  const manager = getContextMemoryManager()
  return manager.getMemoriesForPrompt(context)
}
