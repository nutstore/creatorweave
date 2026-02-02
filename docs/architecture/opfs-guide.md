# OPFS 使用场景指南

## 📖 什么是 OPFS？

**OPFS** = **Origin Private File System**（源站私有文件系统）

浏览器提供的一个**私有、高性能的文件存储 API**，特点：
- **私有性**：只有页面源站可访问，对用户不可见
- **高性能**：支持同步读写（`FileSystemSyncAccessHandle`）
- **大容量**：配额动态分配，远超 localStorage
- **持久化**：数据持久保存，不因关闭浏览器而丢失

---

## ✅ OPFS 适合的使用场景

### 场景 1：大文件分析结果缓存 ⭐⭐⭐⭐⭐

**需求**：分析 10,000 个文件的结果可能是几 MB 的 JSON 数据

| 方案 | 问题 |
|------|------|
| localStorage | 只有 5MB，不够用 |
| IndexedDB | 可行，但读取需要反序列化整个对象 |
| **OPFS** | ✅ 可流式读写，适合大数据 |

**用户价值**：重新打开文件夹时，如果内容没变，直接从缓存读取结果，秒开。

**实现思路**：
```typescript
// 缓存分析结果
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

// 读取缓存
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

### 场景 2：插件处理大文件的临时存储 ⭐⭐⭐⭐⭐

**背景**：MD5 插件、行数统计插件需要读取文件内容

```
用户选择 100MB 的 log 文件 → 插件需要分析
     ↓
当前方案：每次重新读取全文（慢）
OPFS 方案：首次读取后缓存到 OPFS，插件直接从 OPFS 读取
```

**优势**：
- 避免重复请求用户授权
- 插件可以在 Web Worker 中同步读取（OPFS 的 `createSyncAccessHandle`）

**实现思路**：
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

### 场景 3：AI Agent 的工作目录 ⭐⭐⭐⭐

**背景**：项目有 AI Agent 功能（`web/src/agent/`）

```
Agent 执行任务时：
- 需要写入临时文件（如处理结果）
- 需要多轮读取/写入
- 文件之间可能有依赖关系
```

**OPFS 优势**：
- 可以像真实文件系统一样操作（mkdir, writeFile, readFile）
- Agent 执行完可以清理临时目录

**实现思路**：
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

    // 创建目录
    for (let i = 0; i < parts.length - 1; i++) {
      current = await current.getDirectoryHandle(parts[i], { create: true })
    }

    // 写入文件
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

### 场景 4：文件索引/搜索加速 ⭐⭐⭐

**场景**：用户想快速搜索文件内容

```
建立索引阶段：
遍历文件夹 → 提取文件元数据/关键词 → 写入 OPFS 索引文件

搜索阶段：
直接从 OPFS 索引文件读取（mmap 式体验）
```

---

### 场景 5：批量操作的断点续传 ⭐⭐⭐

**场景**：批量重命名 10,000 个文件，中途崩溃

```
使用 OPFS 记录进度：
- 每处理 100 个文件，checkpoint 写入 OPFS
- 重启后从 checkpoint 恢复
```

---

## ❌ 不适合 OPFS 的场景

| 场景 | 原因 | 更好的方案 |
|------|------|-----------|
| 小配置存储 | 太重 | localStorage |
| 文件句柄持久化 | OPFS 存不了句柄对象 | IndexedDB |
| 需要复杂查询 | OPFS 是文件系统，不是数据库 | IndexedDB |
| 简单键值存储 | 过度设计 | localStorage / IndexedDB |

---

## 📋 推荐实现优先级

| 优先级 | 场景 | 理由 | 预估工作量 |
|--------|------|------|-----------|
| **P0** | 插件处理大文件的临时缓存 | 直接解决性能痛点 | 2-3 天 |
| **P1** | 大分析结果缓存 | 提升重开体验 | 1-2 天 |
| **P2** | AI Agent 工作目录 | 支持 Agent 高级功能 | 3-5 天 |
| **P3** | 文件索引 | 搜索优化 | 5+ 天 |

---

## 🔧 实现注意事项

### 1. 浏览器兼容性检查

```typescript
export function isOFPSSupported(): boolean {
  return 'getDirectory' in navigator.storage
}

// 使用前检查
if (!isOFPSSupported()) {
  // 降级到 IndexedDB
  return useIndexedDBFallback()
}
```

### 2. 错误处理

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

### 3. 存储配额管理

```typescript
async function checkOPFSQuota(): Promise<{ usage: number; quota: number }> {
  const estimate = await navigator.storage.estimate()
  return {
    usage: estimate.usage || 0,
    quota: estimate.quota || 0
  }
}

// 使用示例
const { usage, quota } = await checkOPFSQuota()
if (usage / quota > 0.9) {
  console.warn('OPFS quota almost full, consider cleanup')
}
```

### 4. 清理策略

```typescript
class OPFSCacheManager {
  // 清理过期缓存
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

  // 清空所有缓存
  async clearAll(): Promise<void> {
    // 注意：这会删除 OPFS 中的所有文件
    // 更安全的做法是只删除特定前缀的文件
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

## 📚 参考资源

- [MDN - Origin Private File System](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API#Origin_private_file_system)
- [Chrome Developers - File System Access API](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access)
- [web.dev - The File System Access API](https://web.dev/file-system-access/)

---

## 📄 相关文档

- [架构概览](./overview.md) - 整体架构设计
- [开发环境搭建](../development/setup.md) - 开发环境配置
