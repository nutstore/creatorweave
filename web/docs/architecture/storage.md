# Storage Architecture

> **Target Audience**: New developers joining the project
>
> **Reading Time**: 10-15 minutes
>
> **Last Updated**: 2025-02-04

---

## TL;DR

This project uses a **three-tier storage architecture**: Zustand (in-memory state) + SQLite (structured metadata) + OPFS (large file content), following the classic "metadata + content separation" pattern used in media libraries and video platforms.

```
┌─────────────────────────────────────────────────────────────────┐
│                    Data Storage Layers                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────┐    ┌──────────────────┐    ┌───────────┐ │
│  │   Zustand       │    │    SQLite        │    │   OPFS    │ │
│  │   (Runtime)      │    │  (Metadata)      │    │ (Files)   │ │
│  │   + localStorage│    │  (OPFS VFS)      │    │           │ │
│  └─────────────────┘    └──────────────────┘    └───────────┘ │
│         │                      │                    │          │
│         │                      │                    │          │
└─────────┼──────────────────────┼────────────────────┼──────────┘
          │                      │                    │
       Fast                  Complex Queries       Large Files
       Access                Relational Ops        File System API
                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Table of Contents

1. [Design Principles](#design-principles)
2. [Storage Layers Overview](#storage-layers-overview)
3. [Data Classification](#data-classification)
4. [Detailed Data Distribution](#detailed-data-distribution)
5. [Undo System Design](#undo-system-design)
6. [Data Flow](#data-flow)
7. [Common Questions](#common-questions)

---

## Design Principles

### 1. Metadata + Content Separation

This is the core design pattern, consistent with industry best practices:

| Use Case         | Metadata Storage          | Content Storage         |
| ---------------- | ------------------------- | ----------------------- |
| Media Library    | MySQL (photo metadata)    | S3/OSS (photo files)    |
| Video Platform   | PostgreSQL (video info)   | CDN (video files)       |
| **This Project** | **SQLite (undo records)** | **OPFS (file content)** |

**Why this design?**

- Database stays lightweight and fast
- Large files don't slow down database performance
- Backup strategies can be separated (frequent DB backups, lifecycle policies for files)

### 2. Persistence Strategy

```
┌─────────────────────────────────────────────────────────────┐
│  Data Persistence Decision Tree                                   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Does data need to persist?                                  │
│     NO ──→ Zustand (memory only, lost on refresh)                │
│      │                                                      │
│      YES                                                    │
│      │                                                      │
│  Does it need encryption?                                   │
│     YES ──→ SQLite (api_keys table, AES-GCM encrypted)        │
│      │                                                      │
│      NO                                                    │
│      │                                                      │
│  Does it need complex queries/relationships?                   │
│     YES ──→ SQLite (conversations, skills, sessions)        │
│      │                                                      │
│      NO                                                    │
│      │                                                      │
│  Is it large binary/file content?                            │
│     YES ──→ OPFS (actual file system)                       │
│      │                                                      │
│      NO                                                    │
│      │                                                      │
│  Is it simple configuration?                                 │
│     YES ──→ Zustand + localStorage (settings)                 │
│      │                                                      │
│      NO                                                    │
│      └──→ Zustand (memory only)                            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 3. Session Isolation

Each conversation has isolated:

- Row in SQLite tables
- OPFS file workspace (`/conversations/{id}/`)
- Runtime state (AgentLoop, StreamingQueue)

---

## Storage Layers Overview

### Layer Comparison

| Layer            | Technology        | Purpose         | Persisted           |
| ---------------- | ----------------- | --------------- | ------------------- |
| **L1: Memory**   | Zustand Stores    | Runtime state   | ❌ Lost on refresh  |
| **L2: Config**   | localStorage      | User settings   | ✅ Survives refresh |
| **L3: Metadata** | SQLite (OPFS VFS) | Structured data | ✅ Persisted        |
| **L4: Content**  | OPFS              | File content    | ✅ Persisted        |

### Technology Rationale

| Storage          | Technology         | Rationale                                      |
| ---------------- | ------------------ | ---------------------------------------------- |
| User Settings    | localStorage       | Simple key-value, native browser support       |
| Directory Handle | IndexedDB          | `FileSystemDirectoryHandle` requires IndexedDB |
| Conversations    | SQLite             | Needs persistence, queries, relational ops     |
| API Keys         | SQLite (encrypted) | Security first                                 |
| Undo Metadata    | SQLite             | Needs queries, sorting                         |
| Undo Content     | OPFS               | Large content, filesystem semantics            |

---

## Data Classification

### Classification Decision Table

| Data Category       | Examples                        | Storage Location   | Reason                      |
| ------------------- | ------------------------------- | ------------------ | --------------------------- |
| **User Config**     | LLM model, temperature          | localStorage       | Simple config, fast read    |
| **Runtime State**   | Streaming output, AgentLoop     | Zustand (memory)   | Current session only        |
| **Relational Data** | Conversations, skills, sessions | SQLite             | Needs queries & persistence |
| **Sensitive Data**  | API Keys                        | SQLite (encrypted) | Security priority           |
| **Large Content**   | Undo history files              | OPFS               | Not suitable for DB         |

