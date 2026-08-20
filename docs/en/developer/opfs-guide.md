---
title: OPFS Guide
order: 202
---

# OPFS Use-Case Guide

## 📖 What is OPFS?

**OPFS** = **Origin Private File System**

A **private, high-performance file storage API** provided by the browser:

- **Private**: only the page origin can access it; invisible to users
- **High performance**: supports synchronous read/write (`FileSystemSyncAccessHandle`)
- **Large capacity**: dynamically allocated quota, far beyond localStorage
- **Persistent**: data survives browser restarts

---

## ✅ Good OPFS Use Cases

### Case 1: Caching large analysis results ⭐⭐⭐⭐⭐

**Need**: analysis of 10,000 files can produce several MB of JSON

| Option | Problem |
|------|------|
| localStorage | only 5MB, not enough |
| IndexedDB | workable, but reads require deserializing the whole object |
| **OPFS** | ✅ streamable reads/writes, great for large data |

**User value**: reopening a folder loads results straight from cache if nothing changed — instant.

**Implementation sketch**:
```typescript
// Cache analysis results
async function cacheAnalysisResult(folderId: string, result: AnalysisResult) {
  const root = await navigator.storage.getDirectory()
  const fileHandle = await root.getFileHandle(
    `analysis_${folderId}.json`,
    { create: true }
  )
  const syncHandle = await fileHandle.createSyncAccessHandle()
  const data = new TextEncoder().encode(JSON.stringify(result))
  syncHandle.write(data)
  await syncHandle.close()
}

// Read the cache
async function loadCachedResult(folderId: string): Promise<AnalysisResult | null> {
  const root = await navigator.storage.getDirectory()
  try {
    const fileHandle = await root.getFileHandle(`analysis_${folderId}.json`)
    const file = await fileHandle.getFile()
    return JSON.parse(await file.text())
  } catch {
    return null
  }
}
```

---

### Case 2: Temporary storage for plugins processing large files ⭐⭐⭐⭐⭐

**Background**: MD5 plugins, line-count plugins need to read file contents

```
User selects a 100MB log file → plugin needs to analyze it
     ↓
Current approach: re-read the full file every time (slow)
OPFS approach: cache on first read; plugins then read from OPFS
```

**Advantages**:
- Avoids repeatedly requesting user permission
- Plugins can read synchronously in a Web Worker (OPFS `createSyncAccessHandle`)

**Implementation sketch**:
```typescript
class FileContentCache {
  async cacheFileContent(filePath: string, content: ArrayBuffer): Promise<void> {
    const root = await navigator.storage.getDirectory()
    const hash = this.hashPath(filePath)
    const fileHandle = await root.getFileHandle(`file_${hash}`, { create: true })
    const syncHandle = await fileHandle.createSyncAccessHandle()
    syncHandle.write(new Uint8Array(content))
    await syncHandle.close()
  }

  async getFileContent(filePath: string): Promise<ArrayBuffer | null> {
    const root = await navigator.storage.getDirectory()
    try {
      const fileHandle = await root.getFileHandle(`file_${this.hashPath(filePath)}`)
      const file = await fileHandle.getFile()
      return await file.arrayBuffer()
    } catch {
      return null
    }
  }
}
```

---

### Case 3: AI Agent working directory ⭐⭐⭐⭐

**Background**: the project has AI Agent features (`web/src/agent/`)

```
While an Agent executes tasks it:
- needs to write temporary files (e.g. processing results)
- needs multi-round reads/writes
- may have dependencies between files
```

**OPFS advantages**:
- Operates like a real filesystem (mkdir, writeFile, readFile)
- The Agent can clean up its temp directory when done

**Implementation sketch**:
```typescript
class AgentWorkspace {
  async createWorkspace(agentId: string): Promise<string> {
    const root = await navigator.storage.getDirectory()
    const workspaceDir = await root.getDirectoryHandle(
      `agent_${agentId}`,
      { create: true }
    )
    return `agent_${agentId}`
  }

  async writeFile(workspace: string, path: string, content: string): Promise<void> {
    const root = await navigator.storage.getDirectory()
    const workspaceDir = await root.getDirectoryHandle(workspace)
    const parts = path.split('/')
    let current = workspaceDir

    // Create directories
    for (let i = 0; i < parts.length - 1; i++) {
      current = await current.getDirectoryHandle(parts[i], { create: true })
    }

    // Write the file
    const fileName = parts[parts.length - 1]
    const fileHandle = await current.getFileHandle(fileName, { create: true })
    const syncHandle = await fileHandle.createSyncAccessHandle()
    syncHandle.write(new TextEncoder().encode(content))
    await syncHandle.close()
  }

  async cleanup(agentId: string): Promise<void> {
    const root = await navigator.storage.getDirectory()
    await root.removeEntry(`agent_${agentId}`, { recursive: true })
  }
}
```

