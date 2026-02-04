-- ============================================================================
-- Browser FOS Analyzer - Unified SQLite Schema
-- ============================================================================
-- This schema unifies storage for:
-- - Conversations (chat history)
-- - Skills (skill definitions)
-- - Plugins (WASM plugin metadata)
-- - API Keys (encrypted)
-- - Sessions (OPFS workspace metadata)
-- ============================================================================

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA user_version = 1;

-- ============================================================================
-- Conversations Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT 'New Chat',
    messages_json TEXT NOT NULL DEFAULT '[]',
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 's') * 1000),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 's') * 1000)
);

CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations(updated_at DESC);

-- ============================================================================
-- Skills Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS skills (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    version TEXT NOT NULL DEFAULT '1.0.0',
    description TEXT,
    author TEXT,
    category TEXT NOT NULL DEFAULT 'general',
    tags TEXT NOT NULL DEFAULT '[]',  -- JSON array
    source TEXT NOT NULL DEFAULT 'user',  -- 'user' | 'builtin' | 'remote'
    triggers TEXT NOT NULL DEFAULT '[]',  -- JSON array of keywords
    instruction TEXT,                     -- Markdown content
    examples TEXT,                        -- JSON array of example objects
    templates TEXT,                       -- JSON array of template objects
    raw_content TEXT,                     -- Original markdown source
    enabled INTEGER NOT NULL DEFAULT 1,   -- BOOLEAN (0 or 1)
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 's') * 1000),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 's') * 1000)
);

CREATE INDEX IF NOT EXISTS idx_skills_category ON skills(category);
CREATE INDEX IF NOT EXISTS idx_skills_source ON skills(source);
CREATE INDEX IF NOT EXISTS idx_skills_enabled ON skills(enabled);
CREATE INDEX IF NOT EXISTS idx_skills_name_lower ON skills(lower(name));

-- ============================================================================
-- Skill Resources Table (references/, scripts/, assets/ files)
-- ============================================================================
CREATE TABLE IF NOT EXISTS skill_resources (
    id TEXT PRIMARY KEY,               -- {skill_id}:{resource_path}
    skill_id TEXT NOT NULL,
    resource_path TEXT NOT NULL,       -- Relative path: "references/api-docs.md"
    resource_type TEXT NOT NULL,       -- 'reference' | 'script' | 'asset'
    content TEXT NOT NULL,
    content_type TEXT,                 -- MIME type
    size INTEGER NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 's') * 1000),
    FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_skill_resources_skill_id ON skill_resources(skill_id);
CREATE INDEX IF NOT EXISTS idx_skill_resources_type ON skill_resources(resource_type);

-- ============================================================================
-- Plugins Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS plugins (
    id TEXT PRIMARY KEY,           -- metadata.id
    name TEXT NOT NULL,
    version TEXT NOT NULL,
    api_version TEXT NOT NULL DEFAULT '2.0.0',
    description TEXT,
    author TEXT,
    capabilities_json TEXT NOT NULL DEFAULT '{}',  -- JSON object
    resource_limits_json TEXT NOT NULL DEFAULT '{}',  -- JSON object
    state TEXT NOT NULL DEFAULT 'Loaded',  -- 'Loaded' | 'Unloaded' | 'Error'
    wasm_bytes BLOB,                -- Optional: cached WASM binary
    loaded_at INTEGER NOT NULL DEFAULT (strftime('%s', 's') * 1000),
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 's') * 1000)
);

CREATE INDEX IF NOT EXISTS idx_plugins_name ON plugins(name);
CREATE INDEX IF NOT EXISTS idx_plugins_version ON plugins(version);
CREATE INDEX IF NOT EXISTS idx_plugins_loaded_at ON plugins(loaded_at);

-- ============================================================================
-- API Keys Table (encrypted)
-- ============================================================================
CREATE TABLE IF NOT EXISTS api_keys (
    provider TEXT PRIMARY KEY,      -- e.g., 'glm', 'openai', 'anthropic'
    key_name TEXT NOT NULL DEFAULT '',
    iv BLOB NOT NULL,               -- Initialization vector for AES-GCM
    ciphertext BLOB NOT NULL,       -- Encrypted key data
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 's') * 1000),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 's') * 1000)
);

-- Device encryption key (stored separately, not in main DB)
-- This table is for the encryption key metadata only
CREATE TABLE IF NOT EXISTS encryption_metadata (
    key_name TEXT PRIMARY KEY DEFAULT 'device-key',
    key_algorithm TEXT NOT NULL DEFAULT 'AES-GCM',
    key_length INTEGER NOT NULL DEFAULT 256,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 's') * 1000)
);

-- ============================================================================
-- Sessions Table (OPFS workspace metadata)
-- ============================================================================
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,            -- Session ID (matches conversation.id)
    root_directory TEXT NOT NULL UNIQUE,  -- OPFS path like /conversations/{id}
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',  -- 'active' | 'archived'
    cache_size INTEGER NOT NULL DEFAULT 0,
    pending_count INTEGER NOT NULL DEFAULT 0,
    undo_count INTEGER NOT NULL DEFAULT 0,
    modified_files INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 's') * 1000),
    last_accessed_at INTEGER NOT NULL DEFAULT (strftime('%s', 's') * 1000)
);

CREATE INDEX IF NOT EXISTS idx_sessions_root_directory ON sessions(root_directory);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_last_accessed ON sessions(last_accessed_at DESC);

