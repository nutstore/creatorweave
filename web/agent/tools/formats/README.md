# Format Registry — 添加新文件格式支持指南

## 概述

Format Registry 是一个可插拔的文件格式处理框架。只需实现一个 handler 并注册，**read / write / edit 三个工具自动获得对该格式的支持**——无需修改任何工具代码。

```
┌──────────┐     getFormatHandler(path)     ┌──────────────────┐
│ read.tool │ ────────────────────────────── │ FormatHandler     │
 │ edit.tool │ ────────────────────────────── │  .read()         │
│write.tool │ ────────────────────────────── │  .write()        │
└──────────┘                                 └──────────────────┘
                                                     ▲
                                                     │ registerFormatHandler()
                                             ┌───────┴────────┐
                                             │ formats/nol.ts  │ ← 你写的 handler
                                             │ formats/zip.ts  │
                                             │ formats/xxx.ts  │
                                             └────────────────┘
```

## 核心接口

```typescript
// format-registry.ts

interface FormatHandler {
  extension: string          // 小写，无点号，如 'nol'
  label: string              // 人类可读名称，如 'Outline Notes'
  binaryMode?: boolean       // true → 工具以 binary 模式读取文件（默认 true）

  // 必须：读取并渲染为文本
  read(data: ArrayBuffer | Uint8Array, path: string): Promise<FormatReadResult>

  // 可选：将文本内容编码为二进制
  write?(content: string, path: string, context: FormatWriteContext): Promise<ArrayBuffer>
}
```

### 关键设计原则

**Read/Write 格式必须对称**：`read()` 输出的文本格式，必须能直接传给 `write()` 使用。这样 LLM 的 edit 工作流（read → 替换文本 → write/edit 回写）才能无缝运作。

## 快速开始：3 步添加新格式

### 第 1 步：创建 handler 文件

在 `formats/` 目录下新建文件，例如 `formats/docx.ts`：

```typescript
import type { FormatHandler, FormatReadResult, FormatWriteContext } from '../format-registry'

export const docxHandler: FormatHandler = {
  extension: 'docx',
  label: 'Word Document',
  binaryMode: true,   // docx 是 ZIP 包，需要 binary 模式

  async read(data: ArrayBuffer | Uint8Array, path: string): Promise<FormatReadResult> {
    // 1. 解析二进制数据（这里用 fflate 解压 ZIP）
    // 2. 提取内容，渲染为纯文本
    // 3. 返回 { content: '渲染后的文本', kind: 'docx' }
    const text = '...解析后的文本内容...'
    return { content: text, kind: 'docx' }
  },

  // 如果只需要只读支持，可以不实现 write
  async write(content: string, path: string, context: FormatWriteContext): Promise<ArrayBuffer> {
    // 1. 解析 content（LLM 输出的文本）
    // 2. 构建二进制数据
    // 3. 返回 ArrayBuffer
    return new ArrayBuffer(0)
  },
}
```

### 第 2 步：注册 handler

在 `formats/index.ts` 中添加：

```typescript
import { registerFormatHandler } from '../format-registry'
import { nolHandler } from './nol'
import { zipHandler } from './zip'
import { docxHandler } from './docx'   // ← 新增

registerFormatHandler(nolHandler)
registerFormatHandler(zipHandler)
registerFormatHandler(docxHandler)     // ← 新增
```

### 第 3 步：完成

不需要修改 `read.tool.ts`、`write.tool.ts` 或 `file-edit.tool.ts`。三个工具会自动：
- **read**：检测到 handler → binary 模式读取 → 调用 `handler.read()` → 返回文本
- **write**：检测到 handler 有 `write()` → 调用 `handler.write()` → 写入二进制
- **edit**：检测到 handler → `handler.read()` 解码 → 文本替换 → `handler.write()` 编码回写

## FormatWriteContext 详解

`write()` 方法接收一个 context 对象，提供外部资源访问能力：

```typescript
interface FormatWriteContext {
  workspaceId?: string | null

  // 从 assets 目录读取文件（用户上传的图片等）
  readAsset?(assetPath: string): Promise<Uint8Array | null>

  // 从 workspace 读取文件（OPFS 或磁盘上的任意文件）
  readWorkspaceFile?(filePath: string): Promise<Uint8Array | null>

  // 读取正在被写入的文件的原始内容（写入前版本）
  // 用于 read→edit→write 回环时保留未修改的嵌入资源
  readOriginalFile?(): Promise<Uint8Array | null>
}
```

### 使用场景

