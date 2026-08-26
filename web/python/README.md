# Pyodide Worker

运行 Python 代码的 Web Worker,使用 Pyodide 在浏览器中执行 Python。

## 功能特性

- ✅ **懒加载**: 首次使用时从 CDN 加载 Pyodide v0.25.0
- ✅ **文件系统**: 创建 `/mnt` 目录用于文件操作
- ✅ **包管理**: 按需加载 Python 包 (pandas, numpy, matplotlib, openpyxl)
- ✅ **输出捕获**: 捕获 stdout/stderr 以获取 print 输出
- ✅ **图像支持**: 自动收集 matplotlib 生成的图像
- ✅ **文件 I/O**: 支持从 `/mnt` 读取/写入文件
- ✅ **超时控制**: 防止长时间运行的代码阻塞 UI
- ✅ **类型安全**: 完整的 TypeScript 类型定义

## 使用方法

### 基本用法

```typescript
import { PyodideWorkerManager } from './python/manager'

const manager = new PyodideWorkerManager()

// 执行 Python 代码
const result = await manager.execute(`
import pandas as pd
import numpy as np

# 创建数据框
df = pd.DataFrame({
    'A': [1, 2, 3, 4, 5],
    'B': np.random.randn(5)
})

print(df)
df.sum().to_dict()
`)

if (result.success) {
  console.log('Result:', result.result)
  console.log('Stdout:', result.stdout)
  console.log('Execution time:', result.executionTime)
} else {
  console.error('Error:', result.error)
}
```

### 带文件输入

```typescript
const csvContent = new TextEncoder().encode('name,age\nAlice,30\nBob,25')

const result = await manager.execute(
  `
import pandas as pd

# 读取 /mnt 目录中的文件
df = pd.read_csv('/mnt/data.csv')
print(df.head())
df.to_dict('records')
  `,
  [{ name: 'data.csv', content: csvContent.buffer }]
)
```

### Matplotlib 图像

```typescript
const result = await manager.execute(
  `
import matplotlib.pyplot as plt
import numpy as np

# 创建图表
x = np.linspace(0, 2 * np.pi, 100)
y = np.sin(x)

plt.figure(figsize=(10, 6))
plt.plot(x, y)
plt.title('Sine Wave')
plt.xlabel('x')
plt.ylabel('sin(x)')
plt.grid(True)

# 保存图像到 /mnt
plt.savefig('/mnt/plot.png')
plt.close()
  `,
  [],
  ['matplotlib']
)

if (result.success && result.images) {
  // 显示图像
  result.images.forEach((img) => {
    const imgElement = document.createElement('img')
    imgElement.src = `data:image/png;base64,${img.data}`
    document.body.appendChild(imgElement)
  })
}
```

### 包管理

```typescript
// 按需加载包
const result = await manager.execute(
  `
import pandas as pd
import numpy as np
from openpyxl import Workbook

# 使用加载的包
df = pd.DataFrame(np.random.randn(10, 4))
df.describe()
  `,
  [], // 无文件输入
  ['pandas', 'numpy', 'openpyxl'] // 指定需要的包
)
```

## API

### `PyodideWorkerManager`

#### 构造函数

```typescript
constructor(workerUrl?: string)
```

- `workerUrl`: 可选,worker 文件的 URL。默认为 `'./python/worker.ts'`

#### 方法

##### `execute(code: string, files?: FileRef[], packages?: string[], timeout?: number): Promise<ExecuteResult>`

执行 Python 代码。

**参数:**

- `code`: 要执行的 Python 代码 (字符串)
- `files`: 可选,要注入到 `/mnt` 目录的文件数组
- `packages`: 可选,要加载的 Python 包数组 (例如 `['pandas', 'numpy']`)
- `timeout`: 可选,超时时间(毫秒),默认 30000 (30秒)

**返回:** `Promise<ExecuteResult>`

##### `terminate(): void`

终止 worker 线程并释放资源。

##### `isReady(): boolean`

检查 worker 是否已初始化并准备好执行代码。

### 类型定义

#### `FileRef`

```typescript
interface FileRef {
  name: string // 文件名
  content: ArrayBuffer // 文件内容
}
```

#### `FileOutput`

```typescript
interface FileOutput {
  name: string // 文件名
  content: ArrayBuffer // 文件内容
}
```

#### `ImageOutput`

```typescript
interface ImageOutput {
  filename: string // 图像文件名
  data: string // base64 编码的图像数据
}
```