### Data Size Considerations

```
┌─────────────────────────────────────────────────────────────┐
│  Data Size vs Storage Choice                                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  < 1 KB        → SQLite / localStorage (anywhere works)        │
│  1 KB - 100 KB  → SQLite (IndexedDB works too, but SQLite faster) │
│  100 KB - 10 MB → OPFS (database would get slow)               │
│  > 10 MB       → Must use OPFS (DB/storage has size limits)     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Detailed Data Distribution

### 1. Zustand Stores (Memory + Optional Persistence)

| Store          | Persistence  | Content                  | Survives Refresh |
| -------------- | ------------ | ------------------------ | ---------------- |
| `settings`     | localStorage | LLM config               | ✅               |
| `agent`        | IndexedDB    | Directory handle         | ✅               |
| `conversation` | -            | Runtime state, AgentLoop | ❌               |
| `session`      | SQLite sync  | Session runtime state    | ❌               |
| `skills`       | SQLite sync  | Skills runtime state     | ❌               |
| `undo`         | OPFS sync    | Undo runtime state       | ❌               |

**Note**: `conversation`/`session`/`skills`/`undo` stores load data from SQLite/OPFS into memory, but actual persistence is in SQLite/OPFS.

### 2. SQLite Tables

| Table             | Content                       | Size Estimate     | Query Frequency |
| ----------------- | ----------------------------- | ----------------- | --------------- |
| `conversations`   | Chat history, messages JSON   | 1 KB - 100 KB/row | High            |
| `skills`          | Skill definitions, categories | 1 KB - 10 KB/row  | Medium          |
| `skill_resources` | Skill resource files          | 1 KB - 1 MB/row   | Medium          |
| `api_keys`        | Encrypted API keys            | < 1 KB/row        | Low             |
| `sessions`        | Session metadata              | < 1 KB/row        | High            |
| `file_metadata`   | File metadata                 | < 1 KB/row        | Medium          |
| `pending_changes` | Pending sync queue            | < 1 KB/row        | High            |
| `undo_records`    | Undo records (paths only)     | < 1 KB/row        | High            |

**Key Design**: `undo_records` table stores only path strings (`old_content_path`, `new_content_path`), not actual content.

### 3. OPFS File Structure

```
/conversations/{conversationId}/
├── cache/                    # File cache
│   └── path/to/file.txt    # Actual file content
├── undo/                     # Undo history
│   ├── undo.json            # Undo index
│   └── {undo_id}/           # Each undo record
│       ├── old              # Content before modification
│       └── new              # Content after modification
└── session.json             # Session metadata
```

**Why undo content in OPFS?**

An undo record may contain several MB of file content:

- SQLite storing 10 MB BLOBs significantly impacts performance
- OPFS is designed for filesystem operations
- Load on demand: only read content when executing undo/redo

---

## Undo System Design

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│  Data Flow for Undo Operations                                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  User modifies src/main.ts:                                   │
│                                                             │
│  1. Read old content ───► OPFS: /conversations/conv1/cache/src/main.ts  │
│                                                             │
│  2. Write new content ────► OPFS: /conversations/conv1/cache/src/main.ts  │
│                                                             │
│  3. Record undo metadata ──► SQLite: undo_records table              │
│                     {                                          │
│                       id: "undo_abc",                        │
│                       path: "src/main.ts",                   │
│                       old_content_path: "/undo/undo_abc/old",││
│                       new_content_path: "/undo/undo_abc/new",││
│                       timestamp: 1704067200000               │
│                     }                                          │
│                                                             │
│  4. Save undo content ────► OPFS: /conversations/conv1/undo/undo_abc/  │
│                     ├── old  (old file content, possibly MBs)    │
│                     └── new  (new file content, possibly MBs)    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Why This Design?

| Factor                 | All in SQLite         | All in OPFS                  | Hybrid Approach                 |
| ---------------------- | --------------------- | ---------------------------- | ------------------------------- |
| **Query Performance**  | ❌ BLOBs slow queries | ❌ No SQL queries            | ✅ Lightweight metadata queries |
| **Storage Efficiency** | ❌ Database bloat     | ✅ Filesystem friendly       | ✅ Path strings are tiny        |
| **Undo List Display**  | ✅ SQL queries easy   | ❌ Must traverse directories | ✅ Direct table query           |
| **Executing Undo**     | ✅ Read from database | ❌ Must parse files          | ✅ Read from OPFS by path       |
| **Backup Strategy**    | ❌ Large backup files | ✅ Filesystem backup         | ✅ Separate backup policies     |

---

## Data Flow

### Typical Operation Flows

#### Scenario 1: User Changes Settings

```
User Action                      Data Flow
────────────────────────────────────────
Change LLM model
    ↓
Settings Store (memory)
    ↓
