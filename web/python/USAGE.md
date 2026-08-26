# Pyodide Worker - 快速开始指南

Pyodide Worker 提供了在浏览器中执行 Python 代码的能力,通过 Web Worker 实现非阻塞执行。

## 快速开始

### 1. 基本使用

```typescript
import { PyodideWorkerManager } from '@/python'

// 创建 manager 实例
const manager = new PyodideWorkerManager()

// 执行 Python 代码
const result = await manager.execute(`
x = 10
y = 20
print(f"计算结果: {x + y}")
x + y  # 返回值
`)

if (result.success) {
  console.log('结果:', result.result) // 30
  console.log('输出:', result.stdout) // "计算结果: 30"
  console.log('耗时:', result.executionTime) // 毫秒
} else {
  console.error('错误:', result.error)
}

// 清理
manager.terminate()
```

### 2. 使用 Pandas

```typescript
const result = await manager.execute(
  `
import pandas as pd
import numpy as np

# 创建数据框
df = pd.DataFrame({
    '产品': ['A', 'B', 'C'],
    '销量': [100, 150, 200],
    '价格': [10.5, 20.3, 15.8]
})

print(df)
df.sum()['销量']
  `,
  [], // 无输入文件
  ['pandas', 'numpy'] // 需要加载的包
)
```

### 3. 文件操作

```typescript
import { createTextFile } from '@/python'

// 创建输入文件
const csvFile = createTextFile(
  'data.csv',
  `
姓名,年龄,城市
张三,25,北京
李四,30,上海
王五,28,深圳
`
)

const result = await manager.execute(
  `
import pandas as pd

# 读取文件
df = pd.read_csv('/mnt/data.csv')
print(f"数据行数: {len(df)}")

# 处理数据
df['年龄加倍'] = df['年龄'] * 2

# 保存输出文件
df.to_csv('/mnt/output.csv', index=False)

df.to_dict('records')
  `,
  [csvFile], // 注入文件
  ['pandas'] // 需要的包
)

// 获取输出文件
if (result.outputFiles) {
  result.outputFiles.forEach((file) => {
    console.log(`输出文件: ${file.name}`)
    // 下载文件
    downloadFileOutput(file)
  })
}
```

### 4. Matplotlib 图表

```typescript
const result = await manager.execute(
  `
import matplotlib.pyplot as plt
import numpy as np

# 创建数据
x = np.linspace(0, 10, 100)
y = np.sin(x)

# 创建图表
plt.figure(figsize=(10, 6))
plt.plot(x, y, linewidth=2)
plt.title('正弦波')
plt.xlabel('x')
plt.ylabel('sin(x)')
plt.grid(True)

# 保存图表
plt.savefig('/mnt/plot.png', dpi=100)
plt.close()

"图表已生成"
  `,
  [],
  ['matplotlib', 'numpy']
)

// 显示图表
if (result.images && result.images.length > 0) {
  result.images.forEach(img => {
    const imgElement = document.createElement('img')
    imgElement.src = \`data:image/png;base64,\${img.data}\`
    document.body.appendChild(imgElement)
  })
}
```

### 5. 错误处理

```typescript
const result = await manager.execute(`
# 这会引发错误
x = 1 / 0
`)

if (!result.success) {
  console.error('执行失败:', result.error)
  // 错误信息包含完整的 Python traceback
}
```

## API 参考

### `PyodideWorkerManager`

#### `execute(code, files?, packages?, timeout?)`

执行 Python 代码。

**参数:**

- `code` (string): Python 代码
- `files` (FileRef[], 可选): 注入到 `/mnt` 的文件
- `packages` (string[], 可选): 需要加载的 Python 包
- `timeout` (number, 可选): 超时时间(毫秒),默认 30000

**返回:** `Promise<ExecuteResult>`

#### `isReady()`

检查 worker 是否已准备就绪。

**返回:** `boolean`

#### `terminate()`

终止 worker 并释放资源。

#### `restart()`

重启 worker。

### `ExecuteResult`