-- Active session tracking
CREATE TABLE IF NOT EXISTS active_session (
    singleton_id INTEGER PRIMARY KEY DEFAULT 0,
    session_id TEXT NOT NULL,
    last_modified INTEGER NOT NULL DEFAULT (strftime('%s', 's') * 1000),
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL
);

-- Ensure only one row for singleton
-- Note: Only check singleton_id value, let PRIMARY KEY handle duplicates via INSERT OR IGNORE
CREATE TRIGGER IF NOT EXISTS active_session_singleton
    BEFORE INSERT ON active_session
    WHEN NEW.singleton_id != 0
    BEGIN
        SELECT RAISE(ABORT, 'Only one active session allowed with singleton_id=0');
    END;

-- ============================================================================
-- File Metadata Table (for OPFS workspace files)
-- ============================================================================
CREATE TABLE IF NOT EXISTS file_metadata (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    path TEXT NOT NULL,
    mtime INTEGER NOT NULL,
    size INTEGER NOT NULL,
    content_type TEXT NOT NULL,      -- 'text' | 'binary'
    hash TEXT,                        -- Optional content hash
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 's') * 1000),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 's') * 1000),
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_file_metadata_session_path ON file_metadata(session_id, path);
CREATE INDEX IF NOT EXISTS idx_file_metadata_session_id ON file_metadata(session_id);

-- ============================================================================
-- Pending Changes Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS pending_changes (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    path TEXT NOT NULL,
    type TEXT NOT NULL,              -- 'create' | 'modify' | 'delete'
    fs_mtime INTEGER NOT NULL,       -- Real file modification time
    agent_message_id TEXT,           -- Associated Agent message ID
    timestamp INTEGER NOT NULL DEFAULT (strftime('%s', 's') * 1000),
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_pending_changes_session_id ON pending_changes(session_id);
CREATE INDEX IF NOT EXISTS idx_pending_changes_timestamp ON pending_changes(timestamp);

-- ============================================================================
-- Undo Records Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS undo_records (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    path TEXT NOT NULL,
    type TEXT NOT NULL,              -- 'create' | 'modify' | 'delete'
    old_content_path TEXT,           -- Path to old content in OPFS
    new_content_path TEXT,           -- Path to new content in OPFS
    timestamp INTEGER NOT NULL DEFAULT (strftime('%s', 's') * 1000),
    undone INTEGER NOT NULL DEFAULT 0,  -- BOOLEAN
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_undo_records_session_id ON undo_records(session_id);
CREATE INDEX IF NOT EXISTS idx_undo_records_timestamp ON undo_records(timestamp);

-- ============================================================================
-- Migrations Table (Schema migrations)
-- ============================================================================
CREATE TABLE IF NOT EXISTS migrations (
    version INTEGER PRIMARY KEY,
    applied_at INTEGER NOT NULL DEFAULT (strftime('%s', 's') * 1000)
);

-- ============================================================================
-- IndexedDB Migration State Table
-- ============================================================================
-- Tracks the state of the IndexedDB → SQLite migration to handle failures
CREATE TABLE IF NOT EXISTS idb_migration_state (
    singleton_id INTEGER PRIMARY KEY DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'in_progress' | 'completed' | 'failed' | 'rolled_back'
    started_at INTEGER,
    completed_at INTEGER,
    last_error TEXT,
    conversations_migrated INTEGER DEFAULT 0,
    skills_migrated INTEGER DEFAULT 0,
    plugins_migrated INTEGER DEFAULT 0,
    api_keys_migrated INTEGER DEFAULT 0,
    sessions_migrated INTEGER DEFAULT 0
);

-- Ensure only one row for singleton
-- Note: Only check singleton_id value, let PRIMARY KEY handle duplicates via INSERT OR IGNORE
CREATE TRIGGER IF NOT EXISTS idb_migration_state_singleton
    BEFORE INSERT ON idb_migration_state
    WHEN NEW.singleton_id != 0
    BEGIN
        SELECT RAISE(ABORT, 'Only one migration state row allowed with singleton_id=0');
    END;

-- Initialize the singleton row (safe to run multiple times with OR IGNORE)
INSERT OR IGNORE INTO idb_migration_state (singleton_id, status) VALUES (0, 'pending');

-- ============================================================================
-- Views for Common Queries
-- ============================================================================

-- Active session with full info
CREATE VIEW IF NOT EXISTS v_active_session AS
    SELECT s.*, a.last_modified as active_since
    FROM sessions s
    JOIN active_session a ON s.id = a.session_id
    WHERE s.status = 'active';

-- Sessions with file counts
CREATE VIEW IF NOT EXISTS v_session_stats AS
    SELECT
        s.id,
        s.name,
        s.status,
        s.root_directory,
        s.created_at,
        s.last_accessed_at,
        COUNT(DISTINCT fm.id) as file_count,
        SUM(fm.size) as total_file_size,
        COUNT(DISTINCT pc.id) as pending_count,
        COUNT(DISTINCT ur.id) as undo_count
    FROM sessions s
    LEFT JOIN file_metadata fm ON s.id = fm.session_id
    LEFT JOIN pending_changes pc ON s.id = pc.session_id
    LEFT JOIN undo_records ur ON s.id = ur.session_id AND ur.undone = 0
    GROUP BY s.id;

-- ============================================================================
-- Triggers for Automatic Timestamps
-- ============================================================================
-- Applications should explicitly set updated_at when updating records.
-- SQLite trigger limitations prevent safe automatic timestamp updates.