localStorage (auto-persisted)
    ↓
[Page Refresh]
    ↓
Load from localStorage → Settings Store
```

#### Scenario 2: Agent Sends Message

```
User sends message
    ↓
ConversationView (memory)
    ↓
runAgent() → Create AgentLoop
    ↓
LLM response streams in
    ↓
[Streaming State] → Zustand Store (memory only, not persisted)
[Complete Message] → SQLite conversations table (persisted)
```

#### Scenario 3: Agent Modifies File

```
Agent calls file-edit tool
    ↓
SessionWorkspace.writeFile()
    ↓
┌─────────────────────────────────────────────────────────┐
│  Parallel Operations:                                      │
│                                                           │
│  1. Save old content → OPFS /undo/{id}/old              │
│  2. Save new content → OPFS /undo/{id}/new              │
│  3. Write cache      → OPFS /cache/{path}               │
│  4. Record metadata  → SQLite undo_records              │
│  5. Add to queue      → SQLite pending_changes            │
└─────────────────────────────────────────────────────────┘
```

#### Scenario 4: User Executes Undo

```
User clicks undo button
    ↓
UndoStore.undo(recordId)
    ↓
┌─────────────────────────────────────────────────────────┐
│  Execution Flow:                                         │
│                                                           │
│  1. Query undo record → SQLite undo_records            │
│     SELECT * FROM undo_records WHERE id = ?             │
│                                                           │
│  2. Read old content → OPFS /undo/{id}/old              │
│                                                           │
│  3. Restore file    → OPFS /cache/{path}                │
│                                                           │
│  4. Update status    → SQLite undo_records (undone = true) │
│                                                           │
│  5. Refresh UI       → Zustand Store                     │
│                                                           │
└─────────────────────────────────────────────────────────┘
```

---

## Common Questions

### Q1: Why not use a single storage solution?

**A**: Each technology has its strengths:

| Requirement        | Best Option      | Poor Choice                   |
| ------------------ | ---------------- | ----------------------------- |
| Fast config reads  | localStorage     | SQLite (overkill)             |
| Complex queries    | SQLite           | localStorage (no support)     |
| Large file storage | OPFS             | localStorage (5MB limit)      |
| Runtime state      | Memory (Zustand) | Any persistence (unnecessary) |

### Q2: Can SQLite data be lost?

**A**: No. SQLite uses OPFS VFS, persisting to the browser's Origin Private File System at the same level as site data.

```
OPFS Persistence Level:
┌─────────────────────────────────────────────────────────┐
│  Clear site data → Data lost                                    │
│  Clear browser data → Data lost                              │
│  Normal use/refresh → Data preserved                           │
│  Close & reopen browser → Data preserved                     │
└─────────────────────────────────────────────────────────┘
```

### Q3: localStorage vs SQLite - how to choose?

**A**: Decision factors:

| Factor              | localStorage          | SQLite                 |
| ------------------- | --------------------- | ---------------------- |
| Data size           | < 5 MB (quota limit)  | Unlimited (OPFS limit) |
| Query capabilities  | Key-value only        | SQL (JOINs, indexes)   |
| Transaction support | ❌                    | ✅ ACID                |
| Synchronous reads   | ✅                    | ❌ Async only          |
| Use case            | Simple configurations | Structured data        |

### Q4: Why split undo history across two locations?

**A**: Classic "metadata + content" separation pattern:

```
SQLite (Lightweight Metadata)    OPFS (Actual Content)
┌─────────────────┐            ┌─────────────────┐
│ undo_records table │            │ /undo/{id}/     │
│ - id              │            │   ├── old        │
│ - path            │            │   └── new        │
│ - timestamp       │            │                  │
│ - old_content_path │◄──────────┘ (path reference)
│ - new_content_path │
└─────────────────┘

Benefits:
1. Fast undo list queries (metadata only, no content loading)
2. Lightweight database (no large file BLOBs)
3. Load on demand (only read files when executing undo)
```

---

## Developer Guide

### Adding New Persistent Data

**Step 1**: Classify the data type

```
Is it user configuration?
 YES → Zustand + localStorage

Is it runtime state?
 YES → Zustand (memory only)

Does it need queries/relationships?
 YES → SQLite (create table + repository)

Is it large file content?
 YES → OPFS (consider if metadata needed in SQLite)
```

**Step 2**: After choosing storage, reference existing implementations

- **localStorage**: See `settings.store.ts`
- **SQLite**: See `sqlite-schema.sql` + `repositories/`
- **OPFS**: See `opfs/session/` implementations

### Data Reading Priority

```
1. Check Zustand Store first (memory is fastest)
2. If not available, load from SQLite/OPFS
3. If still not available, return default value
```

---

## Related Documentation

- [OPFS Session System](../../src/opfs/README.md) - Session system details
- [SQLite Storage](../../src/sqlite/README.md) - SQLite usage guide
- [Undo System Implementation](../../src/opfs/session/session-undo.ts) - Undo storage implementation