| 回调 | 场景 | 示例 |
|------|------|------|
| `readAsset` | LLM 引用用户上传的图片 | `![](vfs://assets/photo.png)` |
| `readWorkspaceFile` | LLM 引用项目中的文件 | `![](creatorweave/web/img.png)` |
| `readOriginalFile` | 保留原文件中未修改的嵌入资源 | read→edit→write 时保留原有图片 |

## 参考实现：NOL（怡氧大纲笔记）

NOL 是一个完整的 read + write 实现，展示了所有关键模式：

### 文件结构

```
.nol = ZIP archive
  ├── data          ← JSON: { version, nodes, rootNodeIds }
  └── media/
      ├── image-uuid1.jpg
      └── image-uuid2.jpg
```

### Read/Write 格式对称

Read 输出 **缩进文本大纲**，Write 接受完全相同的格式：

```
Project Dashboard - Q2 2025
  - Revenue Overview
    ![](media/image-uuid1.jpg)
    - Revenue exceeded target by 15%
    - Strong growth in APAC region
  - Team Updates
    ![](vfs://assets/new-photo.png)
    - New hire starting next week
```

### 图片引用的三种路径

| 语法 | 来源 | Write 处理方式 |
|------|------|----------------|
| `![](media/xxx.jpg)` | 原 ZIP 内部 | `readOriginalFile()` → 从原 ZIP 提取 → 重新嵌入 |
| `![](vfs://assets/xxx.png)` | Assets 目录 | `readAsset()` → 读取 → 嵌入新 ZIP |
| `![](workspace/path/xxx.png)` | Workspace 文件 | `readWorkspaceFile()` → 读取 → 嵌入新 ZIP |

### FormatWriteError（渐进式提示）

当 LLM 输入格式不正确时，抛出 `FormatWriteError`，工具会返回 `hint` 字段引导 LLM 修正：

```typescript
throw new FormatWriteError(
  'JSON input is not supported for .nol files.',
  'Use the same indented outline text format that read() outputs:\n\n'
  + 'Title\n'
  + '  - Child item\n'
  + '    - Nested item'
)
```

## 只读 Handler（Read-Only）

如果格式只需要读取（如 `.zip`），只需实现 `read()`：

```typescript
export const zipHandler: FormatHandler = {
  extension: 'zip',
  label: 'ZIP Archive',
  binaryMode: true,

  async read(data, path): Promise<FormatReadResult> {
    // 解压、列出文件、返回文本摘要
    return { content: '...', kind: 'zip' }
  },

  // 不实现 write → write/edit 工具会走普通文本路径
}
```

## 工具集成细节（无需修改，仅供参考）

### read.tool.ts

```
path → getFormatHandler(path)
  → handler 存在且 binaryMode
    → backend.readFile(path, { encoding: 'binary' })
    → handler.read(binaryData, path)
    → 返回 FormatReadResult.content
  → handler 不存在
    → backend.readFile(path) [text 模式]
    → 返回普通文本
```

### write.tool.ts

```
content + path → getFormatHandler(path)
  → handler.write 存在
    → 构建 FormatWriteContext (readAsset, readWorkspaceFile, readOriginalFile)
    → handler.write(content, path, context) → ArrayBuffer
    → backend.writeFile(path, binaryData)
  → handler.write 不存在
    → backend.writeFile(path, content) [文本模式]
```

### file-edit.tool.ts

```
path → getFormatHandler(path)
  → handler.read 存在
    → backend.readFile(path, { encoding: 'binary' })
    → handler.read(binaryData, path) → text
  → handler.read 不存在
    → backend.readFile(path) → text

  [文本替换]

  → handler.write 存在
    → handler.write(updatedText, path, context) → binaryData
    → backend.writeFile(path, binaryData)
  → handler.write 不存在
    → backend.writeFile(path, updatedText) [文本模式]
```

## 添加新格式的检查清单

- [ ] 创建 `formats/xxx.ts`，实现 `FormatHandler`
- [ ] `extension` 小写、无点号
- [ ] `read()` 返回人类可读的文本（LLM 直接消费）
- [ ] 如有 `write()`：确保 read 输出 = write 输入（格式对称）
- [ ] 如有嵌入资源（图片等）：利用 `FormatWriteContext` 的三个回调
- [ ] 输入格式错误时用 `FormatWriteError` 提供渐进提示
- [ ] 在 `formats/index.ts` 中 `registerFormatHandler()`
- [ ] 测试 read → edit → write 回环
- [ ] 测试资源保留（图片等不被丢失）