```typescript
interface ExecuteResult {
  success: boolean // 是否成功
  result?: unknown // 返回值
  stdout?: string // 标准输出
  stderr?: string // 标准错误
  images?: ImageOutput[] // 生成的图像
  outputFiles?: FileOutput[] // 输出文件
  executionTime: number // 执行时间(毫秒)
  error?: string // 错误信息
}
```

## 实用工具

### `createTextFile(name, content)`

创建文本文件。

```typescript
const file = createTextFile('data.txt', 'Hello, World!')
```

### `downloadFileOutput(file, filename?)`

下载输出文件。

```typescript
downloadFileOutput(outputFile, 'output.csv')
```

## 支持的 Python 包

常用的 Pyodide 包:

- `pandas` - 数据分析
- `numpy` - 科学计算
- `matplotlib` - 数据可视化
- `scipy` - 科学计算
- `scikit-learn` - 机器学习
- `openpyxl` - Excel 操作

完整列表: https://pyodide.org/en/stable/usage/packages-in-pyodide.html

## 最佳实践

### 1. 复用 Worker 实例

```typescript
// ✅ 好
const manager = new PyodideWorkerManager()
await manager.execute('print("Task 1")')
await manager.execute('print("Task 2")')

// ❌ 差
await new PyodideWorkerManager().execute('print("Task 1")')
await new PyodideWorkerManager().execute('print("Task 2")')
```

### 2. 预加载包

```typescript
// 在应用启动时预加载
await manager.execute('', [], ['pandas', 'numpy', 'matplotlib'])
```

### 3. 适时清理资源

```typescript
try {
  const result = await manager.execute(code)
  // 处理结果
} finally {
  manager.terminate()
}
```

### 4. 处理超时

```typescript
const result = await manager.execute(
  code,
  [],
  [],
  5000 // 5秒超时
)
```

## 完整示例

```typescript
import { PyodideWorkerManager, createTextFile } from '@/python'

async function analyzeSales() {
  const manager = new PyodideWorkerManager()

  try {
    // 准备数据
    const salesData = createTextFile(
      'sales.csv',
      `
产品,Q1,Q2,Q3,Q4
A,100,120,110,130
B,80,90,85,95
C,150,160,155,170
    `
    )

    // 执行分析
    const result = await manager.execute(
      `
import pandas as pd
import matplotlib.pyplot as plt

# 读取数据
df = pd.read_csv('/mnt/sales.csv')

# 计算统计信息
df['总计'] = df[['Q1', 'Q2', 'Q3', 'Q4']].sum(axis=1)
print("销售统计:")
print(df)

# 创建图表
plt.figure(figsize=(10, 6))
for idx, row in df.iterrows():
    plt.plot(['Q1', 'Q2', 'Q3', 'Q4'],
             row[['Q1', 'Q2', 'Q3', 'Q4']],
             marker='o',
             label=row['产品'])

plt.title('季度销售趋势')
plt.xlabel('季度')
plt.ylabel('销售额')
plt.legend()
plt.grid(True)
plt.savefig('/mnt/sales_chart.png', dpi=120)
plt.close()

df.to_dict('records')
      `,
      [salesData],
      ['pandas', 'matplotlib', 'numpy']
    )

    // 处理结果
    if (result.success) {
      console.log('分析结果:', result.result)
      console.log('输出:', result.stdout)

      // 显示图表
      if (result.images && result.images.length > 0) {
        const img = document.createElement('img')
        img.src = `data:image/png;base64,${result.images[0].data}`
        document.getElementById('chart-container')!.appendChild(img)
      }
    }
  } finally {
    manager.terminate()
  }
}
```

## 故障排除

### Pyodide 加载失败

确保 CDN 可访问:

```typescript
// 测试连接
const response = await fetch('https://cdn.jsdelivr.net/pyodide/v0.25.0/full/pyodide.js')
console.log('CDN 可用:', response.ok)
```

### 内存不足

对于大型数据集,考虑:

- 减少数据量
- 分批处理
- 使用更高效的数据结构

### 超时问题

增加超时时间:

```typescript
const result = await manager.execute(code, [], [], 60000) // 60秒
```

## 更多示例

查看 `example.ts` 文件获取更多示例:

- 基本执行
- Pandas 数据分析
- 文件 I/O
- Matplotlib 可视化
- 错误处理
- 性能优化
