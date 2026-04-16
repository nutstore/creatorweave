# SQLite Storage Architecture

Unified SQLite WASM-based storage system for CreatorWeave.

> **💡 新开发者**: 建议先阅读 [存储架构设计文档](../storage/ARCHITECTURE.md) 了解整体存储设计。

## Overview

This module replaces multiple IndexedDB databases with a single SQLite database for better query capabilities, transaction support, and data integrity.

## Installation

```bash
pnpm add @sqlite.org/sqlite-wasm
```

### Required Configuration

For OPFS VFS support, add COOP/COEP headers in your Vite config:

```typescript
// vite.config.ts
server: {
  headers: {
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp',
  },
}
```

## Migration Summary

| Old IndexedDB                       | New SQLite Table  | Repository               | New File                           |
| ----------------------------------- | ----------------- | ------------------------ | ---------------------------------- |
| `bfosa-conversations.conversations` | `conversations`   | `ConversationRepository` | `conversation.store.sqlite.ts`     |
| `bfosa-skills.skills`               | `skills`          | `SkillRepository`        | `skill-storage.sqlite.ts`          |
| `bfosa-plugins.plugins`             | `plugins`         | `PluginRepository`       | `plugin-storage.service.sqlite.ts` |
| `bfosa-security.api-keys`           | `api_keys`        | `ApiKeyRepository`       | `api-key-store.sqlite.ts`          |
| _(OPFS projects/{projectId}/workspaces/{workspaceId})_ | `workspaces` | `WorkspaceRepository` | `workspace.repository.ts` |
| _(OPFS file_metadata)_              | `file_metadata`   | `WorkspaceRepository`    | `workspace.repository.ts`          |
| _(OPFS pending_changes)_            | `pending_changes` | `WorkspaceRepository`    | `workspace.repository.ts`          |
| _(OPFS undo_records)_               | `undo_records`    | `WorkspaceRepository`    | `workspace.repository.ts`          |

**Still using IndexedDB**: `FileSystemDirectoryHandle` (requires structured clone algorithm)

## File Structure

```
web/src/
├── sqlite/
│   ├── index.ts                    # 模块导出
│   ├── README.md                   # 本文档
│   ├── sqlite-schema.sql           # 数据库 schema
│   ├── sqlite-database.ts          # 核心数据库管理器
│   ├── migration.ts                # IndexedDB → SQLite 迁移脚本
│   ├── vite-plugin-sqlite.ts       # Vite 插件（复制 WASM 文件）
│   └── repositories/
│       ├── conversation.repository.ts  # 对话存储
│       ├── skill.repository.ts         # 技能存储
│       ├── workspace.repository.ts     # 工作区/OPFS 存储
│       ├── api-key.repository.ts       # API 密钥存储
│       └── plugin.repository.ts        # 插件存储
├── storage/
│   ├── index.ts                    # 存储初始化和工具
│   └── init.ts                     # 应用存储初始化
├── store/
│   └── conversation.store.sqlite.ts  # 对话 store (SQLite 版本)
├── skills/
│   └── skill-storage.sqlite.ts      # 技能存储 (SQLite 版本)
├── security/
│   └── api-key-store.sqlite.ts      # API 密钥存储 (SQLite 版本)
└── services/
    └── plugin-storage.service.sqlite.ts  # 插件存储 (SQLite 版本)
```

## Usage

### App Initialization

```typescript
import { initStorage, setupAutoSave } from '@/storage'

// In App.tsx or main
await initStorage({
  onProgress: (progress) => console.log(progress),
})
setupAutoSave() // Auto-save on page unload
```

### Using Repositories

```typescript
import { getConversationRepository } from '@/sqlite'

const repo = getConversationRepository()

// CRUD operations
const conversations = await repo.findAll()
const conversation = await repo.findById('id')
await repo.save({ id, title, messages, createdAt, updatedAt })
await repo.delete('id')
```

## Benefits

1. **Single Database**: 所有结构化数据在一个地方
2. **SQL Queries**: 支持 JOIN、聚合等复杂查询
3. **Transactions**: ACID 保证
4. **OPFS Storage**: 更好的性能和持久化
5. **Export/Import**: 方便备份和恢复

## Notes

- 数据库文件存储在 OPFS: `/bfosa-unified.sqlite`
- 每次修改后自动保存（OpfsDb 通过 OPFS VFS 自动持久化）
- 使用 WAL 模式提高并发读性能
- Schema 通过 Vite `?raw` 导入内联，无需运行时 fetch
- **必须配置 COOP/COEP headers** 才能使用 OPFS VFS
