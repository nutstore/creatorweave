# File Bridge Layer - 文件桥接层

## 概述

文件桥接层负责在浏览器文件系统/OPFS 和 Pyodide 虚拟文件系统之间传输文件。

## 架构

```
Browser Files (File System API / OPFS)
    ↓
FileRef[] (文件引用)
    ↓
Pyodide FS (/mnt)
    ↓
Output Files
    ↓
OPFS (持久化存储)
```

## 核心模块

### 1. `types.ts` - 类型定义

定义了文件桥接层使用的所有核心类型:

- **FileRef**: 文件引用,表示来自浏览器的文件
- **PyodideFileMeta**: Pyodide 文件系统中的文件元数据
- **BridgeResult**: 桥接操作结果
- **PyodideInstance**: Pyodide 实例类型定义

### 2. `constants.ts` - 配置常量

定义了所有配置常量:

- **PYODIDE_BASE_URL**: Pyodide 本地文件路径 (`/assets/pyodide`)
- **DEFAULT_TIMEOUT**: 执行超时时间(3分钟)
- **MOUNT_POINT**: 虚拟文件系统挂载点 (`/mnt`)
- **MAX_FILE_SIZE**: 最大文件大小(50MB)
- **PYTHON_PACKAGES**: 可用的 Python 包

### 3. `files.ts` - 文件操作工具

提供了所有文件操作的底层工具函数:

#### 文件读取

- `readFileFromHandle(handle)`: 从 File System API 读取文件
- `readFileFromOPFS(path)`: 从 OPFS 读取文件
- `validateFileSize(file)`: 验证文件大小

#### Pyodide 文件系统操作

- `injectFile(pyodide, file)`: 将文件注入到 Pyodide FS
- `readFileFromPyodide(pyodide, filename)`: 从 Pyodide FS 读取文件
- `listPyodideFiles(pyodide)`: 列出 Pyodide /mnt 中的所有文件

#### 工具函数

- `fileToFileRef(file, basePath)`: 将浏览器 File 对象转换为 FileRef
- `readFileAsBinary(file)`: 以二进制方式读取文件
- `isTextFile(filename)`: 判断文件是否为文本文件

### 4. `bridge.ts` - 主桥接 API

提供了高级桥接 API:

- `getActiveFiles()`: 获取用户当前激活的文件
- `bridgeFilesToPyodide(files, pyodide)`: 将浏览器文件桥接到 Pyodide
- `bridgeOutputFiles(pyodide, files?)`: 将 Pyodide 输出文件桥接回 OPFS
- `clearPyodideFiles(pyodide)`: 清空 Pyodide /mnt 目录
- `getPyodideFileStats(pyodide)`: 获取 Pyodide 文件统计信息

## 使用示例

### 示例 1: 将项目文件注入到 Pyodide

```typescript
import { getActiveFiles, bridgeFilesToPyodide } from '@/python'

// 获取用户当前激活的文件
const files = await getActiveFiles()

// 注入到 Pyodide
await bridgeFilesToPyodide(files, pyodide)
```

### 示例 2: 从 Pyodide 读取输出文件

```typescript
import { bridgeOutputFiles } from '@/python'

// 将所有输出文件桥接回 OPFS
await bridgeOutputFiles(pyodide)

// 或者只桥接特定文件
await bridgeOutputFiles(pyodide, ['output.txt', 'result.csv'])
```

### 示例 3: 手动处理单个文件

```typescript
import { injectFile, readFileFromPyodide } from '@/python'

// 注入单个文件
const fileRef: FileRef = {
  path: 'src/data.csv',
  name: 'data.csv',
  content: 'name,value\nAlice,42\n',
  contentType: 'text',
  size: 25,
}
injectFile(pyodide, fileRef)

// 读取文件
const content = readFileFromPyodide(pyodide, 'src/data.csv')
console.log(content)
```

## 与现有系统的集成

### 与 OPFS 系统集成

文件桥接层完全集成了现有的 OPFS 会话系统:

- 使用 `WorkspaceFiles` 读取缓存文件
- 使用 `useAgentStore` 获取目录句柄
- 使用 `useWorkspaceStore` 获取当前工作空间

### 与文件系统集成

- 使用 `traversal.service` 遍历目录
- 使用 `file-discovery.service` 搜索文件
- 支持文件系统 API 和 OPFS 两种来源

## 错误处理

所有函数都包含完整的错误处理:

- 文件大小验证(最大 50MB)
- 文件不存在错误
- OPFS 访问错误
- Pyodide FS 操作错误

错误信息会被记录到控制台,并向上层抛出包含详细信息的 Error 对象。

## 性能考虑

- 文件读取操作使用 OPFS 缓存优先策略
- 大文件会被拒绝,防止内存溢出
- 批量文件操作会并行处理
- 二进制文件使用 Uint8Array 高效处理

## 测试

单元测试位于 `src/python/__tests__/file-bridge.test.ts`:

```bash
npm test -- file-bridge
```

测试覆盖:

- 文件大小验证
- 文本文件识别
- File 对象转换
- Pyodide 集成