---

### Case 4: File indexing / search acceleration ⭐⭐⭐

**Scenario**: the user wants fast content search

```
Indexing phase:
traverse folders → extract file metadata/keywords → write OPFS index files

Search phase:
read directly from OPFS index files (mmap-like experience)
```

---

### Case 5: Checkpoints for batch operations ⭐⭐⭐

**Scenario**: batch-renaming 10,000 files crashes midway

```
Use OPFS to record progress:
- write a checkpoint to OPFS every 100 files
- resume from the checkpoint after restart
```

---

## ❌ Poor OPFS Use Cases

| Scenario | Reason | Better option |
|------|------|-----------|
| Small config storage | overkill | localStorage |
| Persisting file handles | OPFS can't store handle objects | IndexedDB |
| Complex queries needed | OPFS is a filesystem, not a database | IndexedDB |
| Simple key-value store | over-engineering | localStorage / IndexedDB |

---

## 📋 Recommended Implementation Priority

| Priority | Scenario | Rationale | Estimated effort |
|--------|------|------|-----------|
| **P0** | temp cache for plugins processing large files | directly solves the pain point | 2-3 days |
| **P1** | large analysis result caching | improves reopen experience | 1-2 days |
| **P2** | AI Agent working directory | enables advanced Agent features | 3-5 days |
| **P3** | file indexing | search optimization | 5+ days |

---

## 🔧 Implementation Notes

### 1. Browser compatibility check

```typescript
export function isOFPSSupported(): boolean {
  return 'getDirectory' in navigator.storage
}

// Check before use
if (!isOFPSSupported()) {
  // Fall back to IndexedDB
  return useIndexedDBFallback()
}
```

### 2. Error handling

```typescript
async function safeOPFSOperation<T>(
  operation: () => Promise<T>,
  fallback: () => Promise<T>
): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    if (error.name === 'NotFoundError') {
      console.warn('OPFS file not found, using fallback')
    } else {
      console.error('OPFS error:', error)
    }
    return await fallback()
  }
}
```

### 3. Storage quota management

```typescript
async function checkOPFSQuota(): Promise<{ usage: number; quota: number }> {
  const estimate = await navigator.storage.estimate()
  return {
    usage: estimate.usage || 0,
    quota: estimate.quota || 0
  }
}

// Usage example
const { usage, quota } = await checkOPFSQuota()
if (usage / quota > 0.9) {
  console.warn('OPFS quota almost full, consider cleanup')
}
```

### 4. Cleanup strategy

```typescript
class OPFSCacheManager {
  // Clean expired cache entries
  async cleanExpiredCache(maxAge: number = 7 * 24 * 60 * 60 * 1000): Promise<void> {
    const root = await navigator.storage.getDirectory()
    const now = Date.now()

    for await (const entry of root.values()) {
      if (entry.kind === 'file') {
        const file = await entry.getFile()
        const lastModified = file.lastModified

        if (now - lastModified > maxAge) {
          await root.removeEntry(entry.name)
          console.log(`Cleaned up expired cache: ${entry.name}`)
        }
      }
    }
  }

  // Clear all cache
  async clearAll(): Promise<void> {
    // Note: this deletes every file in OPFS.
    // A safer approach is to delete only files with a specific prefix.
    const root = await navigator.storage.getDirectory()
    for await (const entry of root.values()) {
      if (entry.kind === 'file' && entry.name.startsWith('cache_')) {
        await root.removeEntry(entry.name)
      }
    }
  }
}
```

---

## 📚 References

- [MDN - Origin Private File System](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API#Origin_private_file_system)
- [Chrome Developers - File System Access API](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access)
- [web.dev - The File System Access API](https://web.dev/file-system-access/)

---

## 📄 Related Docs

- [Architecture Overview](./architecture-overview.md) - overall architecture
- [Environment Setup](./setup.md) - development environment