#### `ExecuteResult`

```typescript
interface ExecuteResult {
  success: boolean // 执行是否成功
  result?: unknown // 返回值 (最后一个表达式的结果)
  stdout?: string // 标准输出
  stderr?: string // 标准错误
  images?: ImageOutput[] // 生成的图像数组
  outputFiles?: FileOutput[] // 输出文件数组
  executionTime: number // 执行时间(毫秒)
  error?: string // 错误信息
}
```

## 技术细节

### Worker 协议

Worker 使用以下消息协议与主线程通信:

**输入消息:**

```typescript
{
  id: string
  type: 'execute'
  code: string
  files?: FileRef[]
  packages?: string[]
  timeout?: number
}
```

**输出消息:**

```typescript
{
  id: string
  success: boolean
  result: ExecuteResult
}
```

### 文件系统

Worker 创建一个 MEMFS 文件系统挂载在 `/mnt`:

- **输入文件**: 在执行前注入到 `/mnt`
- **输出文件**: 执行后从 `/mnt` 收集
- **图像**: matplotlib 保存到 `/mnt` 的图像自动转换为 base64

### 包管理

支持的 Python 包 (通过 Pyodide):

- `pandas` - 数据分析和操作
- `numpy` - 科学计算
- `matplotlib` - 数据可视化
- `openpyxl` - Excel 文件操作
- `scipy` - 科学计算
- `scikit-learn` - 机器学习
- 其他 Pyodide 支持的包

### 超时处理

默认超时 30 秒。超时后 worker 会终止执行并返回错误:

```typescript
{
  success: false,
  error: "Execution timeout after 30000ms"
}
```

## 错误处理

Worker 会捕获并返回所有 Python 错误:

```typescript
const result = await manager.execute('1 / 0')

if (!result.success) {
  console.error('Python error:', result.error)
  // 输出:
  // Python error: division by zero
  //
  // Traceback (most recent call last):
  //   File "<exec>", line 1, in <module>
  // ZeroDivisionError: division by zero
}
```

## 性能考虑

1. **初始化时间**: 首次加载 Pyodide 需要几秒钟
2. **包加载**: 每个包首次加载需要额外时间
3. **内存使用**: Pyodide 需要 ~50-100MB 基础内存
4. **执行速度**: 比 CPython 慢 2-10x (取决于操作)

## 最佳实践

### 1. 复用 Worker 实例

```typescript
// ✅ 好 - 复用实例
const manager = new PyodideWorkerManager()
await manager.execute('print("first")')
await manager.execute('print("second")')

// ❌ 差 - 每次创建新实例
await new PyodideWorkerManager().execute('print("first")')
await new PyodideWorkerManager().execute('print("second")')
```

### 2. 预加载常用包

```typescript
// 在应用初始化时预加载
await manager.execute('', [], ['pandas', 'numpy', 'matplotlib'])
```

### 3. 处理大文件

```typescript
// 对于大文件,考虑使用流或分块处理
const largeFile = await fetchLargeFile()
const chunk = processChunk(largeFile)
await manager.execute(code, [{ name: 'chunk.csv', content: chunk }])
```

### 4. 清理资源

```typescript
// 使用完毕后终止 worker
manager.terminate()
```

## 浏览器兼容性

- ✅ Chrome 90+
- ✅ Firefox 88+
- ✅ Safari 14.1+
- ✅ Edge 90+

需要支持:

- Web Workers
- SharedArrayBuffer (需要 `Cross-Origin-Opener-Policy` 和 `Cross-Origin-Embedder-Policy` headers)
- BigInt
- 异步迭代器

## 故障排除

### Pyodide 加载失败

检查 CDN 可访问性:

```typescript
// 尝试手动访问
const response = await fetch('https://cdn.jsdelivr.net/pyodide/v0.25.0/full/pyodide.js')
console.log(response.ok) // 应该为 true
```

### SharedArrayBuffer 不可用

确保服务器设置了正确的 headers:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

### 内存不足

增加内存限制 (在 Vite 配置中):

```javascript
// vite.config.ts
export default {
  worker: {
    format: 'es',
    plugins: () => [],
  },
}
```

## 参考

- [Pyodide 文档](https://pyodide.org/en/stable/)
- [Pyodide API](https://pyodide.org/en/stable/usage/api.html)
- [Pyodide 包列表](https://pyodide.org/en/stable/usage/packages-in-pyodide.html)
