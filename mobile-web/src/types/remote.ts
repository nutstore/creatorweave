/**
 * Remote session protocol types for mobile-web
 * Shared with web/src/remote/remote-protocol.ts
 */

// ============================================================================
// File Discovery Types
// ============================================================================

/** File entry shared between Host and Remote */
export interface FileEntry {
  path: string // Full path
  name: string // File/directory name
  type: 'file' | 'directory'
  extension?: string
  size?: number
  modified?: number
  children?: FileEntry[] // Child entries for directories
}

/** Remote requests file search */
export interface FileSearchRequest {
  type: 'file:search'
  query: string
  limit?: number // Default 50
}

/** Host returns search results */
export interface FileSearchResult {
  type: 'file:search-result'
  query: string
  results: FileEntry[]
  hasMore: boolean
}

/** Host pushes recent files to Remote */
export interface RecentFilesMessage {
  type: 'files:recent'
  files: FileEntry[]
  trigger: 'modified' | 'accessed'
}

/** Remote selects a file for @reference */
export interface FileSelectMessage {
  type: 'file:selected'
  path: string
}

// ============================================================================
// Agent Message Types
// ============================================================================

export interface AgentMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  files?: string[] // @file references
}

// ============================================================================
// Encryption Types
// ============================================================================

export type EncryptionState =
  | 'none' // Not initialized
  | 'generating' // Generating key pair
  | 'exchanging' // Exchanging public keys
  | 'ready' // Shared key derived
  | 'error' // Error occurred

export interface EncryptionStateChange {
  state: EncryptionState
  error?: string
}

// ============================================================================
// Session State Types
// ============================================================================

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting'

export type SessionRole = 'none' | 'host' | 'remote'
